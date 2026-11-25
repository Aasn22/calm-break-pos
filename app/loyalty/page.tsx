import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { loyalty } from '@/lib/server/loyalty'
import { LoyaltyManager } from '@/components/loyalty-manager'
import { CalmBrand } from '@/components/calm-brand'
import { reportDatabaseFailure } from '@/lib/db/diagnostics'
export const dynamic = 'force-dynamic'
export default async function CustomerLoyalty() {
  const customer = await getCurrentUser()
  if (!customer) redirect('/sign-in')
  if (customer.role !== 'customer')
    return (
      <main className="module-customer-page">
        <CalmBrand />
        <h1>Customer rewards</h1>
        <p>
          Use a customer account to see its loyalty wallet. Administrators
          manage the program in Operations.
        </p>
        <Link className="primary-button" href="/operations/loyalty">
          Manage loyalty program
        </Link>
      </main>
    )
  let view
  try {
    view = await loyalty(db).view(customer.id, true)
  } catch (error) {
    reportDatabaseFailure('customer-loyalty', error)
    return (
      <main className="module-customer-page">
        <CalmBrand />
        <h1>Rewards are not available yet.</h1>
        <p>Please contact the café team.</p>
        <Link href="/">Back to the menu</Link>
      </main>
    )
  }
  return (
    <main className="module-customer-page">
      <header>
        <CalmBrand />
        <Link className="filter-chip" href="/">
          Back to menu
        </Link>
      </header>
      <h1>Your Calm Break rewards</h1>
      <p>
        Earn points on completed orders when the team awards them. Redeem a
        configured reward from your wallet.
      </p>
      <LoyaltyManager view={view} customer />
    </main>
  )
}
