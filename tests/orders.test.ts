import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { orderService, productSql } from '../lib/server/orders'
import {
  alerts,
  allowed,
  complete,
  confirm,
  deliver,
  total,
  type Order,
  type Product,
  type User,
} from '../lib/domain'
import { hostAllowed } from '../lib/hosts'
import { hashPassword, verifyPassword } from '../lib/server/password'
import type { Query } from '../lib/server/db'

test('combined order, allergy snapshot, idempotency, confirmation, partial delivery, concurrency and payment', async () => {
  const db = new PGlite()
  try {
    await db.exec(
      await readFile(new URL('../scripts/schema.sql', import.meta.url), 'utf8'),
    )
    // Re-running setup must not reset manager-set defaults.
    await db.exec(
      await readFile(new URL('../scripts/schema.sql', import.meta.url), 'utf8'),
    )
    const query: Query = async <T>(sql: string, params?: unknown[]) =>
      (await db.query<T>(sql, params)).rows
    const service = orderService(query)
    const customer: User = {
      id: randomUUID(),
      name: 'Test customer',
      email: 'customer@example.test',
      role: 'staff',
      allergies: 'Peanuts',
    }
    const other: User = {
      ...customer,
      id: randomUUID(),
      email: 'other@example.test',
    }
    for (const u of [customer, other])
      await query(
        'INSERT INTO cb_users(id,name,email,role,allergies,password_hash) VALUES($1,$2,$3,$4,$5,$6)',
        [u.id, u.name, u.email, u.role, u.allergies, 'test-hash'],
      )
    const products = await query<Product>(productSql)
    const cafe = products.find((p) => p.category === 'Café')!
    const shop = products.find((p) => p.category === 'Shop')!
    const cart = [
      { productId: cafe.id, quantity: 2 },
      { productId: shop.id, quantity: 1 },
    ]
    const key = randomUUID()
    const order = await service.create(customer, cart, key, 'Room 12')
    const retry = await service.create(customer, cart, key, 'Room 12')
    assert.equal(order.id, retry.id)
    assert.equal((await service.list(customer, false)).length, 1)
    assert.equal((await service.list(other, false)).length, 0)
    assert.equal(order.allergyNote, 'Peanuts')
    assert.equal(total(order), cafe.price * 2 + shop.price)
    await assert.rejects(() =>
      service.create(
        customer,
        [{ productId: cafe.id, quantity: -1 }],
        randomUUID(),
        '',
      ),
    )
    await assert.rejects(() =>
      service.create(customer, [...cart, cart[0]], randomUUID(), ''),
    )
    await assert.rejects(
      () => service.update(order.id, 1, 'deliver', 0, 'operator'),
      /Confirm/,
    )
    await service.update(order.id, 1, 'confirm', [20, 3], 'operator')
    await assert.rejects(
      () => service.update(order.id, 1, 'confirm', [20, 3], 'operator'),
      /another device/,
    )
    let saved = (await service.list(customer, false))[0]
    assert.equal(saved.lines[0].minutes, 20)
    assert.ok(saved.lines.every((l) => l.dueAt))
    await assert.rejects(
      () => service.update(order.id, 2, 'confirm', [20, 3], 'operator'),
      /already confirmed/,
    )
    // Change allergy profile after checkout: historical snapshot remains intact.
    await query('UPDATE cb_users SET allergies=$1 WHERE id=$2', [
      'Peanuts and dairy',
      customer.id,
    ])
    assert.equal(saved.allergyNote, 'Peanuts')
    const nextOrder = await service.create(customer, cart, randomUUID(), '')
    assert.equal(nextOrder.allergyNote, 'Peanuts and dairy')
    await service.update(order.id, 2, 'deliver', 1, 'operator')
    saved = (await service.list(customer, false)).find(
      (o) => o.id === order.id,
    )!
    assert.ok(saved.lines[1].deliveredAt)
    assert.equal(saved.lines[0].deliveredAt, null)
    assert.equal(complete(saved), false)
    await assert.rejects(
      () => service.update(order.id, 3, 'deliver', 1, 'operator'),
      /already been/,
    )
    await assert.rejects(
      () => service.update(order.id, 3, 'paid', null, 'operator'),
      /not permitted/,
    )
    await service.update(order.id, 3, 'deliver', 0, 'operator')
    saved = (await service.list(customer, false)).find(
      (o) => o.id === order.id,
    )!
    assert.equal(complete(saved), true)
    assert.deepEqual(alerts(saved, Date.now() + 86400000), [])
    await service.update(order.id, 4, 'paid', null, 'manager')
    assert.equal(
      (await service.list(customer, false)).find((o) => o.id === order.id)!
        .paid,
      true,
    )
    // Concurrent devices cannot overwrite each other.
    const result = await Promise.allSettled([
      service.update(nextOrder.id, 1, 'confirm', [10, 2], 'operator'),
      service.update(nextOrder.id, 1, 'confirm', [15, 3], 'operator'),
    ])
    assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(result.filter((r) => r.status === 'rejected').length, 1)
    // Hidden items cannot be ordered and prices/defaults are server-owned.
    await query('UPDATE cb_products SET active=false WHERE id=$1', [shop.id])
    await assert.rejects(
      () => service.create(customer, cart, randomUUID(), ''),
      /unavailable/,
    )
  } finally {
    await db.close()
  }
})

