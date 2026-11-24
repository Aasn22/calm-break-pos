import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { applyPortalSchema } from '../lib/db/migrate'
import { createCounterOrder } from '../lib/server/counter-orders'
import { canAdvanceOrder } from '../lib/order-transitions'
import * as schema from '../lib/db/schema'

test('current POS saves mixed counter orders, decrements stock, enforces limits and rolls back failures', async () => {
  const pg = new PGlite()
  try {
    await applyPortalSchema(pg)
    const db = drizzle(pg, { schema })
    // Both drivers execute the same PostgreSQL Drizzle transaction/query API.
    const serviceDb = db as unknown as NodePgDatabase<typeof schema>
    await db.insert(schema.user).values([
      {
        id: 'operator',
        name: 'Operator',
        email: 'operator@example.test',
        role: 'cashier',
      },
      {
        id: 'staff',
        name: 'Staff',
        email: 'staff@example.test',
        username: 'team.staff',
        role: 'chef',
        creditLimit: '20.00',
        monthlyDeductionLimit: '20.00',
      },
      {
        id: 'customer',
        name: 'Customer',
        email: 'customer@example.test',
        username: 'customer',
        role: 'customer',
      },
    ])
    await db.insert(schema.products).values([
      {
        id: 'coffee',
        userId: 'operator',
        name: 'Coffee',
        sku: 'COFFEE',
        category: 'Coffee',
        segment: 'cafe',
        price: '4.50',
      },
      {
        id: 'water',
        userId: 'operator',
        name: 'Water',
        sku: 'WATER',
        category: 'Shop',
        segment: 'tuck_shop',
        price: '2.00',
        stock: 5,
      },
    ])
    const operator = { id: 'operator', role: 'cashier' }
    const mixed = {
      lines: [
        { productId: 'coffee', quantity: 2 },
        { productId: 'water', quantity: 1 },
      ],
      paymentMethod: 'cash',
      orderType: 'takeaway',
    }
    const saved = await createCounterOrder(serviceDb, operator, mixed)
    assert.equal(saved.ok, true)
    const orders = await db.select().from(schema.orders)
    assert.equal(orders.length, 1)
    assert.equal(orders[0].total, '11.00')
    assert.equal((await db.select().from(schema.orderItems)).length, 2)
    assert.equal(
      (await db.select().from(schema.products)).find((p) => p.id === 'water')!
        .stock,
      4,
    )
    const shortage = await createCounterOrder(serviceDb, operator, {
      ...mixed,
      lines: [{ productId: 'water', quantity: 10 }],
    })
    assert.equal(shortage.ok, false)
    assert.equal((await db.select().from(schema.orders)).length, 1)
    assert.equal(
      (await db.select().from(schema.products)).find((p) => p.id === 'water')!
        .stock,
      4,
    )
    assert.equal(
      (
        await createCounterOrder(
          serviceDb,
          { id: 'customer', role: 'customer' },
          mixed,
        )
      ).ok,
      false,
    )
    const credit = {
      lines: [{ productId: 'coffee', quantity: 1 }],
      paymentMethod: 'credit',
      accountIdentifier: 'team.staff',
    }
    assert.equal(
      (await createCounterOrder(serviceDb, operator, credit)).ok,
      true,
    )
    assert.equal(
      (await db.select().from(schema.ledgerEntries))[0].amount,
      '4.50',
    )
    assert.equal(
      (
        await createCounterOrder(serviceDb, operator, {
          ...credit,
          lines: [{ productId: 'coffee', quantity: 4 }],
        })
      ).ok,
      false,
    )
    assert.equal(
      (
        await createCounterOrder(serviceDb, operator, {
          ...credit,
          accountIdentifier: 'customer',
        })
      ).ok,
      false,
    )
    assert.equal(
      (
        await createCounterOrder(serviceDb, operator, {
          ...credit,
          paymentMethod: 'salary_deduction',
        })
      ).ok,
      true,
    )
    assert.equal(
      (
        await createCounterOrder(serviceDb, operator, {
          ...credit,
          paymentMethod: 'salary_deduction',
          lines: [{ productId: 'coffee', quantity: 4 }],
        })
      ).ok,
      false,
    )
    assert.equal((await db.select().from(schema.orders)).length, 3)
  } finally {
    await pg.close()
  }
})

test('kitchen roles follow forward transitions and cannot reopen completed orders', () => {
  assert.equal(canAdvanceOrder('chef', 'new', 'preparing'), true)
  assert.equal(canAdvanceOrder('chef', 'preparing', 'ready'), true)
  assert.equal(canAdvanceOrder('chef', 'ready', 'preparing'), false)
  assert.equal(canAdvanceOrder('chef', 'completed', 'preparing'), false)
  assert.equal(canAdvanceOrder('chef', 'ready', 'completed'), false)
  assert.equal(canAdvanceOrder('cashier', 'ready', 'completed'), true)
  assert.equal(canAdvanceOrder('cashier', 'completed', 'ready'), false)
})
