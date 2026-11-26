import Link from 'next/link'
export function AdminOverview({
  stats,
}: {
  stats: {
    products: number
    lowStock: number
    openOrders: number
    pendingCustomers: number
    accounts: number
  }
}) {
  return (
    <div>
      <div className="module-metrics">
        <article>
          <small>RECENT OPEN ORDERS</small>
          <strong>{stats.openOrders}</strong>
        </article>
        <article>
          <small>LOW-STOCK SHOP ITEMS</small>
          <strong>{stats.lowStock}</strong>
        </article>
        <article>
          <small>AWAITING APPROVAL</small>
          <strong>{stats.pendingCustomers}</strong>
        </article>
      </div>
      <div className="module-launch-grid">
        {[
          [
            '/operations/purchasing',
            'Purchasing',
            'Create supplier orders and receive shop stock.',
          ],
          [
            '/operations/inventory',
            'Inventory & café menu',
            `${stats.products} products. Prices, availability, stock and preparation times.`,
          ],
          [
            '/operations/customers',
            'Customers',
            'Approve, suspend, edit accounts and reset passwords.',
          ],
          [
            '/operations/team',
            'Team & access',
            `${stats.accounts} accounts. Roles, credit limits and secure password resets.`,
          ],
          [
            '/operations/loyalty',
            'Loyalty program',
            'Configure earning rules, award points and redeem rewards.',
          ],
          [
            '/operations/orders',
            'Order monitor',
            'Track and advance current orders.',
          ],
          [
            '/',
            'Customer ordering portal',
            'Open the customer storefront in a separate tab.',
          ],
          [
            '/loyalty',
            'Customer loyalty wallet',
            'Customer-only points and reward history.',
          ],
        ].map(([url, title, description]) => (
          <Link
            key={url}
            href={url}
            className="module-launch"
            {...(url === '/' || url === '/loyalty'
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
          >
            <span className="auth-kicker">
              {url === '/' || url === '/loyalty'
                ? 'CUSTOMER EXPERIENCE'
                : 'OPERATIONS'}
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
            <span>Open →</span>
          </Link>
        ))}
      </div>
      <p className="people-explainer">
        Order indicators cover the most recent 50 orders. Customer links open
        the customer experience; your admin login does not become a customer
        account. No roles or permissions are changed by opening a link.
      </p>
    </div>
  )
}
