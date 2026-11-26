'use server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { purchasing, OperationsError } from '@/lib/server/purchasing'
import { loyalty } from '@/lib/server/loyalty'
import { reportDatabaseFailure } from '@/lib/db/diagnostics'
export async function moduleAction(
  operation:
    | 'purchase-create'
    | 'purchase-receive'
    | 'purchase-cancel'
    | 'loyalty-configure'
    | 'loyalty-award'
    | 'loyalty-redeem'
    | 'loyalty-fulfill',
  input: unknown,
) {
  const actor = await getCurrentUser()
  if (!actor) return { ok: false as const, message: 'Please sign in again.' }
  try {
    const d = input as Record<string, unknown>
    if (operation === 'purchase-create')
      await purchasing(db).create(actor.id, input)
    else if (
      operation === 'purchase-receive' ||
      operation === 'purchase-cancel'
    ) {
      if (typeof d?.id !== 'string')
        throw new OperationsError('Select a purchase.')
      await purchasing(db).update(
        actor.id,
        d.id,
        operation === 'purchase-receive' ? 'receive' : 'cancel',
      )
    } else if (operation === 'loyalty-configure')
      await loyalty(db).configure(actor.id, input)
    else if (operation === 'loyalty-award') {
      if (typeof d?.id !== 'string')
        throw new OperationsError('Select a completed order.')
      await loyalty(db).award(actor.id, d.id)
    } else if (operation === 'loyalty-fulfill') {
      if (typeof d?.id !== 'string')
        throw new OperationsError('Select a redeemed reward.')
      await loyalty(db).fulfill(actor.id, d.id)
    } else if (operation === 'loyalty-redeem') {
      if (typeof d?.customerId !== 'string' || typeof d?.key !== 'string')
        throw new OperationsError('Select a customer.')
      await loyalty(db).redeem(
        actor.id,
        d.customerId,
        d.key,
        actor.role === 'customer',
      )
    } else throw new OperationsError('Invalid operation.')
    for (const path of [
      '/',
      '/loyalty',
      '/operations/workspace',
      '/operations/admin',
      '/operations/purchasing',
      '/operations/inventory',
      '/operations/loyalty',
    ])
      revalidatePath(path)
    return { ok: true as const }
  } catch (error) {
    if (error instanceof OperationsError)
      return { ok: false as const, message: error.message }
    reportDatabaseFailure('operations-module', error)
    return {
      ok: false as const,
      message:
        'Could not confirm the change. Refresh before retrying. If this is a new installation, the loyalty migration must run before use.',
    }
  }
}
