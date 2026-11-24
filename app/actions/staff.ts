'use server'

import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db, WORKSPACE_ID } from '@/lib/db'
import { ledgerEntries, orderItems, orders, products, user } from '@/lib/db/schema'
import { isAdminRole, isStaffRole } from '@/lib/auth-helpers'

const staffOrderSchema = z.object({
  lines: z.array(z.object({ productId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20) })).min(1).max(30),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'credit', 'salary_deduction']),
  accountIdentifier: z.string().trim().max(254).optional().or(z.literal('')),
  paymentReference: z.string().trim().max(120).optional(),
  orderType: z.enum(['dine_in', 'takeaway', 'staff_delivery']).default('dine_in'),
})

export async function placeStaffOrder(input: unknown) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || !['admin', 'manager', 'cashier', 'shopkeeper', 'order_taker'].includes(session.user.role)) return { ok: false as const, message: 'POS terminal access is required.' }
  const parsed = staffOrderSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Review the order details and try again.' }
  const quantities = new Map<string, number>()
  for (const line of parsed.data.lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity)
  if ([...quantities.values()].some((quantity) => quantity > 20)) return { ok: false as const, message: 'The limit is 20 of each item per order.' }
  const ids = [...quantities.keys()].sort()
  const method = parsed.data.paymentMethod
  const accountIdentifier = parsed.data.accountIdentifier?.trim()
  if ((method === 'credit' || method === 'salary_deduction') && !accountIdentifier) return { ok: false as const, message: 'Enter the staff username or employee ID for this payment method.' }

  try {
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
      let account: typeof user.$inferSelect | undefined
      if ((method === 'credit' || method === 'salary_deduction') && accountIdentifier) {
        const normalizedIdentifier = accountIdentifier.toLowerCase()
        account = (await tx.select().from(user).where(and(
          eq(user.workspaceId, WORKSPACE_ID),
          or(eq(user.username, normalizedIdentifier), eq(user.employeeId, accountIdentifier.toUpperCase()), eq(user.email, normalizedIdentifier)),
        )).limit(1).for('update'))[0]
        if (!account) throw new Error('Account not found')
      }
      if ((method === 'credit' || method === 'salary_deduction') && (!account || account.role === 'customer')) throw new Error('Staff account required')
      if (method === 'credit' && account) {
        const [balance] = await tx.select({ amount: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` }).from(ledgerEntries)
          .where(and(eq(ledgerEntries.workspaceId, WORKSPACE_ID), eq(ledgerEntries.accountUserId, account.id), eq(ledgerEntries.kind, 'credit')))
        if (Number(balance.amount) + total > Number(account.creditLimit)) throw new Error('Credit limit exceeded')
      }
      if (method === 'salary_deduction' && account) {
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)
        const [balance] = await tx.select({ amount: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` }).from(ledgerEntries)
          .where(and(eq(ledgerEntries.workspaceId, WORKSPACE_ID), eq(ledgerEntries.accountUserId, account.id), eq(ledgerEntries.kind, 'salary_deduction'), gte(ledgerEntries.createdAt, startOfMonth)))
        if (Number(balance.amount) + total > Number(account.monthlyDeductionLimit)) throw new Error('Monthly deduction limit exceeded')
      }
      const orderId = randomUUID()
      const [created] = await tx.insert(orders).values({
        id: orderId, workspaceId: WORKSPACE_ID, userId: session.user.id, customerUserId: account?.id ?? null,
        segment: lines.every(({ product }) => product.segment === 'tuck_shop') ? 'tuck_shop' : 'cafe',
        paymentMethod: method, paymentReference: parsed.data.paymentReference || null, orderType: parsed.data.orderType,
        subtotal: total.toFixed(2), total: total.toFixed(2),
      }).returning({ orderNumber: orders.orderNumber })
      for (const { product, quantity, unitPrice } of lines) {
        await tx.insert(orderItems).values({ id: randomUUID(), workspaceId: WORKSPACE_ID, userId: session.user.id, orderId, productId: product.id, productName: product.name, quantity, unitPrice: unitPrice.toFixed(2) })
        if (product.segment === 'tuck_shop') await tx.update(products).set({ stock: product.stock - quantity, updatedAt: new Date() }).where(and(eq(products.id, product.id), eq(products.workspaceId, WORKSPACE_ID)))
      }
      if (account && (method === 'credit' || method === 'salary_deduction')) {
        await tx.insert(ledgerEntries).values({ id: randomUUID(), workspaceId: WORKSPACE_ID, userId: session.user.id, orderId, accountUserId: account.id, kind: method, amount: total.toFixed(2) })
      }
      return created
    })
    revalidatePath('/operations/workspace')
    revalidatePath('/')
    return { ok: true as const, orderNumber: result.orderNumber }
  } catch {
    return { ok: false as const, message: 'The order could not be completed. Check item availability, account limits, and try again.' }
  }
}

const staffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/),
  password: z.string().min(12).max(128),
  role: z.enum(['cashier', 'shopkeeper', 'chef', 'order_taker']),
  creditLimit: z.number().min(0).max(100000),
  monthlyDeductionLimit: z.number().min(0).max(100000),
})

