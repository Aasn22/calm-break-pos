import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import * as schema from '../lib/db/schema'
import { applyPortalSchema } from '../lib/db/migrate'
import { purchasing } from '../lib/server/purchasing'
import { loyalty } from '../lib/server/loyalty'
import { allowedSection, sectionPath } from '../lib/operations-modules'
async function setup() {
  const pg = new PGlite()
  await applyPortalSchema(pg)
  await applyPortalSchema(pg)
  const db = drizzle(pg, { schema }),
    serviceDb = db as unknown as NodePgDatabase<typeof schema>
  await db.insert(schema.user).values([
    {
      id: 'admin',
      name: 'Admin',
      email: 'admin@example.test',
      role: 'admin',
      isApproved: true,
    },
    {
      id: 'manager',
      name: 'Manager',
      email: 'manager@example.test',
      role: 'manager',
      isApproved: true,
    },
    {
      id: 'cashier',
      name: 'Cashier',
      email: 'cashier@example.test',
      role: 'cashier',
      isApproved: true,
    },
    {
      id: 'customer',
      name: 'Customer',
      email: 'customer@example.test',
      employeeId: 'KV0001',
      role: 'customer',
      isApproved: true,
    },
    {
      id: 'other-customer',
      name: 'Other customer',
      email: 'other@example.test',
      employeeId: 'KV0002',
      role: 'customer',
      isApproved: true,
    },
    {
      id: 'outside',
      name: 'Outside',
      email: 'outside@example.test',
      workspaceId: 'outside',
      role: 'admin',
      isApproved: true,
    },
  ])
  await db.insert(schema.products).values([
    {
      id: 'coffee',
      userId: 'admin',
      sku: 'COFFEE',
      name: 'Coffee',
      category: 'Coffee',
      segment: 'cafe',
      price: '5.00',
    },
    {
      id: 'water',
      userId: 'admin',
      sku: 'WATER',
      name: 'Water',
      category: 'Shop',
      segment: 'tuck_shop',
      price: '2.00',
      stock: 3,
    },
  ])
  return { pg, db, serviceDb }
}

test('purchasing persists lines/costs, receives stock exactly once and cancellation does not add stock', async () => {
  const f = await setup()
  try {
    const service = purchasing(f.serviceDb),
      key = randomUUID(),
      draft = {
        key,
        supplier: 'Supplier One',
        invoiceNumber: 'INV-1',
        lines: [
          { productId: 'water', quantity: 10, unitCost: 1.5 },
          { productId: 'coffee', quantity: 5, unitCost: 2 },
        ],
      }
    for (const id of ['cashier', 'customer', 'outside']) {
      await assert.rejects(() => service.list(id), /access/)
      await assert.rejects(() => service.create(id, draft), /access/)
    }
    assert.equal(await service.create('manager', draft), key)
    assert.equal(await service.create('manager', draft), key)
    let rows = await service.list('admin')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].total, '25.00')
    assert.equal(rows[0].lines.length, 2)
    assert.equal(
      (
        await f.db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, 'water'))
      )[0].stock,
      3,
    )
    await service.update('admin', key, 'receive')
    assert.equal(
      (
        await f.db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, 'water'))
      )[0].stock,
      13,
    )
    assert.equal(
      (
        await f.db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, 'coffee'))
      )[0].stock,
      0,
    )
    await assert.rejects(
      () => service.update('admin', key, 'receive'),
      /outstanding/,
    )
    const cancelKey = randomUUID()
    await service.create('admin', { ...draft, key: cancelKey })
    await service.update('manager', cancelKey, 'cancel')
    assert.equal(
      (
        await f.db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, 'water'))
      )[0].stock,
      13,
    )
    await assert.rejects(
      () => service.update('admin', cancelKey, 'receive'),
      /outstanding/,
    )
    await assert.rejects(
      () =>
        service.create('admin', {
          ...draft,
          key: randomUUID(),
          lines: [draft.lines[0], draft.lines[0]],
        }),
      /one line/,
    )
    await assert.rejects(
      () =>
        service.create('admin', {
          ...draft,
          key: randomUUID(),
          lines: [{ productId: 'missing', quantity: 1, unitCost: 1 }],
        }),
      /unavailable/,
    )
    const concurrentKey = randomUUID()
    await service.create('admin', { ...draft, key: concurrentKey })
    const results = await Promise.allSettled([
      service.update('admin', concurrentKey, 'receive'),
      service.update('manager', concurrentKey, 'receive'),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(
      (
        await f.db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, 'water'))
      )[0].stock,
      23,
    )
  } finally {
    await f.pg.close()
  }
})

