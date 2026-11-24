import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { allowed, type User } from '../domain'
export { allowed } from '../domain'
import { query } from './db'
export type Surface = 'customer' | 'operations'
export const cookieName = (surface: Surface) => `cb_${surface}`
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex')
export async function currentUser(surface: Surface) {
  const token = (await cookies()).get(cookieName(surface))?.value
  if (!token) return null
  const [user] = await query<User>(
    `SELECT u.id,u.name,u.email,u.role,u.allergies FROM cb_sessions s JOIN cb_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.surface=$2 AND s.expires_at>now()`,
    [digest(token), surface],
  )
  return user && allowed(user.role, surface) ? user : null
}
export async function requireUser(surface: Surface) {
  const user = await currentUser(surface)
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}
export async function startSession(user: User, surface: Surface) {
  const token = randomBytes(32).toString('hex')
  await query(
    "INSERT INTO cb_sessions(token_hash,user_id,surface,expires_at) VALUES ($1,$2,$3,now()+interval '12 hours')",
    [digest(token), user.id, surface],
  )
  ;(await cookies()).set(cookieName(surface), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 43200,
  })
}
export async function endSession(surface: Surface) {
  const jar = await cookies()
  const token = jar.get(cookieName(surface))?.value
  if (token)
    await query('DELETE FROM cb_sessions WHERE token_hash=$1', [digest(token)])
  jar.delete(cookieName(surface))
}
