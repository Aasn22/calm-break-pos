import { asc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getStaffAccounts } from '@/app/actions/orders'
import { getOperationsOrders, getPendingCustomerAccounts } from '@/app/actions/staff'
import { OperationsDashboard } from '@/components/operations-dashboard'
import { DatabaseSetupNotice } from '@/components/database-setup-notice'
import { getCurrentUser, isAdminRole, isStaffRole } from '@/lib/auth-helpers'
import { db, WORKSPACE_ID } from '@/lib/db'
import { products } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function OperationsWorkspacePage() {
  if (!process.env.DATABASE_URL) return <main className="setup-page"><div className="setup-card"><span className="auth-kicker">DATABASE SETUP REQUIRED</span><h1>Operations are not connected yet.</h1><p>Connect an isolated PostgreSQL database for this environment before using staff sign-in or order management.</p><a href="/">Back to customer menu</a></div></main>
  let currentUser
  try {
    currentUser = await getCurrentUser()
  } catch {
    return <DatabaseSetupNotice portal="operations" />
  }
  if (!currentUser) redirect('/operations')
  if (!isStaffRole(currentUser.role)) redirect('/')
  try {
    const [catalog, orders, staff, pendingCustomers] = await Promise.all([
      db.select({ id: products.id, name: products.name, sku: products.sku, category: products.category, segment: products.segment, price: products.price, stock: products.stock, lowStockAt: products.lowStockAt, prepMinutes: products.prepMinutes, available: products.available })
        .from(products).where(eq(products.workspaceId, WORKSPACE_ID)).orderBy(asc(products.category), asc(products.name)),
      getOperationsOrders(),
      isAdminRole(currentUser.role) ? getStaffAccounts() : Promise.resolve([]),
      isAdminRole(currentUser.role) ? getPendingCustomerAccounts() : Promise.resolve([]),
    ])
    return <OperationsDashboard operator={{ name: currentUser.name, role: currentUser.role, employeeId: currentUser.employeeId }} orders={orders} products={catalog} staff={staff} pendingCustomers={pendingCustomers} />
  } catch {
    return <DatabaseSetupNotice portal="operations" />
  }
}
