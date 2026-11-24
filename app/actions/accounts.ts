'use server'

import {
  takeReauthenticationAttempt,
  clearReauthenticationAttempts,
} from '@/lib/server/reauth-throttle'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  accountManagement,
  AccountManagementError,
} from '@/lib/server/account-management'
import { reportDatabaseFailure } from '@/lib/db/diagnostics'

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
  try {
    if (!(await takeReauthenticationAttempt(db, identity.user.id)))
      return {
        ok: false as const,
        message:
          'Too many account-management attempts. Wait 15 minutes before retrying.',
      }
    const result = await accountManagement(db).mutate(
      identity.user.id,
      operation,
      input,
      administratorPassword,
    )
    try {
      await clearReauthenticationAttempts(db, identity.user.id)
    } catch (error) {
      reportDatabaseFailure('account-management-throttle-cleanup', error)
    }
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
        'The account change could not be confirmed. Refresh the directory before retrying.',
    }
  }
}
