import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'node:crypto'
import * as schema from '../db/schema'
import { purchaseDraft, type PurchaseView } from '../operations-modules'
const { products, purchases, purchaseItems, user } = schema,
  workspace = 'calm-break-main'
export class OperationsError extends Error {}
export async function requireManager(
  db: NodePgDatabase<typeof schema>,
  actorId: string,
) {
  const [actor] = await db
    .select()
    .from(user)
    .where(
      and(
        eq(user.id, actorId),
        eq(user.workspaceId, workspace),
        eq(user.isApproved, true),
      ),
    )
  if (!actor || !['admin', 'manager'].includes(actor.role))
    throw new OperationsError('Administrator or manager access is required.')
  return actor
}
export function purchasing(db: NodePgDatabase<typeof schema>) {
  return {
    async list(actorId: string): Promise<PurchaseView[]> {
      await requireManager(db, actorId)
      const rows = await db
        .select()
        .from(purchases)
        .where(eq(purchases.workspaceId, workspace))
        .orderBy(desc(purchases.createdAt))
      if (!rows.length) return []
      const lines = await db
        .select({
          purchaseId: purchaseItems.purchaseId,
          productId: purchaseItems.productId,
          name: products.name,
          quantity: purchaseItems.quantity,
          unitCost: purchaseItems.unitCost,
        })
        .from(purchaseItems)
        .innerJoin(products, eq(products.id, purchaseItems.productId))
        .where(eq(purchaseItems.workspaceId, workspace))
      return rows.map((r) => ({
        ...r,
        lines: lines.filter((l) => l.purchaseId === r.id),
      }))
    },
    async create(actorId: string, input: unknown) {
      const parsed = purchaseDraft.safeParse(input)
      if (!parsed.success)
        throw new OperationsError(
          'Check supplier, items, quantities and unit costs.',
        )
      const d = parsed.data
      await requireManager(db, actorId)
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(157821,94836)`)
        const [previous] = await tx
          .select()
          .from(purchases)
          .where(eq(purchases.id, d.key))
        if (previous) {
          if (previous.workspaceId !== workspace || previous.userId !== actorId)
            throw new OperationsError('Invalid purchase reference.')
          return previous.id
        }
        const ids = d.lines.map((l) => l.productId)
        if (new Set(ids).size !== ids.length)
          throw new OperationsError('Use one line per product.')
        const catalog = await tx
          .select()
          .from(products)
          .where(
            and(eq(products.workspaceId, workspace), inArray(products.id, ids)),
          )
          .orderBy(asc(products.id))
          .for('update')
        if (catalog.length !== ids.length)
          throw new OperationsError(
            'A selected product is unavailable in this workspace.',
          )
        const cents = d.lines.reduce(
          (sum, l) => sum + Math.round(l.unitCost * 100) * l.quantity,
          0,
        )
        if (cents > 9999999999)
          throw new OperationsError('Purchase total is too large.')
        await tx
          .insert(purchases)
          .values({
            id: d.key,
            workspaceId: workspace,
            userId: actorId,
            supplier: d.supplier,
            invoiceNumber: d.invoiceNumber || null,
            segment: catalog.every((p) => p.segment === 'tuck_shop')
              ? 'tuck_shop'
              : 'cafe',
            total: (cents / 100).toFixed(2),
            status: 'ordered',
          })
        await tx
          .insert(purchaseItems)
          .values(
            d.lines.map((l) => ({
              id: randomUUID(),
              workspaceId: workspace,
              userId: actorId,
              purchaseId: d.key,
              productId: l.productId,
              quantity: l.quantity,
              unitCost: l.unitCost.toFixed(2),
            })),
          )
        return d.key
      })
    },
    async update(actorId: string, id: string, action: 'receive' | 'cancel') {
      await requireManager(db, actorId)
      if (!['receive', 'cancel'].includes(action))
        throw new OperationsError('Invalid purchase action.')
      return db.transaction(async (tx) => {
        const [purchase] = await tx
          .select()
          .from(purchases)
          .where(
            and(eq(purchases.id, id), eq(purchases.workspaceId, workspace)),
          )
          .for('update')
        if (!purchase) throw new OperationsError('Purchase not found.')
        if (purchase.status !== 'ordered')
          throw new OperationsError(
            'Only an outstanding purchase can be received or cancelled.',
          )
        if (action === 'receive') {
          const lines = await tx
            .select()
            .from(purchaseItems)
            .where(
              and(
                eq(purchaseItems.purchaseId, id),
                eq(purchaseItems.workspaceId, workspace),
              ),
            )
            .orderBy(asc(purchaseItems.productId))
          if (!lines.length) throw new OperationsError('Purchase has no lines.')
          const rows = await tx
            .select()
            .from(products)
            .where(
              and(
                eq(products.workspaceId, workspace),
                inArray(
                  products.id,
                  lines.map((l) => l.productId),
                ),
              ),
            )
            .orderBy(asc(products.id))
            .for('update')
          if (rows.length !== lines.length)
            throw new OperationsError('A purchased item is missing.')
          for (const line of lines) {
            const product = rows.find((p) => p.id === line.productId)!
            if (product.segment === 'tuck_shop') {
              if (product.stock + line.quantity > 1000000)
                throw new OperationsError('Receiving exceeds the stock limit.')
              await tx
                .update(products)
                .set({
                  stock: product.stock + line.quantity,
                  updatedAt: new Date(),
                })
                .where(eq(products.id, product.id))
            }
          }
        }
        await tx
          .update(purchases)
          .set({
            status: action === 'receive' ? 'received' : 'cancelled',
            receivedAt: action === 'receive' ? new Date() : null,
          })
          .where(eq(purchases.id, id))
      })
    },
  }
}
