'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  accountManagement,
  AccountManagementError,
} from '@/lib/server/account-management'
import { reportDatabaseFailure } from '@/lib/db/diagnostics'

// Per-process throttle limits repeated sensitive reauthentication attempts.
// All authorization is additionally checked against live DB rows in a transaction.
const attempts = new Map<string, { count: number; until: number }>()
export async function manageAccount(
  operation: 'create' | 'edit' | 'reset',
  input: unknown,
  administratorPassword: string,
) {
  const identity = await auth.api.getSession({ headers: await headers() })
  if (!identity?.user)
    return {
      ok: false as const,
      message: 'Please sign in with an administrator account.',
    }
  if (!['create', 'edit', 'reset'].includes(operation))
    return { ok: false as const, message: 'Invalid operation.' }
  const now = Date.now(),
    old = attempts.get(identity.user.id)
  const limit =
    old && old.until > now ? old : { count: 0, until: now + 15 * 60000 }
  if (limit.count >= 10)
    return {
      ok: false as const,
      message:
        'Too many account-management attempts. Wait 15 minutes before retrying.',
    }
  limit.count++
  attempts.set(identity.user.id, limit)
  try {
    const result = await accountManagement(db).mutate(
      identity.user.id,
      operation,
      input,
      administratorPassword,
    )
    attempts.delete(identity.user.id)
    revalidatePath('/operations/workspace')
    revalidatePath('/')
    return { ok: true as const, ...result }
  } catch (error) {
    if (error instanceof AccountManagementError)
      return { ok: false as const, message: error.message }
    reportDatabaseFailure('account-management', error)
    return {
      ok: false as const,
      message:
        'The account change failed. No partial change was saved. Refresh and retry.',
    }
  }
}
