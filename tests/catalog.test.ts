import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import * as schema from '../lib/db/schema'
import { applyPortalSchema } from '../lib/db/migrate'
import { changeCatalog } from '../lib/server/catalog'
import { createCounterOrder } from '../lib/server/counter-orders'

test('managers create café/shop products, edit prices, pause items and safely adjust stock used by POS', async () => {
  const pg = new PGlite()
  try {
    await applyPortalSchema(pg)
    const orm = drizzle(pg, { schema }),
      db = orm as unknown as NodePgDatabase<typeof schema>
    await orm.insert(schema.user).values([
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
        id: 'outside',
        name: 'Other',
        email: 'other@example.test',
        role: 'admin',
        workspaceId: 'other',
        isApproved: true,
      },
      {
        id: 'suspended',
        name: 'Suspended',
        email: 'suspended@example.test',
        role: 'admin',
        isApproved: false,
      },
    ])
    const fields = {
      name: 'Cappuccino',
      description: 'Fresh coffee',
      sku: 'CAFE-001',
      category: 'Coffee',
      segment: 'cafe',
      price: 4.5,
      prepMinutes: 8,
      lowStockAt: 0,
      available: true,
      stock: 0,
    }
    for (const actor of ['cashier', 'outside', 'suspended', 'unknown'])
      await assert.rejects(
        () => changeCatalog(db, actor, 'create', fields),
        /access/,
      )
    await changeCatalog(db, 'admin', 'create', fields)
    await changeCatalog(db, 'manager', 'create', {
      ...fields,
      name: 'Water',
      sku: 'SHOP-001',
      segment: 'tuck_shop',
      stock: 10,
      lowStockAt: 3,
      price: 2,
    })
    const rows = await orm.select().from(schema.products),
      cafe = rows.find((p) => p.segment === 'cafe')!,
      shop = rows.find((p) => p.segment === 'tuck_shop')!
    assert.equal(rows.length, 2)
    assert.equal(cafe.prepMinutes, 8)
    assert.equal(shop.stock, 10)
    await assert.rejects(
      () => changeCatalog(db, 'admin', 'create', fields),
      /SKU already/,
    )
    await assert.rejects(() =>
      changeCatalog(db, 'admin', 'create', {
        ...fields,
        sku: 'BAD',
        price: -1,
      }),
    )
    const edit = {
      ...fields,
      id: cafe.id,
      expectedUpdatedAt: cafe.updatedAt.toISOString(),
      price: 5.25,
      prepMinutes: 12,
    }
    await changeCatalog(db, 'manager', 'edit', edit)
    await assert.rejects(
      () => changeCatalog(db, 'admin', 'edit', { ...edit, price: 6 }),
      /changed/,
    )
    const current = (
      await orm
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, cafe.id))
    )[0]
    assert.equal(current.price, '5.25')
    assert.equal(current.prepMinutes, 12)
    await assert.rejects(
      () =>
        changeCatalog(db, 'admin', 'edit', {
          ...edit,
          expectedUpdatedAt: current.updatedAt.toISOString(),
          segment: 'tuck_shop',
        }),
      /cannot switch/,
    )
    const sale = await createCounterOrder(
      db,
      { id: 'cashier', role: 'cashier' },
      {
        lines: [
          { productId: cafe.id, quantity: 1 },
          { productId: shop.id, quantity: 2 },
        ],
        paymentMethod: 'cash',
      },
    )
    assert.equal(sale.ok, true)
    assert.equal((await orm.select().from(schema.orders))[0].total, '9.25')
    await assert.rejects(
      () =>
        changeCatalog(db, 'admin', 'stock', {
          id: shop.id,
          expectedStock: 10,
          delta: 5,
        }),
      /Stock changed/,
    )
    await changeCatalog(db, 'admin', 'stock', {
      id: shop.id,
      expectedStock: 8,
      delta: 12,
    })
    assert.equal(
      (
        await orm
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, shop.id))
      )[0].stock,
      20,
    )
    await assert.rejects(
      () =>
        changeCatalog(db, 'manager', 'stock', {
          id: shop.id,
          expectedStock: 20,
          delta: -21,
        }),
      /invalid stock/,
    )
    await assert.rejects(
      () =>
        changeCatalog(db, 'admin', 'stock', {
          id: cafe.id,
          expectedStock: 0,
          delta: 5,
        }),
      /shop items only/,
    )
    await changeCatalog(db, 'admin', 'edit', {
      ...edit,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      available: false,
    })
    assert.equal(
      (
        await createCounterOrder(
          db,
          { id: 'cashier', role: 'cashier' },
          {
            lines: [{ productId: cafe.id, quantity: 1 }],
            paymentMethod: 'cash',
          },
        )
      ).ok,
      false,
    )
    assert.equal((await orm.select().from(schema.orders)).length, 1)
    assert.equal((await orm.select().from(schema.orderItems)).length, 2)
  } finally {
    await pg.close()
  }
})
