import {
  allowedSection,
  operationsSections,
  type OperationsSection,
} from '@/lib/operations-modules'
import { purchasing } from '@/lib/server/purchasing'
import { loyalty } from '@/lib/server/loyalty'
import { reportDatabaseFailure } from '@/lib/db/diagnostics'
import { asc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getStaffAccounts } from '@/app/actions/orders'
import {
  getOperationsOrders,
  getPendingCustomerAccounts,
} from '@/app/actions/staff'
import { OperationsDashboard } from '@/components/operations-dashboard'
import { DatabaseSetupNotice } from '@/components/database-setup-notice'
import { getCurrentUser, isAdminRole, isStaffRole } from '@/lib/auth-helpers'
import { db, WORKSPACE_ID } from '@/lib/db'
import { accountManagement } from '@/lib/server/account-management'
import { products } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function OperationsWorkspacePage({
  searchParams,
}: { searchParams?: Promise<{ section?: string }> } = {}) {
  if (!process.env.DATABASE_URL)
    return (
      <main className="setup-page">
        <div className="setup-card">
          <span className="auth-kicker">DATABASE SETUP REQUIRED</span>
          <h1>Operations are not connected yet.</h1>
          <p>
            Connect an isolated PostgreSQL database for this environment before
            using staff sign-in or order management.
          </p>
          <a href="/">Back to customer menu</a>
        </div>
      </main>
    )
  let currentUser
  try {
    currentUser = await getCurrentUser()
  } catch {
    return <DatabaseSetupNotice portal="operations" />
  }
  if (!currentUser) redirect('/operations')
  if (!isStaffRole(currentUser.role)) redirect('/')
  const requested = (await searchParams)?.section
  const section: OperationsSection = operationsSections.includes(
    requested as OperationsSection,
  )
    ? (requested as OperationsSection)
    : currentUser.role === 'admin'
      ? 'admin'
      : ['manager', 'cashier', 'shopkeeper', 'order_taker'].includes(
            currentUser.role,
          )
        ? 'terminal'
        : 'orders'
  if (!allowedSection(currentUser.role, section))
    redirect('/operations/workspace')

  try {
    const [catalog, orders, staff, pendingCustomers, managedAccounts] =
      await Promise.all([
        db
          .select({
            id: products.id,
            name: products.name,
            description: products.description,
            updatedAt: products.updatedAt,
            sku: products.sku,
            category: products.category,
            segment: products.segment,
            price: products.price,
            stock: products.stock,
            lowStockAt: products.lowStockAt,
            prepMinutes: products.prepMinutes,
            available: products.available,
          })
          .from(products)
          .where(eq(products.workspaceId, WORKSPACE_ID))
          .orderBy(asc(products.category), asc(products.name)),
        getOperationsOrders(),
        isAdminRole(currentUser.role)
          ? getStaffAccounts()
          : Promise.resolve([]),
        isAdminRole(currentUser.role)
          ? getPendingCustomerAccounts()
          : Promise.resolve([]),
        currentUser.role === 'admin'
          ? accountManagement(db).list(currentUser.id)
          : Promise.resolve([]),
      ])
    const purchaseData =
      section === 'purchasing' ? await purchasing(db).list(currentUser.id) : []
    let loyaltyData = null
    if (section === 'loyalty') {
      try {
        loyaltyData = await loyalty(db).view(currentUser.id)
      } catch (error) {
        reportDatabaseFailure('loyalty-readiness', error)
      }
    }
    return (
      <OperationsDashboard
        initialSection={section}
        purchaseData={purchaseData}
        loyaltyData={loyaltyData}
        operator={{
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          employeeId: currentUser.employeeId,
        }}
        orders={orders}
        products={catalog}
        staff={staff}
        pendingCustomers={pendingCustomers}
        managedAccounts={managedAccounts}
      />
    )
  } catch (error) {
    reportDatabaseFailure('operations-workspace', error)
    return <DatabaseSetupNotice portal="operations" />
  }
}
