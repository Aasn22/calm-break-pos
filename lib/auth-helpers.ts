import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export type AppRole = 'customer' | 'cashier' | 'barista' | 'kitchen' | 'manager'

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

export async function requireRoles(roles: AppRole[]) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/operations')
  if (!roles.includes(currentUser.role as AppRole)) redirect('/')
  return currentUser
}

export function isStaffRole(role: string): role is Exclude<AppRole, 'customer'> {
  return role === 'cashier' || role === 'barista' || role === 'kitchen' || role === 'manager'
}
