'use client'

import Link from 'next/link'
import { AutoRefresh } from '@/components/auto-refresh'
import { FulfilmentBoard } from '@/components/fulfilment-board'
import { overdue, type FulfilmentOrder } from '@/lib/fulfilment'
import { AdminOverview } from '@/components/admin-overview'
import { PurchasingManager } from '@/components/purchasing-manager'
import { LoyaltyManager } from '@/components/loyalty-manager'
import {
  allowedSection,
  sectionPath,
  sectionTitles,
  type OperationsSection,
  type PurchaseView,
  type LoyaltyView,
} from '@/lib/operations-modules'
import { CatalogManager } from '@/components/catalog-manager'
import type { CatalogItem } from '@/lib/catalog'
import { AccountManager } from '@/components/account-manager'
import type { ManagedAccount } from '@/lib/admin-accounts'
import { CalmBrand } from '@/components/calm-brand'
import {
  ClipboardList,
  Package,
  UsersRound,
  LayoutDashboard,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SignOutButton } from '@/components/sign-out-button'
import { runClientAction } from '@/lib/client-action'
import { approveCustomerAccount, createStaffAccount } from '@/app/actions/staff'
import { StaffTerminal } from '@/components/staff-terminal'

type Order = {
  id: string
  orderNumber: number
  status: string
  segment: string
  paymentMethod: string
  total: string
  createdAt: Date
}
type Product = CatalogItem

type Staff = {
  id: string
  name: string
  username: string | null
  role: string
  employeeId: string | null
  creditLimit: string
  monthlyDeductionLimit: string
}
type PendingCustomer = {
  id: string
  name: string
  employeeId: string | null
  createdAt: Date
}
const money = (value: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(value),
  )

