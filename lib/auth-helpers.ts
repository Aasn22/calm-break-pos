import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db, WORKSPACE_ID } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

export type AppRole =
  | 'customer'
  | 'admin'
  | 'cashier'
  | 'shopkeeper'
  | 'chef'
  | 'order_taker'
  | 'barista'
  | 'kitchen'
  | 'manager'

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const [current] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      username: user.username,
    })
    .from(user)
    .where(
      and(
        eq(user.id, session.user.id),
        eq(user.workspaceId, WORKSPACE_ID),
        eq(user.isApproved, true),
      ),
    )
  return current ?? null
}

export async function requireRoles(roles: AppRole[]) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/operations')
  if (!roles.includes(currentUser.role as AppRole)) redirect('/')
  return currentUser
}

export function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'manager'
}

export function isStaffRole(
  role: string,
): role is Exclude<AppRole, 'customer'> {
  return (
    role !== 'customer' &&
    [
      'admin',
      'cashier',
      'shopkeeper',
      'chef',
      'order_taker',
      'barista',
      'kitchen',
      'manager',
    ].includes(role)
  )
}