test('manager escalation boundaries and item-specific confirmed deadlines', () => {
  const start = new Date('2026-11-24T10:00:00Z')
  const order: Order = {
    id: '1',
    userId: '1',
    customer: 'Staff',
    createdAt: start.toISOString(),
    confirmedAt: null,
    allergyNote: '',
    note: '',
    version: 1,
    paid: false,
    lines: [
      {
        productId: 'food',
        name: 'Food',
        category: 'Café',
        price: 100,
        quantity: 1,
        minutes: 20,
        escalationMinutes: 5,
        dueAt: null,
        deliveredAt: null,
      },
      {
        productId: 'shop',
        name: 'Shop item',
        category: 'Shop',
        price: 200,
        quantity: 1,
        minutes: 3,
        escalationMinutes: 2,
        dueAt: null,
        deliveredAt: null,
      },
    ],
  }
  assert.deepEqual(alerts(order, start.getTime() + 119999), [])
  assert.deepEqual(alerts(order, start.getTime() + 120000), [
    'Awaiting confirmation',
  ])
  const confirmed = confirm(order, [20, 3], start)
  assert.deepEqual(alerts(confirmed, start.getTime() + 299999), [])
  assert.deepEqual(alerts(confirmed, start.getTime() + 300000), [
    'Shop item overdue',
  ])
  const partial = deliver(confirmed, 1, start)
  assert.deepEqual(alerts(partial, start.getTime() + 25 * 60000), [
    'Food overdue',
  ])
  assert.equal(complete(partial), false)
  assert.equal(complete(deliver(partial, 0, start)), true)
  for (const bad of [[0, 3], [1.5, 3], [1441, 3], [NaN, 3], [20], ['20', 3]])
    assert.throws(() => confirm(order, bad, start))
})

test('portal roles are disjoint and host separation fails closed', () => {
  for (const role of ['customer', 'staff'] as const) {
    assert.equal(allowed(role, 'customer'), true)
    assert.equal(allowed(role, 'operations'), false)
  }
  for (const role of ['operator', 'manager'] as const) {
    assert.equal(allowed(role, 'customer'), false)
    assert.equal(allowed(role, 'operations'), true)
  }
  const oldCustomer = process.env.CUSTOMER_HOST,
    oldOperations = process.env.OPERATIONS_HOST
  try {
    delete process.env.CUSTOMER_HOST
    delete process.env.OPERATIONS_HOST
    assert.equal(hostAllowed('preview.example.test', 'customer'), true)
    process.env.CUSTOMER_HOST = 'order.example.test'
    assert.equal(hostAllowed('order.example.test', 'customer'), false)
    process.env.OPERATIONS_HOST = 'ops.example.test'
    assert.equal(hostAllowed('order.example.test', 'customer'), true)
    assert.equal(hostAllowed('order.example.test', 'operations'), false)
    assert.equal(hostAllowed('ops.example.test', 'operations'), true)
    assert.equal(hostAllowed('ops.example.test', 'customer'), false)
    assert.equal(hostAllowed('unknown.example.test', 'operations'), false)
  } finally {
    if (oldCustomer === undefined) delete process.env.CUSTOMER_HOST
    else process.env.CUSTOMER_HOST = oldCustomer
    if (oldOperations === undefined) delete process.env.OPERATIONS_HOST
    else process.env.OPERATIONS_HOST = oldOperations
  }
})

test('password hashing rejects weak passwords and verifies safely', async () => {
  await assert.rejects(() => hashPassword('short'))
  const hash = await hashPassword('a-long-test-password')
  assert.notEqual(hash, 'a-long-test-password')
  assert.equal(await verifyPassword('a-long-test-password', hash), true)
  assert.equal(await verifyPassword('incorrect', hash), false)
  assert.equal(await verifyPassword('a'.repeat(129), hash), false)
})