export function OperationsDashboard({
  operator,
  orders,
  products,
  staff,
  pendingCustomers,
  managedAccounts,
  fulfilmentOrders,
  initialSection,
  purchaseData,
  loyaltyData,
}: {
  operator: {
    id: string
    name: string
    role: string
    employeeId?: string | null
  }
  orders: Order[]
  products: Product[]
  staff: Staff[]
  fulfilmentOrders: FulfilmentOrder[]
  initialSection: OperationsSection
  purchaseData: PurchaseView[]
  loyaltyData: LoyaltyView | null
  managedAccounts: ManagedAccount[]
  pendingCustomers: PendingCustomer[]
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const canManage = operator.role === 'admin' || operator.role === 'manager'
  const canUseTerminal =
    canManage ||
    ['cashier', 'shopkeeper', 'order_taker'].includes(operator.role)
  const section = initialSection
  const [staffName, setStaffName] = useState('')
  const [staffUsername, setStaffUsername] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffRole, setStaffRole] = useState('cashier')
  const [creditLimit, setCreditLimit] = useState('0')
  const [deductionLimit, setDeductionLimit] = useState('0')
  const pending = orders.filter(
    (order) => !['completed', 'cancelled'].includes(order.status),
  )
  const lowStock = products.filter(
    (product) =>
      product.segment === 'tuck_shop' && product.stock <= product.lowStockAt,
  )

  async function addStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const result = await runClientAction(
      () =>
        createStaffAccount({
          name: staffName,
          username: staffUsername,
          password: staffPassword,
          role: staffRole,
          creditLimit: Number(creditLimit),
          monthlyDeductionLimit: Number(deductionLimit),
        }),
      { pending: setSaving, message: setMessage },
      'The account request failed. Refresh the account directory before trying again.',
    )
    if (result) {
      setMessage(
        'Staff account created. Share the temporary password through your secure credential process.',
      )
      setStaffName('')
      setStaffUsername('')
      setStaffPassword('')
      router.refresh()
    }
  }

  async function approveCustomer(userId: string) {
    if (saving) return
    const result = await runClientAction(
      () => approveCustomerAccount({ userId }),
      { pending: setSaving, message: setMessage },
      'The approval could not be confirmed. Refresh the account list before retrying.',
    )
    if (result) {
      setMessage('Customer account approved.')
      router.refresh()
    }
  }

  return (
    <main className="ops-shell">
      <header className="ops-header">
        <CalmBrand href="/operations/workspace" label="OPERATIONS WORKSPACE" />
        <div className="ops-account">
          <span>
            <b>{operator.name}</b>
            <small>
              {operator.role} · {operator.employeeId ?? 'Team workspace'}
            </small>
          </span>
          <Link className="text-button" href="/account">
            My account & bills
          </Link>
          <SignOutButton destination="/operations" />
        </div>
      </header>
      <div className="ops-layout">
        <aside className="ops-nav">
          <div className="auth-kicker">WORKSPACE</div>
          {(
            [
              'admin',
              'terminal',
              'orders',
              'purchasing',
              'inventory',
              'customers',
              'loyalty',
              'team',
            ] as OperationsSection[]
          )
            .filter((item) => allowedSection(operator.role, item))
            .map((item) => (
              <Link
                key={item}
                href={sectionPath(item)}
                className={
                  section === item ? 'ops-nav-item selected' : 'ops-nav-item'
                }
                aria-current={section === item ? 'page' : undefined}
              >
                <span className="ops-nav-icon">
                  {item === 'inventory' || item === 'purchasing' ? (
                    <Package size={17} />
                  ) : item === 'team' || item === 'customers' ? (
                    <UsersRound size={17} />
                  ) : item === 'orders' ? (
                    <ClipboardList size={17} />
                  ) : (
                    <LayoutDashboard size={17} />
                  )}
                </span>
                {sectionTitles[item]}
                {item === 'orders' && <span>{pending.length}</span>}
                {item === 'inventory' && <span>{lowStock.length}</span>}
              </Link>
            ))}
          <div className="ops-nav-note">
            One workspace
            <br />· secure staff access
          </div>
        </aside>
        <section className="ops-content">
          <AutoRefresh />
          <div className="ops-title-row">
            <div>
              <span className="auth-kicker">MAIN CAMPUS · LIVE</span>
              <h1>{sectionTitles[section]}</h1>
              <p>
                {section === 'purchasing'
                  ? 'Supplier orders, receiving and stock updates.'
                  : section === 'customers'
                    ? 'Manage customer identities, approval and access.'
                    : section === 'admin'
                      ? 'One place to manage your café, shop and people.'
                      : section === 'loyalty'
                        ? 'Earning rules, customer points and rewards.'
                        : section === 'inventory'
                          ? 'Set up products and manage stock in one workspace.'
                          : 'Your Calm Break operations workspace.'}
              </p>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => router.refresh()}
            >
              Refresh workspace
            </button>
            <div className="system-status">
              <i /> Database connected
            </div>
          </div>
          {message && (
            <p className="order-notice" role="status">
              {message}
            </p>
          )}
          {canManage &&
            section !== 'orders' &&
            fulfilmentOrders.some((o) => overdue(o).length > 0) && (
              <Link className="escalation-notice" href="/operations/orders">
                {fulfilmentOrders.filter((o) => overdue(o).length > 0).length}{' '}
                orders need manager attention. Open order board →
              </Link>
            )}
          {section === 'admin' && operator.role === 'admin' && (
            <AdminOverview
              stats={{
                products: products.length,
                lowStock: lowStock.length,
                openOrders: pending.length,
                pendingCustomers: pendingCustomers.length,
                accounts: managedAccounts.length,
              }}
            />
          )}
          {section === 'purchasing' && canManage && (
            <PurchasingManager items={products} purchases={purchaseData} />
          )}
          {section === 'loyalty' &&
            canManage &&
            (loyaltyData ? (
              <LoyaltyManager view={loyaltyData} />
            ) : (
              <p className="ops-empty">
                Loyalty is not ready in this environment. Apply the loyalty
                database migration before using this page.
              </p>
            ))}
          {section === 'customers' && operator.role === 'admin' && (
            <AccountManager
              key="customers"
              accounts={managedAccounts}
              actorId={operator.id}
              initialFilter="customers"
            />
          )}
          {section === 'terminal' && canUseTerminal && (
            <StaffTerminal products={products} />
          )}
          {section === 'orders' && (
            <FulfilmentBoard orders={fulfilmentOrders} role={operator.role} />
          )}
          {section === 'inventory' && (
            <CatalogManager items={products} canManage={canManage} />
          )}
          {section === 'team' && operator.role === 'admin' && (
            <AccountManager
              key="team"
              accounts={managedAccounts}
              actorId={operator.id}
              initialFilter="team"
            />
          )}
          {section === 'team' && canManage && operator.role !== 'admin' && (
            <>
              <div className="ops-card">
                <div className="ops-card-heading">
                  <div>
                    <h2>Create a team account</h2>
                    <p>
                      Staff sign in with a username. No email address is
                      required.
                    </p>
                  </div>
                </div>
                <form className="staff-form" onSubmit={addStaff}>
                  <label>
                    Full name
                    <input
                      value={staffName}
                      onChange={(event) => setStaffName(event.target.value)}
                      required
                      minLength={2}
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Username
                    <input
                      value={staffUsername}
                      onChange={(event) =>
                        setStaffUsername(event.target.value.toLowerCase())
                      }
                      required
                      minLength={3}
                      maxLength={32}
                      pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Role
                    <select
                      value={staffRole}
                      onChange={(event) => setStaffRole(event.target.value)}
                    >
                      <option value="cashier">Cashier</option>
                      <option value="shopkeeper">Shopkeeper</option>
                      <option value="chef">Chef</option>
                      <option value="order_taker">Order taker</option>
                    </select>
                  </label>
                  <label>
                    Temporary password
                    <input
                      type="password"
                      value={staffPassword}
                      onChange={(event) => setStaffPassword(event.target.value)}
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    Credit limit
                    <input
                      type="number"
                      value={creditLimit}
                      onChange={(event) => setCreditLimit(event.target.value)}
                      min="0"
                      max="100000"
                      step="0.01"
                    />
                  </label>
                  <label>
                    Monthly deduction limit
                    <input
                      type="number"
                      value={deductionLimit}
                      onChange={(event) =>
                        setDeductionLimit(event.target.value)
                      }
                      min="0"
                      max="100000"
                      step="0.01"
                    />
                  </label>
                  <button className="primary-button" disabled={saving}>
                    {saving ? 'Creating…' : 'Create account'}
                  </button>
                </form>
              </div>
              <div className="ops-card">
                <div className="ops-card-heading">
                  <div>
                    <h2>Customer approval queue</h2>
                    <p>Customers cannot sign in or order until approved.</p>
                  </div>
                </div>
                {pendingCustomers.length === 0 ? (
                  <div className="ops-empty">
                    No customer registrations are waiting for approval.
                  </div>
                ) : (
                  <div className="inventory-list">
                    {pendingCustomers.map((customer) => (
                      <article className="inventory-row" key={customer.id}>
                        <div>
                          <strong>{customer.employeeId}</strong>
                          <span>
                            Registered{' '}
                            {new Date(customer.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={saving}
                          onClick={() => approveCustomer(customer.id)}
                        >
                          {saving ? 'Approving…' : 'Approve'}
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div className="ops-card">
                <div className="ops-card-heading">
                  <div>
                    <h2>Current team</h2>
                    <p>Administrator-only account directory.</p>
                  </div>
                </div>
                {staff.length === 0 ? (
                  <div className="ops-empty">
                    No staff accounts have been created yet.
                  </div>
                ) : (
                  <div className="inventory-list">
                    {staff.map((person) => (
                      <article className="inventory-row" key={person.id}>
                        <div>
                          <strong>{person.name}</strong>
                          <span>
                            {person.username
                              ? `@${person.username}`
                              : (person.employeeId ?? 'Legacy account')}
                          </span>
                        </div>
                        <span>{person.role.replaceAll('_', ' ')}</span>
                        <span>Credit {money(person.creditLimit)}</span>
                        <span>
                          Monthly {money(person.monthlyDeductionLimit)}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
