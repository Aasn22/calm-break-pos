import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { fulfilment } from '@/lib/server/fulfilment'
import { CalmBrand } from '@/components/calm-brand'
import { ProfileForm } from '@/components/profile-form'
import { FulfilmentBoard } from '@/components/fulfilment-board'
import { AutoRefresh } from '@/components/auto-refresh'
export const dynamic = 'force-dynamic'
export default async function AccountPage() {
  const actor = await getCurrentUser()
  if (!actor) redirect('/sign-in')
  const [profile] = await db
    .select({ allergies: user.allergies })
    .from(user)
    .where(eq(user.id, actor.id))
  const orders = await fulfilment(db).list(actor.id, true)
  const unpaid = orders.filter((o) => !o.paidAt && o.status !== 'cancelled')
  return (
    <main className="module-customer-page">
      <header>
        <CalmBrand />
        <Link
          className="filter-chip"
          href={actor.role === 'customer' ? '/' : '/operations/workspace'}
        >
          Back to {actor.role === 'customer' ? 'menu' : 'workspace'}
        </Link>
      </header>
      <h1>My account & bills</h1>
      <AutoRefresh />
      <div className="module-metrics">
        <article>
          <small>UNPAID (LATEST 100 ORDERS)</small>
          <strong>
            ${unpaid.reduce((n, o) => n + Number(o.total), 0).toFixed(2)}
          </strong>
        </article>
        <article>
          <small>RECENT ORDERS</small>
          <strong>{orders.length}</strong>
        </article>
        <article>
          <small>ROLE</small>
          <strong>{actor.role}</strong>
        </article>
      </div>
      <div className="ops-card">
        <div className="ops-card-heading">
          <h2>Profile & allergy information</h2>
        </div>
        <ProfileForm name={actor.name} allergies={profile?.allergies || ''} />
      </div>
      <h2>Your orders and bills</h2>
      <p>
        Manual payment receipts only; no online payment is taken here. Contact
        the café team to settle a bill.
      </p>
      <FulfilmentBoard orders={orders} role={actor.role} mine />
    </main>
  )
}
