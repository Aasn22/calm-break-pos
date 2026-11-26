'use server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { fulfilment, FulfilmentError } from '@/lib/server/fulfilment'
import { reportDatabaseFailure } from '@/lib/db/diagnostics'
export async function changeFulfilment(input: unknown) {
  const actor = await getCurrentUser()
  if (!actor) return { ok: false as const, message: 'Please sign in again.' }
  try {
    await fulfilment(db).update(actor.id, input)
    for (const p of [
      '/',
      '/account',
      '/operations/orders',
      '/operations/workspace',
      '/operations/admin',
    ])
      revalidatePath(p)
    return { ok: true as const }
  } catch (e) {
    if (e instanceof FulfilmentError)
      return { ok: false as const, message: e.message }
    reportDatabaseFailure('fulfilment', e)
    return {
      ok: false as const,
      message: 'Could not confirm update. Refresh before retrying.',
    }
  }
}
export async function saveProfile(input: unknown) {
  const actor = await getCurrentUser()
  if (!actor) return { ok: false as const, message: 'Please sign in again.' }
  try {
    await fulfilment(db).profile(actor.id, input)
    revalidatePath('/account')
    revalidatePath('/operations/orders')
    return { ok: true as const }
  } catch (e) {
    if (e instanceof FulfilmentError)
      return { ok: false as const, message: e.message }
    return { ok: false as const, message: 'Could not save profile.' }
  }
}
