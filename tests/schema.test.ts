import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFile } from 'node:fs/promises'
import { applyPortalSchema } from '../lib/db/migrate'
import { reportDatabaseFailure } from '../lib/db/diagnostics'
import * as schema from '../lib/db/schema'

test('current schema repairs missing tables, preserves legacy rows, and is repeatable', async () => {
  const db = new PGlite()
  try {
    await db.exec(
      await readFile(new URL('../scripts/schema.sql', import.meta.url), 'utf8'),
    )
    await db.query(
      `INSERT INTO cb_users(id,name,email,role,password_hash) VALUES ('00000000-0000-4000-8000-000000000001','Legacy','legacy@example.test','manager','untouched')`,
    )
    await assert.rejects(
      () => db.query('SELECT name FROM products'),
      /does not exist/,
    )
    assert.equal(await applyPortalSchema(db), 12)
    const orm = drizzle(db, { schema })
    // The exact query shapes that failed on the storefront and auth session path.
    assert.deepEqual(await orm.select().from(schema.products), [])
    assert.deepEqual(await orm.select().from(schema.session), [])
    await orm.insert(schema.user).values({
      id: 'test-user',
      name: 'Preserved',
      email: 'preserved@example.test',
      role: 'manager',
      username: 'preserved',
    })
    await orm.insert(schema.products).values({
      id: 'test-item',
      userId: 'test-user',
      name: 'Tea',
      sku: 'TEA',
      segment: 'cafe',
      category: 'Coffee',
      price: '4.50',
    })
    assert.equal(await applyPortalSchema(db), 12)
    assert.equal((await orm.select().from(schema.products))[0].name, 'Tea')
    assert.equal((await orm.select().from(schema.user))[0].role, 'manager')
    await orm.insert(schema.orders).values({
      id: 'first-order',
      userId: 'test-user',
      segment: 'cafe',
      paymentMethod: 'cash',
      subtotal: '4.50',
      total: '4.50',
    })
    await applyPortalSchema(db)
    await orm.insert(schema.orders).values({
      id: 'second-order',
      userId: 'test-user',
      segment: 'cafe',
      paymentMethod: 'cash',
      subtotal: '4.50',
      total: '4.50',
    })
    assert.deepEqual(
      (await orm.select().from(schema.orders))
        .map((order) => order.orderNumber)
        .sort(),
      [1, 2],
    )
    assert.equal(
      (
        await db.query<{ password_hash: string }>(
          'SELECT password_hash FROM cb_users',
        )
      ).rows[0].password_hash,
      'untouched',
    )
  } finally {
    await db.close()
  }
})

test('adds missing current-schema columns without overwriting accounts', async () => {
  const db = new PGlite()
  try {
    await applyPortalSchema(db)
    await db.query(
      `INSERT INTO "user" (id,name,email) VALUES ('u','Existing','existing@example.test')`,
    )
    await db.query('ALTER TABLE "user" DROP COLUMN "approvedAt"')
    await db.query('ALTER TABLE "user" DROP COLUMN "creditLimit"')
    await applyPortalSchema(db)
    const result = await db.query<{
      name: string
      creditLimit: string
      approvedAt: null
    }>('SELECT name,"creditLimit","approvedAt" FROM "user"')
    assert.deepEqual(result.rows, [
      { name: 'Existing', creditLimit: '0.00', approvedAt: null },
    ])
  } finally {
    await db.close()
  }
})

test('incompatible populated schema rolls back rather than deleting data', async () => {
  const db = new PGlite()
  try {
    await db.exec(
      "CREATE TABLE products (id text PRIMARY KEY); INSERT INTO products(id) VALUES ('preserve-me')",
    )
    await assert.rejects(() => applyPortalSchema(db))
    assert.deepEqual((await db.query('SELECT * FROM products')).rows, [
      { id: 'preserve-me' },
    ])
    assert.equal(
      (
        await db.query<{ name: string | null }>(
          "SELECT to_regclass('public.account') AS name",
        )
      ).rows[0].name,
      null,
    )
  } finally {
    await db.close()
  }
})

test('database diagnostics log safe nested error codes only', () => {
  const saved = console.error
  const entries: string[] = []
  console.error = (...args: unknown[]) => {
    entries.push(args.join(' '))
  }
  try {
    reportDatabaseFailure('storefront', {
      message: 'private connection string',
      cause: { code: '42P01', detail: 'private user data' },
    })
    assert.match(entries[0], /42P01/)
    assert.doesNotMatch(entries[0], /private/)
  } finally {
    console.error = saved
  }
})
