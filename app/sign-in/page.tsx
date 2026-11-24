import { redirect } from 'next/navigation'
import { AuthPanel } from '@/components/auth-panel'
import { DatabaseSetupNotice } from '@/components/database-setup-notice'
import { getCurrentUser } from '@/lib/auth-helpers'

export default async function SignInPage() {
  if (!process.env.DATABASE_URL) return <DatabaseSetupNotice />
  let currentUser
  try {
    currentUser = await getCurrentUser()
  } catch {
    return <DatabaseSetupNotice />
  }
  if (currentUser) redirect(currentUser.role === 'customer' ? '/' : '/operations/workspace')
  return <main className="auth-page"><AuthPanel mode="sign-in" portal="customer" /></main>
}
