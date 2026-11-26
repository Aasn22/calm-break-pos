import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import * as s from '../lib/db/schema'
import { applyPortalSchema } from '../lib/db/migrate'
import { fulfilment } from '../lib/server/fulfilment'
import { createCounterOrder } from '../lib/server/counter-orders'
import { overdue } from '../lib/fulfilment'
test('current mixed order snapshots defaults and allergies, confirms per-line due times and completes only after full delivery', async () => {
  const pg = new PGlite()
  try {
    await applyPortalSchema(pg)
    await applyPortalSchema(pg)
    const db = drizzle(pg, { schema: s }),
      serviceDb = db as unknown as NodePgDatabase<typeof s>,
      service = fulfilment(serviceDb)
    await db.insert(s.user).values([
      {
        id: 'admin',
        name: 'Admin',
        email: 'admin@example.test',
        role: 'admin',
        isApproved: true,
      },
      {
        id: 'cashier',
        name: 'Cashier',
        email: 'cash@example.test',
        role: 'cashier',
        isApproved: true,
      },
      {
        id: 'customer',
        name: 'Customer',
        email: 'customer@example.test',
        role: 'customer',
        username: 'kv0001',
        allergies: 'Peanut allergy',
        isApproved: true,
      },
      {
        id: 'other',
        name: 'Other',
        email: 'other@example.test',
        role: 'customer',
        isApproved: true,
      },
    ])
    await db.insert(s.products).values([
      {
        id: 'coffee',
        userId: 'admin',
        name: 'Coffee',
        sku: 'COFFEE',
        category: 'Coffee',
        segment: 'cafe',
        price: '5.00',
        prepMinutes: 15,
        escalationMinutes: 5,
      },
      {
        id: 'water',
        userId: 'admin',
        name: 'Water',
        sku: 'WATER',
        category: 'Shop',
        segment: 'tuck_shop',
        price: '2.00',
        stock: 10,
        prepMinutes: 3,
        escalationMinutes: 2,
      },
    ])
    const key = randomUUID(),
      draft = {
        key,
        lines: [
          { productId: 'coffee', quantity: 1 },
          { productId: 'water', quantity: 2 },
        ],
        paymentMethod: 'cash',
        accountIdentifier: 'kv0001',
      }
    assert.equal(
      (
        await createCounterOrder(
          serviceDb,
          { id: 'cashier', role: 'cashier' },
          draft,
        )
      ).ok,
      true,
    )
    assert.equal(
      (
        await createCounterOrder(
          serviceDb,
          { id: 'cashier', role: 'cashier' },
          draft,
        )
      ).ok,
      true,
    )
    assert.equal((await db.select().from(s.orders)).length, 1)
    assert.equal(
      (await db.select().from(s.products).where(eq(s.products.id, 'water')))[0]
        .stock,
      8,
    )
    let [o] = await service.list('admin')
    assert.equal(o.allergyNote, 'Peanut allergy')
    assert.equal(o.lines.find((l) => l.segment === 'tuck_shop')!.minutes, 3)
    assert.equal((await service.list('other', true)).length, 0)
    await assert.rejects(
      () =>
        service.update('customer', {
          id: o.id,
          version: 1,
          action: 'confirm',
          minutes: [20, 3],
        }),
      /access/,
    )
    await assert.rejects(
      () =>
        service.update('cashier', {
          id: o.id,
          version: 1,
          action: 'deliver',
          lineId: o.lines[0].id,
        }),
      /Confirm/,
    )
    await service.profile('customer', {
      name: 'Updated',
      allergies: 'Peanuts and dairy',
    })
    ;[o] = await service.list('admin')
    assert.equal(o.allergyNote, 'Peanut allergy')
    assert.equal(o.currentAllergies, 'Peanuts and dairy')
    const minutes = o.lines.map((l) => (l.segment === 'tuck_shop' ? 3 : 20))
    await service.update('cashier', {
      id: o.id,
      version: 1,
      action: 'confirm',
      minutes,
    })
    ;[o] = await service.list('admin')
    assert.ok(o.confirmedAt)
    assert.ok(o.lines.every((l) => l.dueAt))
    await assert.rejects(
      () =>
        service.update('cashier', {
          id: o.id,
          version: 1,
          action: 'confirm',
          minutes,
        }),
      /changed/,
    )
    const water = o.lines.find((l) => l.segment === 'tuck_shop')!,
      coffee = o.lines.find((l) => l.segment === 'cafe')!
    await service.update('cashier', {
      id: o.id,
      version: 2,
      action: 'deliver',
      lineId: water.id,
    })
    ;[o] = await service.list('admin')
    assert.equal(o.status, 'preparing')
    assert.ok(o.lines.find((l) => l.id === water.id)!.deliveredAt)
    assert.equal(o.lines.find((l) => l.id === coffee.id)!.deliveredAt, null)
    assert.deepEqual(
      overdue(o, new Date(o.confirmedAt!).getTime() + 26 * 60000),
      ['Coffee overdue'],
    )
    await assert.rejects(
      () => service.update('admin', { id: o.id, version: 3, action: 'cancel' }),
      /reconciliation/,
    )
    await service.update('cashier', {
      id: o.id,
      version: 3,
      action: 'deliver',
      lineId: coffee.id,
    })
    ;[o] = await service.list('customer', true)
    assert.equal(o.status, 'completed')
    assert.deepEqual(overdue(o, Date.now() + 86400000), [])
    await assert.rejects(
      () => service.update('cashier', { id: o.id, version: 4, action: 'paid' }),
      /Manager/,
    )
    await service.update('admin', { id: o.id, version: 4, action: 'paid' })
    ;[o] = await service.list('customer', true)
    assert.ok(o.paidAt)
    // Concurrent deliveries cannot overwrite each other; payment ledger offsets charges.
    await db
      .update(s.user)
      .set({ creditLimit: '100.00', monthlyDeductionLimit: '100.00' })
      .where(eq(s.user.id, 'cashier'))
    await createCounterOrder(
      serviceDb,
      { id: 'cashier', role: 'cashier' },
      {
        ...draft,
        key: randomUUID(),
        paymentMethod: 'credit',
        accountIdentifier: 'cash@example.test',
      },
    )
    let charged = (await service.list('admin')).find((x) => x.status === 'new')!
    await service.update('admin', {
      id: charged.id,
      version: 1,
      action: 'paid',
    })
    const ledger = await db.select().from(s.ledgerEntries)
    assert.equal(
      ledger.reduce((n, l) => n + Number(l.amount), 0),
      0,
    )
    await assert.rejects(
      () =>
        service.update('admin', { id: charged.id, version: 2, action: 'paid' }),
      /already/,
    )
    await service.update('admin', {
      id: charged.id,
      version: 2,
      action: 'confirm',
      minutes: charged.lines.map((l) => l.minutes),
    })
    const concurrent = await Promise.allSettled(
      charged.lines.map((l) =>
        service.update('cashier', {
          id: charged.id,
          version: 3,
          action: 'deliver',
          lineId: l.id,
        }),
      ),
    )
    assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1)
    const updated = (await service.list('admin')).find(
      (x) => x.id === charged.id,
    )!
    assert.equal(updated.status, 'preparing')
    const remaining = updated.lines.find((l) => !l.deliveredAt)!
    await service.update('cashier', {
      id: charged.id,
      version: updated.version,
      action: 'deliver',
      lineId: remaining.id,
    })
    // Cancel an unfulfilled order restores shop quantities once.
    await createCounterOrder(
      serviceDb,
      { id: 'cashier', role: 'cashier' },
      { ...draft, key: randomUUID() },
    )
    const pending = (await service.list('admin')).find(
      (x) => x.status === 'new',
    )!
    await service.update('admin', {
      id: pending.id,
      version: 1,
      action: 'cancel',
    })
    await assert.rejects(
      () =>
        service.update('admin', {
          id: pending.id,
          version: 2,
          action: 'cancel',
        }),
      /closed/,
    )
    assert.equal(
      (await db.select().from(s.products).where(eq(s.products.id, 'water')))[0]
        .stock,
      6,
    )
  } finally {
    await pg.close()
  }
})
