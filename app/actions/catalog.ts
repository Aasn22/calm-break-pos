'use server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { changeCatalog, CatalogError } from '@/lib/server/catalog'
import { reportDatabaseFailure } from '@/lib/db/diagnostics'
export async function manageCatalog(
  operation: 'create' | 'edit' | 'stock',
  input: unknown,
) {
  const actor = await getCurrentUser()
  if (!actor || !['admin', 'manager'].includes(actor.role))
    return {
      ok: false as const,
      message: 'Administrator or manager access is required.',
    }
  if (!['create', 'edit', 'stock'].includes(operation))
    return { ok: false as const, message: 'Invalid operation.' }
  try {
    await changeCatalog(db, actor.id, operation, input)
    revalidatePath('/')
    revalidatePath('/operations/workspace')
    return { ok: true as const }
  } catch (error) {
    if (error instanceof CatalogError)
      return { ok: false as const, message: error.message }
    reportDatabaseFailure('catalog-management', error)
    return {
      ok: false as const,
      message:
        'The item change could not be confirmed. Refresh the catalog before retrying.',
    }
  }
}
