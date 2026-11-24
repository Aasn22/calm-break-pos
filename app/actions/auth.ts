'use server'

import { and, eq, or } from 'drizzle-orm'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db, WORKSPACE_ID } from '@/lib/db'
import { user } from '@/lib/db/schema'

const customerRegistrationSchema = z.object({
  employeeId: z.string().trim().toUpperCase().regex(/^KV\d{4}$/),
  password: z.string().min(12).max(128),
})

const signInSchema = z.object({
  portal: z.enum(['customer', 'operations']),
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
})

const signInFailure = 'The ID or username and password could not be verified. Customer accounts also require admin approval.'

export async function registerCustomerAccount(input: unknown) {
  const parsed = customerRegistrationSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Enter a valid employee ID in the format KV0000 and a password of at least 12 characters.' }

  const employeeId = parsed.data.employeeId
  const username = employeeId.toLowerCase()
  const email = `customer-${username}@accounts.calm-break.invalid`
  const [existing] = await db.select({ id: user.id }).from(user)
    .where(or(eq(user.employeeId, employeeId), eq(user.username, username), eq(user.email, email))).limit(1)
  if (existing) return { ok: false as const, message: 'That employee ID is already registered.' }

  try {
    const created = await auth.api.signUpEmail({
      body: { name: employeeId, email, password: parsed.data.password },
    })
    const [updated] = await db.update(user).set({
      role: 'customer',
      workspaceId: WORKSPACE_ID,
      username,
      employeeId,
      emailVerified: true,
      isApproved: false,
      approvedAt: null,
      approvedBy: null,
      updatedAt: new Date(),
    }).where(and(eq(user.id, created.user.id), eq(user.role, 'customer'))).returning({ id: user.id })

    if (!updated) throw new Error('Account setup incomplete')
    return { ok: true as const }
  } catch {
    return { ok: false as const, message: 'We could not register that ID. Check it and try again or contact the POS administrator.' }
  }
}

export async function signInWithIdentifier(input: unknown) {
  const parsed = signInSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: signInFailure }

  const identifier = parsed.data.identifier.trim()
  let account: { email: string; role: string; isApproved: boolean } | undefined

  if (parsed.data.portal === 'customer') {
    const employeeId = identifier.toUpperCase()
    if (!/^KV\d{4}$/.test(employeeId)) return { ok: false as const, message: signInFailure }
    const [found] = await db.select({ email: user.email, role: user.role, isApproved: user.isApproved }).from(user)
      .where(and(eq(user.workspaceId, WORKSPACE_ID), eq(user.employeeId, employeeId), eq(user.role, 'customer'))).limit(1)
    account = found
    if (!account?.isApproved) return { ok: false as const, message: signInFailure }
  } else {
    const normalizedIdentifier = identifier.toLowerCase()
    const [found] = await db.select({ email: user.email, role: user.role, isApproved: user.isApproved }).from(user)
      .where(and(
        eq(user.workspaceId, WORKSPACE_ID),
        or(eq(user.username, normalizedIdentifier), eq(user.email, normalizedIdentifier)),
      )).limit(1)
    account = found
    if (!account || account.role === 'customer' || !account.isApproved) return { ok: false as const, message: signInFailure }
  }

  try {
    await auth.api.signInEmail({
      body: { email: account.email, password: parsed.data.password },
      headers: await headers(),
    })
    return { ok: true as const, destination: account.role === 'customer' ? '/' : '/operations/workspace' }
  } catch {
    return { ok: false as const, message: signInFailure }
  }
}