export async function createStaffAccount(input: unknown) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || !isAdminRole(session.user.role)) return { ok: false as const, message: 'Administrator access is required.' }
  const parsed = staffSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Review the account details and try again.' }
  const values = parsed.data
  const internalEmail = `${values.username}@staff.calm-break.invalid`
  const existing = await db.select({ id: user.id }).from(user).where(or(eq(user.username, values.username), eq(user.email, internalEmail))).limit(1)
  if (existing.length) return { ok: false as const, message: 'That username is already in use.' }
  try {
    const created = await auth.api.signUpEmail({ body: { name: values.name, email: internalEmail, password: values.password } })
    if (!created.user?.id) return { ok: false as const, message: 'Could not create the account. Try again.' }
    const updated = await db.update(user).set({
      role: values.role,
      workspaceId: WORKSPACE_ID,
      username: values.username,
      employeeId: null,
      emailVerified: true,
      isApproved: true,
      creditLimit: values.creditLimit.toFixed(2),
      monthlyDeductionLimit: values.monthlyDeductionLimit.toFixed(2),
      updatedAt: new Date(),
    }).where(and(eq(user.id, created.user.id), eq(user.role, 'customer'))).returning({ id: user.id })
    if (!updated.length) return { ok: false as const, message: 'Could not finish the account setup.' }
    revalidatePath('/operations/workspace')
    return { ok: true as const }
  } catch {
    return { ok: false as const, message: 'Could not create the account. Check the username and try again.' }
  }
}

const customerAccountSchema = z.object({ userId: z.string().min(1).max(100) })

export async function getPendingCustomerAccounts() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || !isAdminRole(session.user.role)) return []
  return db.select({ id: user.id, name: user.name, employeeId: user.employeeId, createdAt: user.createdAt }).from(user)
    .where(and(eq(user.workspaceId, WORKSPACE_ID), eq(user.role, 'customer'), eq(user.isApproved, false)))
    .orderBy(desc(user.createdAt)).limit(100)
}

export async function approveCustomerAccount(input: unknown) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || !isAdminRole(session.user.role)) return { ok: false as const, message: 'Administrator access is required.' }
  const parsed = customerAccountSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'That customer account could not be approved.' }
  const approvedAt = new Date()
  const [updated] = await db.update(user).set({ isApproved: true, approvedAt, approvedBy: session.user.id, updatedAt: approvedAt })
    .where(and(eq(user.id, parsed.data.userId), eq(user.workspaceId, WORKSPACE_ID), eq(user.role, 'customer'), eq(user.isApproved, false)))
    .returning({ id: user.id })
  if (!updated) return { ok: false as const, message: 'That customer account is no longer awaiting approval.' }
  revalidatePath('/operations/workspace')
  revalidatePath('/')
  return { ok: true as const }
}

const statusSchema = z.object({ orderId: z.string().uuid(), status: z.enum(['preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']) })
export async function updateOrderStatus(input: unknown) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || !isStaffRole(session.user.role)) return { ok: false as const, message: 'Staff access is required.' }
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Invalid order update.' }
  const [current] = await db.select({ status: orders.status }).from(orders).where(and(eq(orders.id, parsed.data.orderId), eq(orders.workspaceId, WORKSPACE_ID))).limit(1)
  const transitions: Record<string, string[]> = {
    new: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['out_for_delivery', 'completed', 'cancelled'], out_for_delivery: ['completed'],
  }
  const allowedTargets = ['chef', 'barista', 'kitchen'].includes(session.user.role) ? ['preparing', 'ready'] : transitions[current?.status ?? ''] ?? []
  if (!current || !allowedTargets.includes(parsed.data.status)) return { ok: false as const, message: 'That order status cannot be changed by your account.' }
  const timestamp = new Date()
  await db.update(orders).set({
    status: parsed.data.status,
    ...(parsed.data.status === 'preparing' ? { prepStartedAt: timestamp } : {}),
    ...(parsed.data.status === 'ready' ? { readyAt: timestamp } : {}),
    ...(parsed.data.status === 'completed' ? { completedAt: timestamp } : {}),
  }).where(and(eq(orders.id, parsed.data.orderId), eq(orders.workspaceId, WORKSPACE_ID), eq(orders.status, current.status)))
  revalidatePath('/operations/workspace')
  revalidatePath('/')
  return { ok: true as const }
}

export async function getOperationsOrders() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || !isStaffRole(session.user.role)) return []
  return db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, segment: orders.segment, paymentMethod: orders.paymentMethod, total: orders.total, createdAt: orders.createdAt })
    .from(orders).where(eq(orders.workspaceId, WORKSPACE_ID)).orderBy(desc(orders.createdAt)).limit(50)
}

export async function getOrderLines(orderId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || !isStaffRole(session.user.role)) return []
  return db.select({ productName: orderItems.productName, quantity: orderItems.quantity, unitPrice: orderItems.unitPrice })
    .from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.workspaceId, WORKSPACE_ID)))
}
