import { eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema'
const { verification } = schema
const key = (id: string) => `admin-account-reauth:${id}`
export async function takeReauthenticationAttempt(
  db: NodePgDatabase<typeof schema>,
  actorId: string,
) {
  const throttleId = key(actorId)
  // Shared, atomic throttle in the existing auth verification store. No secrets
  // are stored here; its namespaced value is only an attempt counter.
  const [attempt] = await db
    .insert(verification)
    .values({
      id: throttleId,
      identifier: throttleId,
      value: '1',
      expiresAt: new Date(Date.now() + 15 * 60000),
    })
    .onConflictDoUpdate({
      target: verification.id,
      set: {
        value: sql`CASE WHEN ${verification.expiresAt} < now() THEN '1' ELSE ((${verification.value})::integer + 1)::text END`,
        expiresAt: sql`CASE WHEN ${verification.expiresAt} < now() THEN now() + interval '15 minutes' ELSE ${verification.expiresAt} END`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: verification.value })

  return Number(attempt.value) <= 10
}
export async function clearReauthenticationAttempts(
  db: NodePgDatabase<typeof schema>,
  actorId: string,
) {
  await db.delete(verification).where(eq(verification.id, key(actorId)))
}