test('loyalty is opt-in, awards completed customer orders once, redeems without overdraft and isolates customer wallets', async () => {
  const f = await setup()
  try {
    const service = loyalty(f.serviceDb)
    let view = await service.view('admin')
    assert.equal(view.enabled, false)
    assert.equal(view.configured, false)
    await f.db.insert(schema.orders).values([
      {
        id: 'earned-order',
        userId: 'admin',
        customerUserId: 'customer',
        segment: 'cafe',
        status: 'completed',
        paymentMethod: 'cash',
        total: '25.50',
        subtotal: '25.50',
      },
      {
        id: 'new-order',
        userId: 'admin',
        customerUserId: 'customer',
        segment: 'cafe',
        status: 'new',
        paymentMethod: 'cash',
        total: '5.00',
        subtotal: '5.00',
      },
      {
        id: 'guest',
        userId: 'admin',
        segment: 'cafe',
        status: 'completed',
        paymentMethod: 'cash',
        total: '5.00',
        subtotal: '5.00',
      },
    ])
    await assert.rejects(() => service.award('admin', 'earned-order'), /Enable/)
    for (const actor of ['customer', 'cashier', 'outside'])
      await assert.rejects(
        () =>
          service.configure(actor, {
            enabled: true,
            pointsPerDollar: 2,
            rewardPoints: 20,
            rewardLabel: 'Free coffee',
          }),
        /access/,
      )
    await service.configure('manager', {
      enabled: true,
      pointsPerDollar: 2,
      rewardPoints: 20,
      rewardLabel: 'Free coffee',
    })
    await assert.rejects(() => service.award('admin', 'new-order'), /completed/)
    await assert.rejects(
      () => service.award('admin', 'guest'),
      /customer-linked/,
    )
    await service.award('admin', 'earned-order')
    await assert.rejects(
      () => service.award('admin', 'earned-order'),
      /already/,
    )
    view = await service.view('admin')
    assert.equal(view.members.find((m) => m.id === 'customer')!.points, 51)
    assert.equal(view.eligibleOrders.length, 0)
    const customerView = await service.view('customer', true)
    assert.equal(customerView.members.length, 1)
    assert.equal(customerView.entries.length, 1)
    assert.equal(customerView.members[0].id, 'customer')
    await assert.rejects(
      () => service.redeem('customer', 'other-customer', randomUUID(), true),
      /own points/,
    )
    const key = randomUUID()
    await service.redeem('customer', 'customer', key, true)
    await service.redeem('customer', 'customer', key, true)
    assert.equal((await service.view('customer', true)).members[0].points, 31)
    const results = await Promise.allSettled([
      service.redeem('manager', 'customer', randomUUID()),
      service.redeem('admin', 'customer', randomUUID()),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal((await service.view('customer', true)).members[0].points, 11)
    await assert.rejects(
      () => service.redeem('admin', 'customer', randomUUID()),
      /Not enough/,
    )
    await service.configure('admin', {
      enabled: false,
      pointsPerDollar: 2,
      rewardPoints: 20,
      rewardLabel: 'New reward',
    })
    await assert.rejects(
      () => service.redeem('admin', 'customer', randomUUID()),
      /disabled/,
    )
    const entries = await f.db.select().from(schema.loyaltyEntries)
    assert.equal(entries.length, 3)
    const redemption = entries.find((e) => e.kind === 'redeem')!
    await assert.rejects(
      () => service.fulfill('customer', redemption.id),
      /access/,
    )
    await service.fulfill('manager', redemption.id)
    await assert.rejects(
      () => service.fulfill('admin', redemption.id),
      /already/,
    )
    assert.ok(
      (await service.view('customer', true)).fulfilledIds.includes(
        redemption.id,
      ),
    )
    assert.equal((await service.view('customer', true)).members[0].points, 11)

    assert.equal(
      entries.filter((e) => e.kind === 'redeem')[0].note,
      'Free coffee',
    )
  } finally {
    await f.pg.close()
  }
})

test('module navigation enforces role-specific pages', () => {
  assert.equal(sectionPath('terminal'), '/operations/terminal')
  assert.equal(sectionPath('admin'), '/operations/admin')
  for (const section of [
    'admin',
    'team',
    'customers',
    'purchasing',
    'inventory',
    'loyalty',
    'terminal',
    'orders',
  ] as const)
    assert.equal(allowedSection('admin', section), true)
  assert.equal(allowedSection('manager', 'admin'), false)
  assert.equal(allowedSection('manager', 'purchasing'), true)
  assert.equal(allowedSection('customer', 'loyalty'), false)
  assert.equal(allowedSection('cashier', 'purchasing'), false)
  assert.equal(allowedSection('chef', 'terminal'), false)
})
