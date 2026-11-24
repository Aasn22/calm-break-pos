import { redirect } from 'next/navigation'
import { AuthPanel } from '@/components/auth-panel'
import { getCurrentUser } from '@/lib/auth-helpers'
import { DatabaseSetupNotice } from '@/components/database-setup-notice'

export default async function OperationsSignInPage() {
  if (!process.env.DATABASE_URL) return <DatabaseSetupNotice portal="operations" />
  let currentUser
  try {
    currentUser = await getCurrentUser()
  } catch {
    return <DatabaseSetupNotice portal="operations" />
  }
  if (currentUser?.role === 'customer') return <main className="auth-page"><div className="setup-card"><span className="auth-kicker">CUSTOMER ACCOUNT</span><h1>Use your team account.</h1><p>Customer and operations roles have separate access. Sign out and use a staff account provisioned by your manager.</p></div></main>
  if (currentUser) redirect('/operations/workspace')
  return <main className="auth-page operations-auth"><AuthPanel mode="sign-in" portal="operations" /></main>
}
