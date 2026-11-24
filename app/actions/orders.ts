'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db, WORKSPACE_ID } from '@/lib/db'
import { ledgerEntries, orderItems, orders, products, user } from '@/lib/db/schema'

const checkoutSchema = z.object({
  lines: z.array(z.object({ productId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20) })).min(1).max(30),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'credit', 'salary_deduction']),
  paymentReference: z.string().trim().max(120).optional(),
  deliveryLocation: z.string().trim().max(200).optional(),
  orderType: z.enum(['dine_in', 'takeaway', 'staff_delivery']).default('takeaway'),
})

export async function placeOrder(input: unknown) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || session.user.role !== 'customer') return { ok: false as const, message: 'Sign in with a customer account to place an order.' }
  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Review your order details and try again.' }

  const quantities = new Map<string, number>()
  for (const line of parsed.data.lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity)
  if ([...quantities.values()].some((quantity) => quantity > 20)) return { ok: false as const, message: 'The limit is 20 of each item per order.' }
  const ids = [...quantities.keys()].sort()
  const method = parsed.data.paymentMethod
  if (method === 'credit' || method === 'salary_deduction') return { ok: false as const, message: 'That payment option is only available to staff.' }

  try {
    const orderId = randomUUID()
    const result = await db.transaction(async (tx) => {
      const catalog = await tx.select().from(products).where(and(eq(products.workspaceId, WORKSPACE_ID), inArray(products.id, ids), eq(products.available, true))).orderBy(products.id).for('update')
      if (catalog.length !== ids.length) throw new Error('Unavailable item')
      let subtotal = 0
      const lines = catalog.map((product) => {
        const quantity = quantities.get(product.id) ?? 0
        if (product.segment === 'tuck_shop' && product.stock < quantity) throw new Error('Insufficient stock')
        const unitPrice = Number(product.price)
        subtotal += unitPrice * quantity
        return { product, quantity, unitPrice }
      })
      const total = Math.round(subtotal * 100) / 100
      const [created] = await tx.insert(orders).values({
        id: orderId, workspaceId: WORKSPACE_ID, userId: session.user.id, customerUserId: session.user.id,
        segment: lines.every(({ product }) => product.segment === 'tuck_shop') ? 'tuck_shop' : 'cafe',
        paymentMethod: method, paymentReference: parsed.data.paymentReference || null,
        deliveryLocation: parsed.data.deliveryLocation || null, orderType: parsed.data.orderType,
        subtotal: total.toFixed(2), total: total.toFixed(2),
      }).returning({ id: orders.id, orderNumber: orders.orderNumber })
      for (const { product, quantity, unitPrice } of lines) {
        await tx.insert(orderItems).values({ id: randomUUID(), workspaceId: WORKSPACE_ID, userId: session.user.id, orderId, productId: product.id, productName: product.name, quantity, unitPrice: unitPrice.toFixed(2) })
        if (product.segment === 'tuck_shop') await tx.update(products).set({ stock: product.stock - quantity, updatedAt: new Date() }).where(and(eq(products.id, product.id), eq(products.workspaceId, WORKSPACE_ID)))
      }
      return { id: created.id, orderNumber: created.orderNumber }
    })
    revalidatePath('/')
    revalidatePath('/operations/workspace')
    return { ok: true as const, orderNumber: result.orderNumber }
  } catch {
    return { ok: false as const, message: 'An item changed or is no longer available. Refresh the menu and try again.' }
  }
}

export async function getCustomerOrders() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || session.user.role !== 'customer') return []
  return db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, total: orders.total, createdAt: orders.createdAt })
    .from(orders).where(and(eq(orders.workspaceId, WORKSPACE_ID), eq(orders.customerUserId, session.user.id))).orderBy(orders.createdAt)
}

export async function getStaffAccounts() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || session.user.role !== 'manager') return []
  return db.select({ id: user.id, name: user.name, email: user.email, role: user.role, employeeId: user.employeeId, creditLimit: user.creditLimit, monthlyDeductionLimit: user.monthlyDeductionLimit })
    .from(user).where(and(eq(user.workspaceId, WORKSPACE_ID), inArray(user.role, ['cashier', 'barista', 'kitchen', 'manager'])))
}
