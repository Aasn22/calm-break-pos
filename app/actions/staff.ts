'use server'

import { getCurrentUser } from '@/lib/auth-helpers'

import { and, desc, eq, or } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db, WORKSPACE_ID } from '@/lib/db'
import { orderItems, orders, user } from '@/lib/db/schema'
import { createCounterOrder } from '@/lib/server/counter-orders'
import { canAdvanceOrder } from '@/lib/order-transitions'
import { isAdminRole, isStaffRole } from '@/lib/auth-helpers'

export async function placeStaffOrder(input: unknown) {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user)
    return {
      ok: false as const,
      message: 'Please sign in again before using the POS terminal.',
    }
  const result = await createCounterOrder(db, session.user, input)
  if (result.ok) {
    revalidatePath('/operations/workspace')
    revalidatePath('/')
  }
  return result
}

const staffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/),
  password: z.string().min(12).max(128),
  role: z.enum(['cashier', 'shopkeeper', 'chef', 'order_taker']),
  creditLimit: z.number().min(0).max(100000),
  monthlyDeductionLimit: z.number().min(0).max(100000),
})

export async function createStaffAccount(input: unknown) {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user || !isAdminRole(session.user.role))
    return { ok: false as const, message: 'Administrator access is required.' }
  const parsed = staffSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false as const,
      message: 'Review the account details and try again.',
    }
  const values = parsed.data
  const internalEmail = `${values.username}@staff.calm-break.invalid`
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(
      or(eq(user.username, values.username), eq(user.email, internalEmail)),
    )
    .limit(1)
  if (existing.length)
    return { ok: false as const, message: 'That username is already in use.' }
  try {
    const created = await auth.api.signUpEmail({
      body: {
        name: values.name,
        email: internalEmail,
        password: values.password,
      },
    })
    if (!created.user?.id)
      return {
        ok: false as const,
        message: 'Could not create the account. Try again.',
      }
    const updated = await db
      .update(user)
      .set({
        role: values.role,
        workspaceId: WORKSPACE_ID,
        username: values.username,
        employeeId: null,
        emailVerified: true,
        isApproved: true,
        creditLimit: values.creditLimit.toFixed(2),
        monthlyDeductionLimit: values.monthlyDeductionLimit.toFixed(2),
        updatedAt: new Date(),
      })
      .where(and(eq(user.id, created.user.id), eq(user.role, 'customer')))
      .returning({ id: user.id })
    if (!updated.length)
      return {
        ok: false as const,
        message: 'Could not finish the account setup.',
      }
    revalidatePath('/operations/workspace')
    return { ok: true as const }
  } catch {
    return {
      ok: false as const,
      message:
        'Could not create the account. Check the username and try again.',
    }
  }
}

const customerAccountSchema = z.object({ userId: z.string().min(1).max(100) })

export async function getPendingCustomerAccounts() {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user || !isAdminRole(session.user.role)) return []
  return db
    .select({
      id: user.id,
      name: user.name,
      employeeId: user.employeeId,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(
      and(
        eq(user.workspaceId, WORKSPACE_ID),
        eq(user.role, 'customer'),
        eq(user.isApproved, false),
      ),
    )
    .orderBy(desc(user.createdAt))
    .limit(100)
}

export async function approveCustomerAccount(input: unknown) {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user || !isAdminRole(session.user.role))
    return { ok: false as const, message: 'Administrator access is required.' }
  const parsed = customerAccountSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false as const,
      message: 'That customer account could not be approved.',
    }
  const approvedAt = new Date()
  const [updated] = await db
    .update(user)
    .set({
      isApproved: true,
      approvedAt,
      approvedBy: session.user.id,
      updatedAt: approvedAt,
    })
    .where(
      and(
        eq(user.id, parsed.data.userId),
        eq(user.workspaceId, WORKSPACE_ID),
        eq(user.role, 'customer'),
        eq(user.isApproved, false),
      ),
    )
    .returning({ id: user.id })
  if (!updated)
    return {
      ok: false as const,
      message: 'That customer account is no longer awaiting approval.',
    }
  revalidatePath('/operations/workspace')
  revalidatePath('/')
  return { ok: true as const }
}

const statusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum([
    'preparing',
    'ready',
    'out_for_delivery',
    'completed',
    'cancelled',
  ]),
})
export async function updateOrderStatus(input: unknown) {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user || !isStaffRole(session.user.role))
    return { ok: false as const, message: 'Staff access is required.' }
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false as const, message: 'Invalid order update.' }
  const [current] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(
      and(
        eq(orders.id, parsed.data.orderId),
        eq(orders.workspaceId, WORKSPACE_ID),
      ),
    )
    .limit(1)
  if (
    !current ||
    !canAdvanceOrder(session.user.role, current.status, parsed.data.status)
  )
    return {
      ok: false as const,
      message: 'That order status cannot be changed by your account.',
    }
  const timestamp = new Date()
  const changed = await db
    .update(orders)
    .set({
      status: parsed.data.status,
      ...(parsed.data.status === 'preparing'
        ? { prepStartedAt: timestamp }
        : {}),
      ...(parsed.data.status === 'ready' ? { readyAt: timestamp } : {}),
      ...(parsed.data.status === 'completed' ? { completedAt: timestamp } : {}),
    })
    .where(
      and(
        eq(orders.id, parsed.data.orderId),
        eq(orders.workspaceId, WORKSPACE_ID),
        eq(orders.status, current.status),
      ),
    )
    .returning({ id: orders.id })
  if (!changed.length)
    return {
      ok: false as const,
      message:
        'This order changed on another device. Refresh the board and try again.',
    }
  revalidatePath('/operations/workspace')
  revalidatePath('/')
  return { ok: true as const }
}

export async function getOperationsOrders() {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user || !isStaffRole(session.user.role)) return []
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      segment: orders.segment,
      paymentMethod: orders.paymentMethod,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.workspaceId, WORKSPACE_ID))
    .orderBy(desc(orders.createdAt))
    .limit(50)
}

export async function getOrderLines(orderId: string) {
  const currentUser = await getCurrentUser()
  const session = currentUser ? { user: currentUser } : null
  if (!session?.user || !isStaffRole(session.user.role)) return []
  return db
    .select({
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.workspaceId, WORKSPACE_ID),
      ),
    )
}
