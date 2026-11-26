import { and, desc, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import * as s from '../db/schema'
import type { FulfilmentOrder } from '../fulfilment'
const workspace = 'calm-break-main',
  { orders, orderItems, user, products, loyaltyEntries, ledgerEntries } = s
export class FulfilmentError extends Error {}
const operations = [
  'admin',
  'manager',
  'cashier',
  'shopkeeper',
  'order_taker',
  'chef',
  'barista',
  'kitchen',
]
export function fulfilment(db: NodePgDatabase<typeof s>) {
  return {
    async list(actorId: string, mine = false): Promise<FulfilmentOrder[]> {
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
      if (!actor || (!mine && !operations.includes(actor.role)))
        throw new FulfilmentError('Access denied.')
      const rows = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.workspaceId, workspace),
            ...(mine ? [eq(orders.customerUserId, actor.id)] : []),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(100)
      if (!rows.length) return []
      const lines = await db
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.workspaceId, workspace),
            inArray(
              orderItems.orderId,
              rows.map((r) => r.id),
            ),
          ),
        )
        .orderBy(orderItems.id)
      const ids = [
        ...new Set(
          rows.map((o) => o.customerUserId).filter((id): id is string => !!id),
        ),
      ]
      const people = ids.length
        ? await db
            .select({ id: user.id, name: user.name, allergies: user.allergies })
            .from(user)
            .where(and(eq(user.workspaceId, workspace), inArray(user.id, ids)))
        : []
      return rows.map((o) => {
        const person = people.find((p) => p.id === o.customerUserId)
        return {
          ...o,
          customer: person?.name || 'Counter customer',
          currentAllergies: person?.allergies || '',
          lines: lines.filter((l) => l.orderId === o.id),
        }
      })
    },
    async update(actorId: string, input: unknown) {
      const parsed = z
        .object({
          id: z.string().uuid(),
          version: z.number().int().min(1),
          action: z.enum(['confirm', 'deliver', 'cancel', 'paid']),
          minutes: z.array(z.number().int().min(0).max(1440)).optional(),
          lineId: z.string().optional(),
        })
        .safeParse(input)
      if (!parsed.success) throw new FulfilmentError('Review the order update.')
      const d = parsed.data
      return db.transaction(async (tx) => {
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
        if (!actor || !operations.includes(actor.role))
          throw new FulfilmentError('Operations access required.')
        const [order] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, d.id), eq(orders.workspaceId, workspace)))
          .for('update')
        if (!order) throw new FulfilmentError('Order not found.')
        if (order.version !== d.version)
          throw new FulfilmentError(
            'Order changed on another device. Refresh and retry.',
          )
        const lines = await tx
          .select()
          .from(orderItems)
          .where(
            and(
              eq(orderItems.orderId, order.id),
              eq(orderItems.workspaceId, workspace),
            ),
          )
          .orderBy(orderItems.id)
          .for('update')
        const now = new Date()
        if (d.action === 'paid') {
          if (!['admin', 'manager'].includes(actor.role))
            throw new FulfilmentError(
              'Manager access required to record payment.',
            )
          if (order.paidAt)
            throw new FulfilmentError('Payment already recorded.')
          if (order.status === 'cancelled')
            throw new FulfilmentError('Cancelled orders cannot be paid.')
          if (
            order.customerUserId &&
            ['credit', 'salary_deduction'].includes(order.paymentMethod)
          ) {
            await tx.insert(ledgerEntries).values({
              id: randomUUID(),
              workspaceId: workspace,
              userId: actor.id,
              orderId: order.id,
              accountUserId: order.customerUserId,
              kind: order.paymentMethod,
              amount: (-Number(order.total)).toFixed(2),
            })
          }
          await tx
            .update(orders)
            .set({ paidAt: now, paidBy: actor.id, version: order.version + 1 })
            .where(eq(orders.id, order.id))
          return
        }
        if (['completed', 'cancelled'].includes(order.status))
          throw new FulfilmentError('This order is closed.')
        if (d.action === 'confirm') {
          if (order.confirmedAt)
            throw new FulfilmentError('Order already confirmed.')
          if (!lines.length || !d.minutes || d.minutes.length !== lines.length)
            throw new FulfilmentError('Set a timeframe for each line.')
          for (let i = 0; i < lines.length; i++)
            await tx
              .update(orderItems)
              .set({
                minutes: d.minutes[i],
                dueAt: new Date(now.getTime() + d.minutes[i] * 60000),
              })
              .where(eq(orderItems.id, lines[i].id))
          await tx
            .update(orders)
            .set({
              confirmedAt: now,
              status: 'preparing',
              prepStartedAt: now,
              version: order.version + 1,
            })
            .where(eq(orders.id, order.id))
          return
        }
        if (d.action === 'deliver') {
          if (['chef', 'barista', 'kitchen'].includes(actor.role))
            throw new FulfilmentError(
              'Delivery requires cashier, order taker, shopkeeper or manager access.',
            )
          if (!order.confirmedAt)
            throw new FulfilmentError('Confirm timeframes before delivery.')
          const line = lines.find((l) => l.id === d.lineId)
          if (!line || line.deliveredAt)
            throw new FulfilmentError('Line missing or already delivered.')
          await tx
            .update(orderItems)
            .set({ deliveredAt: now })
            .where(eq(orderItems.id, line.id))
          const complete = lines.every((l) => l.id === line.id || l.deliveredAt)
          await tx
            .update(orders)
            .set({
              status: complete ? 'completed' : 'preparing',
              completedAt: complete ? now : null,
              version: order.version + 1,
            })
            .where(eq(orders.id, order.id))
          return
        }
        if (!['admin', 'manager'].includes(actor.role))
          throw new FulfilmentError('Only a manager can cancel an order.')
        if (lines.some((l) => l.deliveredAt) || order.paidAt)
          throw new FulfilmentError(
            'Delivered or paid orders require manual reconciliation, not cancellation.',
          )
        if (
          (
            await tx
              .select({ id: loyaltyEntries.id })
              .from(loyaltyEntries)
              .where(eq(loyaltyEntries.orderId, order.id))
          ).length
        )
          throw new FulfilmentError(
            'Reconcile awarded loyalty points before cancellation.',
          )
        const shop = lines.filter((l) => l.segment === 'tuck_shop')
        if (shop.length) {
          const stock = await tx
            .select()
            .from(products)
            .where(
              and(
                eq(products.workspaceId, workspace),
                inArray(
                  products.id,
                  shop.map((l) => l.productId),
                ),
              ),
            )
            .orderBy(products.id)
            .for('update')
          for (const line of shop) {
            const p = stock.find((p) => p.id === line.productId)
            if (!p || p.stock + line.quantity > 1000000)
              throw new FulfilmentError('Stock reconciliation failed.')
            await tx
              .update(products)
              .set({ stock: p.stock + line.quantity, updatedAt: now })
              .where(eq(products.id, p.id))
          }
        }
        if (
          order.customerUserId &&
          ['credit', 'salary_deduction'].includes(order.paymentMethod)
        ) {
          await tx.insert(ledgerEntries).values({
            id: randomUUID(),
            workspaceId: workspace,
            userId: actor.id,
            orderId: order.id,
            accountUserId: order.customerUserId,
            kind: order.paymentMethod,
            amount: (-Number(order.total)).toFixed(2),
          })
        }
        await tx
          .update(orders)
          .set({ status: 'cancelled', version: order.version + 1 })
          .where(eq(orders.id, order.id))
      })
    },
    async profile(actorId: string, input: unknown) {
      const d = z
        .object({
          name: z.string().trim().min(2).max(100),
          allergies: z.string().trim().max(1000),
        })
        .safeParse(input)
      if (!d.success) throw new FulfilmentError('Check name and allergy notes.')
      const rows = await db
        .update(user)
        .set({ ...d.data, updatedAt: new Date() })
        .where(
          and(
            eq(user.id, actorId),
            eq(user.workspaceId, workspace),
            eq(user.isApproved, true),
          ),
        )
        .returning({ id: user.id })
      if (!rows.length) throw new FulfilmentError('Account unavailable.')
    },
  }
}
