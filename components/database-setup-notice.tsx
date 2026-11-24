import Link from 'next/link'
import { CalmBrand } from '@/components/calm-brand'

export function DatabaseSetupNotice({
  portal = 'customer',
}: {
  portal?: 'customer' | 'operations'
}) {
  return (
    <main className="setup-page">
      <div className="setup-card">
        <CalmBrand />
        <span className="auth-kicker">DATABASE SETUP REQUIRED</span>
        <h1>
          {portal === 'operations'
            ? 'Operations are not connected yet.'
            : 'Ordering is almost ready.'}
        </h1>
        <p>
          This portal requires an isolated PostgreSQL connection for this
          environment. Sign-in, account creation, menu data, and checkout remain
          unavailable until the database is configured.
        </p>
        <Link href={portal === 'operations' ? '/' : '/operations'}>
          {portal === 'operations' ? 'Back to customer menu' : 'Team sign in'}
        </Link>
      </div>
    </main>
  )
}
