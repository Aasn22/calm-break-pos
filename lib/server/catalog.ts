import { and, eq, ne, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'node:crypto'
import * as schema from '../db/schema'
import { catalogCreate, catalogEdit, stockAdjustment } from '../catalog'
const { products, user } = schema,
  workspace = 'calm-break-main'
export class CatalogError extends Error {}
export async function changeCatalog(
  db: NodePgDatabase<typeof schema>,
  actorId: string,
  operation: 'create' | 'edit' | 'stock',
  input: unknown,
) {
  const parsed = (
    operation === 'create'
      ? catalogCreate
      : operation === 'edit'
        ? catalogEdit
        : stockAdjustment
  ).safeParse(input)
  if (!parsed.success)
    throw new CatalogError(
      parsed.error.issues[0]?.message || 'Review the item details.',
    )
  return db.transaction(async (tx) => {
    // All catalog writes serialize SKU checks, while item row locks coordinate sales.
    await tx.execute(sql`select pg_advisory_xact_lock(157821,94835)`)
    const [actor] = await tx
      .select()
      .from(user)
      .where(
        and(
          eq(user.id, actorId),
          eq(user.workspaceId, workspace),
          eq(user.isApproved, true),
        ),
      )
      .for('update')
    if (!actor || !['admin', 'manager'].includes(actor.role))
      throw new CatalogError('Administrator or manager access is required.')
    if (operation === 'create') {
      const d = catalogCreate.parse(input)
      if (
        (
          await tx
            .select({ id: products.id })
            .from(products)
            .where(
              and(eq(products.workspaceId, workspace), eq(products.sku, d.sku)),
            )
        ).length
      )
        throw new CatalogError(
          'That SKU already exists. Edit the existing item instead.',
        )
      await tx.insert(products).values({
        ...d,
        id: randomUUID(),
        workspaceId: workspace,
        userId: actor.id,
        price: d.price.toFixed(2),
        stock: d.segment === 'tuck_shop' ? d.stock : 0,
      })
      return
    }
    const id = (parsed.data as { id: string }).id
    const [item] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.workspaceId, workspace)))
      .for('update')
    if (!item) throw new CatalogError('Item not found in this workspace.')
    if (operation === 'stock') {
      const d = stockAdjustment.parse(input)
      if (item.segment !== 'tuck_shop')
        throw new CatalogError('Stock quantities apply to shop items only.')
      if (item.stock !== d.expectedStock)
        throw new CatalogError(
          'Stock changed since you opened this item. Refresh and review the current quantity.',
        )
      const next = item.stock + d.delta
      if (next < 0 || next > 1000000)
        throw new CatalogError(
          'The adjustment would produce an invalid stock quantity.',
        )
      await tx
        .update(products)
        .set({ stock: next, updatedAt: new Date() })
        .where(eq(products.id, id))
      return
    }
    const d = catalogEdit.parse(input)
    if (item.updatedAt.toISOString() !== d.expectedUpdatedAt)
      throw new CatalogError(
        'This item changed on another device. Refresh before editing.',
      )
    if (item.segment !== d.segment)
      throw new CatalogError(
        'An existing item cannot switch between café and shop. Pause it and create a separate item to preserve stock history.',
      )
    if (
      (
        await tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.workspaceId, workspace),
              eq(products.sku, d.sku),
              ne(products.id, id),
            ),
          )
      ).length
    )
      throw new CatalogError('That SKU already exists.')
    await tx
      .update(products)
      .set({
        name: d.name,
        description: d.description,
        sku: d.sku,
        category: d.category,
        price: d.price.toFixed(2),
        prepMinutes: d.prepMinutes,
        escalationMinutes: d.escalationMinutes,
        lowStockAt: d.lowStockAt,
        available: d.available,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
  })
}
