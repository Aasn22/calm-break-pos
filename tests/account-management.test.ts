import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { PGlite } from '@electric-sql/pglite'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import * as schema from '../lib/db/schema'
import { applyPortalSchema } from '../lib/db/migrate'
import { accountManagement } from '../lib/server/account-management'

async function fixture() {
  const pg = new PGlite()
  await applyPortalSchema(pg)
  const db = drizzle(pg, { schema }),
    service = accountManagement(db as unknown as NodePgDatabase<typeof schema>)
  const password = randomBytes(24).toString('hex')
  await db.insert(schema.user).values([
    {
      id: 'admin',
      name: 'Administrator',
      email: 'admin@example.test',
      username: 'admin',
      role: 'admin',
      isApproved: true,
    },
    {
      id: 'manager',
      name: 'Manager',
      email: 'manager@example.test',
      username: 'manager',
      role: 'manager',
      isApproved: true,
    },
    {
      id: 'cashier',
      name: 'Cashier',
      email: 'cashier@example.test',
      username: 'cashier',
      role: 'cashier',
      isApproved: true,
    },
    {
      id: 'customer',
      name: 'Customer',
      email: 'customer@example.test',
      username: 'kv0001',
      employeeId: 'KV0001',
      role: 'customer',
      isApproved: false,
    },
    {
      id: 'outside',
      name: 'Other workspace',
      email: 'outside@example.test',
      username: 'outside',
      workspaceId: 'other',
      role: 'admin',
      isApproved: true,
    },
  ])
  const hash = await hashPassword(password)
  for (const id of ['admin', 'manager', 'cashier', 'customer', 'outside'])
    await db.insert(schema.account).values({
      id: `credential-${id}`,
      accountId: id,
      userId: id,
      providerId: 'credential',
      password: hash,
    })
  const draft = {
    name: 'Customer Updated',
    username: 'kv0001',
    employeeId: 'KV0001',
    role: 'customer',
    isApproved: true,
    creditLimit: 25,
    monthlyDeductionLimit: 50,
  }
  return { pg, db, service, password, draft }
}

test('admin sees team AND customers while ordinary/manager/other workspace identities cannot manage accounts', async () => {
  const f = await fixture()
  try {
    const rows = await f.service.list('admin')
    assert.equal(rows.length, 4)
    assert.ok(rows.some((r) => r.id === 'customer'))
    assert.ok(rows.every((r) => !('password' in r)))
    for (const actor of [
      'manager',
      'cashier',
      'customer',
      'outside',
      'unknown',
    ]) {
      await assert.rejects(() => f.service.list(actor), /Administrator/)
      await assert.rejects(
        () =>
          f.service.mutate(
            actor,
            'edit',
            { ...f.draft, id: 'customer' },
            f.password,
          ),
        /Administrator/,
      )
    }
    await assert.rejects(
      () =>
        f.service.mutate(
          'admin',
          'edit',
          { ...f.draft, id: 'outside' },
          f.password,
        ),
      /not found/,
    )
    await assert.rejects(
      () =>
        f.service.mutate(
          'admin',
          'edit',
          { ...f.draft, id: 'customer' },
          'incorrect',
        ),
      /password could not/,
    )
  } finally {
    await f.pg.close()
  }
})

test('admin edits, approves, suspends, changes roles/limits and revokes sessions without deleting history', async () => {
  const f = await fixture()
  try {
    await f.db.insert(schema.session).values({
      id: 's',
      token: 'private-test-token',
      userId: 'customer',
      expiresAt: new Date(Date.now() + 60000),
    })
    await f.service.mutate(
      'admin',
      'edit',
      { ...f.draft, id: 'customer' },
      f.password,
    )
    let [customer] = await f.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, 'customer'))
    assert.equal(customer.name, 'Customer Updated')
    assert.equal(customer.isApproved, true)
    assert.equal(customer.creditLimit, '25.00')
    assert.equal(customer.monthlyDeductionLimit, '50.00')
    assert.equal((await f.db.select().from(schema.session)).length, 0)
    await f.db.insert(schema.orders).values({
      id: 'order-history',
      userId: 'customer',
      customerUserId: 'customer',
      segment: 'cafe',
      paymentMethod: 'cash',
      subtotal: '5.00',
      total: '5.00',
    })
    await f.service.mutate(
      'admin',
      'edit',
      { ...f.draft, id: 'customer', role: 'chef', isApproved: false },
      f.password,
    )
    ;[customer] = await f.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, 'customer'))
    assert.equal(customer.role, 'chef')
    assert.equal(customer.isApproved, false)
    assert.equal((await f.db.select().from(schema.orders)).length, 1)
    await assert.rejects(
      () =>
        f.service.mutate(
          'customer',
          'edit',
          { ...f.draft, id: 'admin' },
          f.password,
        ),
      /Administrator/,
    )
  } finally {
    await f.pg.close()
  }
})

