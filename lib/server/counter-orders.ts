import { and, eq, gte, inArray, or, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { reportDatabaseFailure } from '../db/diagnostics'
import * as schema from '../db/schema'
const { ledgerEntries, orderItems, orders, products, user } = schema
const WORKSPACE_ID = 'calm-break-main'

const staffOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
  paymentMethod: z.enum([
    'cash',
    'bank_transfer',
    'credit',
    'salary_deduction',
  ]),
  accountIdentifier: z.string().trim().max(254).optional().or(z.literal('')),
  paymentReference: z.string().trim().max(120).optional(),
  orderType: z
    .enum(['dine_in', 'takeaway', 'staff_delivery'])
    .default('dine_in'),
})

class CounterOrderError extends Error {}

export async function createCounterOrder(
  db: NodePgDatabase<typeof schema>,
  operator: { id: string; role: string },
  input: unknown,
) {
  if (
    !['admin', 'manager', 'cashier', 'shopkeeper', 'order_taker'].includes(
      operator.role,
    )
  )
    return { ok: false as const, message: 'POS terminal access is required.' }
  const parsed = staffOrderSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false as const,
      message: 'Review the order details and try again.',
    }
  const quantities = new Map<string, number>()
  for (const line of parsed.data.lines)
    quantities.set(
      line.productId,
      (quantities.get(line.productId) ?? 0) + line.quantity,
    )
  if ([...quantities.values()].some((quantity) => quantity > 20))
    return {
      ok: false as const,
      message: 'The limit is 20 of each item per order.',
    }
  const ids = [...quantities.keys()].sort()
  const method = parsed.data.paymentMethod
  const accountIdentifier = parsed.data.accountIdentifier?.trim()
  if (
    (method === 'credit' || method === 'salary_deduction') &&
    !accountIdentifier
  )
    return {
      ok: false as const,
      message:
        'Enter the staff username or employee ID for this payment method.',
    }

  try {
    const result = await db.transaction(async (tx) => {
      const catalog = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.workspaceId, WORKSPACE_ID),
            inArray(products.id, ids),
            eq(products.available, true),
          ),
        )
        .orderBy(products.id)
        .for('update')
      if (catalog.length !== ids.length)
        throw new CounterOrderError(
          'An item is no longer available. Refresh the catalog and review your basket.',
        )
      let subtotal = 0
      const lines = catalog.map((product) => {
        const quantity = quantities.get(product.id) ?? 0
        if (product.segment === 'tuck_shop' && product.stock < quantity)
          throw new CounterOrderError(
            'There is not enough shop stock for this order. Reduce the quantity or refresh the catalog.',
          )
        const unitPrice = Number(product.price)
        subtotal += unitPrice * quantity
        return { product, quantity, unitPrice }
      })
      const total = Math.round(subtotal * 100) / 100
      let account: typeof user.$inferSelect | undefined
      if (
        (method === 'credit' || method === 'salary_deduction') &&
        accountIdentifier
      ) {
        const normalizedIdentifier = accountIdentifier.toLowerCase()
        account = (
          await tx
            .select()
            .from(user)
            .where(
              and(
                eq(user.workspaceId, WORKSPACE_ID),
                or(
                  eq(user.username, normalizedIdentifier),
                  eq(user.employeeId, accountIdentifier.toUpperCase()),
                  eq(user.email, normalizedIdentifier),
                ),
              ),
            )
            .limit(1)
            .for('update')
        )[0]
        if (!account)
          throw new CounterOrderError(
            'The staff account could not be found. Check the username or employee ID.',
          )
      }
      if (
        (method === 'credit' || method === 'salary_deduction') &&
        (!account || account.role === 'customer')
      )
        throw new CounterOrderError(
          'This payment method requires a staff account.',
        )
      if (method === 'credit' && account) {
        const [balance] = await tx
          .select({
            amount: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)`,
          })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.workspaceId, WORKSPACE_ID),
              eq(ledgerEntries.accountUserId, account.id),
              eq(ledgerEntries.kind, 'credit'),
            ),
          )
        if (Number(balance.amount) + total > Number(account.creditLimit))
          throw new CounterOrderError(
            'This order would exceed the staff credit limit.',
          )
      }
      if (method === 'salary_deduction' && account) {
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)
        const [balance] = await tx
          .select({
            amount: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)`,
          })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.workspaceId, WORKSPACE_ID),
              eq(ledgerEntries.accountUserId, account.id),
              eq(ledgerEntries.kind, 'salary_deduction'),
              gte(ledgerEntries.createdAt, startOfMonth),
            ),
          )
        if (
          Number(balance.amount) + total >
          Number(account.monthlyDeductionLimit)
        )
          throw new CounterOrderError(
            'This order would exceed the monthly salary deduction limit.',
          )
      }
      const orderId = randomUUID()
      const [created] = await tx
        .insert(orders)
        .values({
          id: orderId,
          workspaceId: WORKSPACE_ID,
          userId: operator.id,
          customerUserId: account?.id ?? null,
          segment: lines.every(({ product }) => product.segment === 'tuck_shop')
            ? 'tuck_shop'
            : 'cafe',
          paymentMethod: method,
          paymentReference: parsed.data.paymentReference || null,
          orderType: parsed.data.orderType,
          subtotal: total.toFixed(2),
          total: total.toFixed(2),
        })
        .returning({ orderNumber: orders.orderNumber })
      for (const { product, quantity, unitPrice } of lines) {
        await tx
          .insert(orderItems)
          .values({
            id: randomUUID(),
            workspaceId: WORKSPACE_ID,
            userId: operator.id,
            orderId,
            productId: product.id,
            productName: product.name,
            quantity,
            unitPrice: unitPrice.toFixed(2),
          })
        if (product.segment === 'tuck_shop')
          await tx
            .update(products)
            .set({ stock: product.stock - quantity, updatedAt: new Date() })
            .where(
              and(
                eq(products.id, product.id),
                eq(products.workspaceId, WORKSPACE_ID),
              ),
            )
      }
      if (account && (method === 'credit' || method === 'salary_deduction')) {
        await tx
          .insert(ledgerEntries)
          .values({
            id: randomUUID(),
            workspaceId: WORKSPACE_ID,
            userId: operator.id,
            orderId,
            accountUserId: account.id,
            kind: method,
            amount: total.toFixed(2),
          })
      }
      return created
    })
    return { ok: true as const, orderNumber: result.orderNumber }
  } catch (error) {
    if (error instanceof CounterOrderError)
      return { ok: false as const, message: error.message }
    reportDatabaseFailure('counter-order', error)
    return {
      ok: false as const,
      message:
        'The order could not be completed. Check item availability, account limits, and try again.',
    }
  }
}
