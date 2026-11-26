'use server'

import { getCurrentUser } from '@/lib/auth-helpers'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, WORKSPACE_ID } from '@/lib/db'
import {
  ledgerEntries,
  orderItems,
  orders,
  products,
  user,
} from '@/lib/db/schema'
import { isAdminRole } from '@/lib/auth-helpers'

const checkoutSchema = z.object({
  key: z.string().uuid().optional(),
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
  paymentReference: z.string().trim().max(120).optional(),
  deliveryLocation: z.string().trim().max(200).optional(),
  orderType: z
    .enum(['dine_in', 'takeaway', 'staff_delivery'])
    .default('takeaway'),
})

export async function placeOrder(input: unknown) {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user || session.user.role !== 'customer')
    return {
      ok: false as const,
      message: 'Sign in with a customer account to place an order.',
    }
  const [customer] = await db
    .select({ isApproved: user.isApproved })
    .from(user)
    .where(
      and(
        eq(user.id, session.user.id),
        eq(user.workspaceId, WORKSPACE_ID),
        eq(user.role, 'customer'),
      ),
    )
    .limit(1)
  if (!customer?.isApproved)
    return {
      ok: false as const,
      message:
        'Your account must be approved by an administrator before ordering.',
    }
  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false as const,
      message: 'Review your order details and try again.',
    }

  if (
    parsed.data.orderType === 'staff_delivery' &&
    !parsed.data.deliveryLocation?.trim()
  )
    return { ok: false as const, message: 'Enter a delivery location.' }
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
  if (method === 'credit' || method === 'salary_deduction')
    return {
      ok: false as const,
      message: 'That payment option is only available to staff.',
    }

  try {
    const orderId = parsed.data.key || randomUUID()
    const result = await db.transaction(async (tx) => {
      if (parsed.data.key) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${parsed.data.key}))`,
        )
        const [existing] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, parsed.data.key))
        if (existing) {
          if (
            existing.userId !== session.user.id ||
            existing.workspaceId !== WORKSPACE_ID
          )
            throw new Error('Invalid checkout key.')
          return { id: existing.id, orderNumber: existing.orderNumber }
        }
      }

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
      if (catalog.length !== ids.length) throw new Error('Unavailable item')
      let subtotal = 0
      const lines = catalog.map((product) => {
        const quantity = quantities.get(product.id) ?? 0
        if (product.segment === 'tuck_shop' && product.stock < quantity)
          throw new Error('Insufficient stock')
        const unitPrice = Number(product.price)
        subtotal += unitPrice * quantity
        return { product, quantity, unitPrice }
      })
      const total = Math.round(subtotal * 100) / 100
      const [allergyProfile] = await tx
        .select({ allergies: user.allergies })
        .from(user)
        .where(eq(user.id, session.user.id))
      const [created] = await tx
        .insert(orders)
        .values({
          id: orderId,
          workspaceId: WORKSPACE_ID,
          userId: session.user.id,
          customerUserId: session.user.id,
          segment: lines.every(({ product }) => product.segment === 'tuck_shop')
            ? 'tuck_shop'
            : 'cafe',
          allergyNote: allergyProfile?.allergies || '',
          paymentMethod: method,
          paymentReference: parsed.data.paymentReference || null,
          deliveryLocation: parsed.data.deliveryLocation || null,
          orderType: parsed.data.orderType,
          subtotal: total.toFixed(2),
          total: total.toFixed(2),
        })
        .returning({ id: orders.id, orderNumber: orders.orderNumber })
      for (const { product, quantity, unitPrice } of lines) {
        await tx.insert(orderItems).values({
          id: randomUUID(),
          workspaceId: WORKSPACE_ID,
          userId: session.user.id,
          orderId,
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice: unitPrice.toFixed(2),
          segment: product.segment,
          minutes: product.prepMinutes,
          escalationMinutes: product.escalationMinutes,
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
      return { id: created.id, orderNumber: created.orderNumber }
    })
    revalidatePath('/')
    revalidatePath('/operations/workspace')
    return { ok: true as const, orderNumber: result.orderNumber }
  } catch {
    return {
      ok: false as const,
      message:
        'An item changed or is no longer available. Refresh the menu and try again.',
    }
  }
}

export async function getCustomerOrders() {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user || session.user.role !== 'customer') return []
  const [customer] = await db
    .select({ isApproved: user.isApproved })
    .from(user)
    .where(
      and(
        eq(user.id, session.user.id),
        eq(user.workspaceId, WORKSPACE_ID),
        eq(user.role, 'customer'),
      ),
    )
    .limit(1)
  if (!customer?.isApproved) return []
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.workspaceId, WORKSPACE_ID),
        eq(orders.customerUserId, session.user.id),
      ),
    )
    .orderBy(orders.createdAt)
}

export async function getStaffAccounts() {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user || !isAdminRole(session.user.role)) return []
  return db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
      creditLimit: user.creditLimit,
      monthlyDeductionLimit: user.monthlyDeductionLimit,
    })
    .from(user)
    .where(
      and(
        eq(user.workspaceId, WORKSPACE_ID),
        inArray(user.role, [
          'admin',
          'cashier',
          'shopkeeper',
          'chef',
          'order_taker',
          'barista',
          'kitchen',
          'manager',
        ]),
      ),
    )
}