test('password reset uses Better Auth-compatible hashes, invalidates old password and all sessions', async () => {
  const f = await fixture()
  try {
    const next = randomBytes(24).toString('hex')
    const auth = betterAuth({
      database: drizzleAdapter(f.db, { provider: 'pg', schema }),
      secret: randomBytes(32).toString('hex'),
      baseURL: 'https://calm-break-pos.vercel.app',
      emailAndPassword: { enabled: true, minPasswordLength: 12 },
      rateLimit: { enabled: false },
    })
    await auth.api.signInEmail({
      body: { email: 'cashier@example.test', password: f.password },
    })
    assert.ok((await f.db.select().from(schema.session)).length)
    await f.service.mutate(
      'admin',
      'reset',
      { id: 'cashier', password: next, confirmation: next },
      f.password,
    )
    assert.equal((await f.db.select().from(schema.session)).length, 0)
    const [credential] = await f.db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, 'cashier'))
    assert.notEqual(credential.password, next)
    assert.equal(
      await verifyPassword({
        hash: credential.password!,
        password: f.password,
      }),
      false,
    )
    assert.equal(
      await verifyPassword({ hash: credential.password!, password: next }),
      true,
    )
    await assert.rejects(() =>
      auth.api.signInEmail({
        body: { email: 'cashier@example.test', password: f.password },
      }),
    )
    assert.ok(
      (
        await auth.api.signInEmail({
          body: { email: 'cashier@example.test', password: next },
        })
      ).user,
    )
    await assert.rejects(() =>
      f.service.mutate(
        'admin',
        'reset',
        { id: 'cashier', password: next, confirmation: 'different-password' },
        f.password,
      ),
    )
  } finally {
    await f.pg.close()
  }
})

test('protect self and last admin, reject duplicates and weak passwords, allow explicit admin account creation', async () => {
  const f = await fixture()
  try {
    const own = {
      ...f.draft,
      id: 'admin',
      username: 'admin',
      employeeId: '',
      role: 'admin',
      name: 'Administrator',
    }
    await assert.rejects(
      () =>
        f.service.mutate(
          'admin',
          'edit',
          { ...own, role: 'cashier' },
          f.password,
        ),
      /cannot suspend or demote/,
    )
    await assert.rejects(
      () =>
        f.service.mutate(
          'admin',
          'edit',
          { ...own, isApproved: false },
          f.password,
        ),
      /cannot suspend or demote/,
    )
    await assert.rejects(
      () =>
        f.service.mutate(
          'admin',
          'edit',
          { ...f.draft, id: 'customer', username: 'cashier' },
          f.password,
        ),
      /already in use/,
    )
    const create = {
      ...f.draft,
      name: 'Second Administrator',
      username: 'second.admin',
      employeeId: '',
      role: 'admin',
      password: randomBytes(24).toString('hex'),
    }
    await assert.rejects(() =>
      f.service.mutate(
        'admin',
        'create',
        { ...create, password: 'short' },
        f.password,
      ),
    )
    await f.service.mutate('admin', 'create', create, f.password)
    const [created] = await f.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.username, 'second.admin'))
    assert.equal(created.role, 'admin')
    const credential = (
      await f.db
        .select()
        .from(schema.account)
        .where(eq(schema.account.userId, created.id))
    )[0]
    assert.equal(
      await verifyPassword({
        hash: credential.password!,
        password: create.password,
      }),
      true,
    )
    await f.service.mutate(
      'admin',
      'edit',
      { ...own, id: created.id, username: 'second.admin', role: 'cashier' },
      f.password,
    )
    assert.equal((await f.service.list('admin')).length, 5)
    const selfChanged = await f.service.mutate(
      'admin',
      'edit',
      { ...own, name: 'Admin renamed' },
      f.password,
    )
    assert.equal(selfChanged.selfChanged, true)
  } finally {
    await f.pg.close()
  }
})

test('administrator reauthentication throttle persists and expires across requests', async () => {
  const f = await fixture()
  try {
    const db = f.db as unknown as NodePgDatabase<typeof schema>
    const { takeReauthenticationAttempt, clearReauthenticationAttempts } =
      await import('../lib/server/reauth-throttle')
    for (let i = 0; i < 10; i++)
      assert.equal(await takeReauthenticationAttempt(db, 'admin'), true)
    assert.equal(await takeReauthenticationAttempt(db, 'admin'), false)
    assert.equal(await takeReauthenticationAttempt(db, 'manager'), true)
    await f.db
      .update(schema.verification)
      .set({ expiresAt: new Date(Date.now() - 10000) })
      .where(eq(schema.verification.id, 'admin-account-reauth:admin'))
    assert.equal(await takeReauthenticationAttempt(db, 'admin'), true)
    await clearReauthenticationAttempts(db, 'admin')
    assert.equal(
      (
        await f.db
          .select()
          .from(schema.verification)
          .where(eq(schema.verification.id, 'admin-account-reauth:admin'))
      ).length,
      0,
    )
  } finally {
    await f.pg.close()
  }
})
