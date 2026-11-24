import { and, asc, eq } from 'drizzle-orm'
import { CustomerStorefront } from '@/components/customer-storefront'
import { DatabaseSetupNotice } from '@/components/database-setup-notice'
import { getCustomerOrders } from '@/app/actions/orders'
import { getCurrentUser } from '@/lib/auth-helpers'
import { db, WORKSPACE_ID } from '@/lib/db'
import { products } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (!process.env.DATABASE_URL) return <DatabaseSetupNotice />
  try {
    const currentUser = await getCurrentUser()
    const catalog = await db.select({ id: products.id, name: products.name, description: products.description, category: products.category, segment: products.segment, price: products.price, stock: products.stock, prepMinutes: products.prepMinutes })
      .from(products).where(and(eq(products.workspaceId, WORKSPACE_ID), eq(products.available, true))).orderBy(asc(products.category), asc(products.name))
    const customerOrders = currentUser?.role === 'customer' ? await getCustomerOrders() : []
    return <CustomerStorefront items={catalog} customerName={currentUser?.role === 'customer' ? currentUser.name : undefined} orders={customerOrders} />
  } catch {
    return <DatabaseSetupNotice />
  }
}
