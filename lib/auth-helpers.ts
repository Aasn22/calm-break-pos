import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export type AppRole = 'customer' | 'admin' | 'cashier' | 'shopkeeper' | 'chef' | 'order_taker' | 'barista' | 'kitchen' | 'manager'

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

export function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'manager'
}

export function isStaffRole(role: string): role is Exclude<AppRole, 'customer'> {
  return role !== 'customer' && ['admin', 'cashier', 'shopkeeper', 'chef', 'order_taker', 'barista', 'kitchen', 'manager'].includes(role)
}
