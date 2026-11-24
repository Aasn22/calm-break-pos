'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { createStaffAccount, updateOrderStatus } from '@/app/actions/staff'
import { StaffTerminal } from '@/components/staff-terminal'

type Order = { id: string; orderNumber: number; status: string; segment: string; paymentMethod: string; total: string; createdAt: Date }
type Product = { id: string; name: string; sku: string; category: string; segment: string; price: string; stock: number; lowStockAt: number; prepMinutes: number; available: boolean }
type Staff = { id: string; name: string; email: string; role: string; employeeId: string | null; creditLimit: string; monthlyDeductionLimit: string }
const money = (value: string | number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))

export function OperationsDashboard({ operator, orders, products, staff }: { operator: { name: string; role: string; employeeId?: string | null }; orders: Order[]; products: Product[]; staff: Staff[] }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [section, setSection] = useState<'terminal' | 'orders' | 'inventory' | 'team'>(operator.role === 'manager' || operator.role === 'cashier' ? 'terminal' : 'orders')
  const [staffName, setStaffName] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [staffRole, setStaffRole] = useState('cashier')
  const [creditLimit, setCreditLimit] = useState('0')
  const [deductionLimit, setDeductionLimit] = useState('0')
  const pending = orders.filter((order) => !['completed', 'cancelled'].includes(order.status))
  const lowStock = products.filter((product) => product.segment === 'tuck_shop' && product.stock <= product.lowStockAt)

  async function advance(order: Order, status: 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled') {
    setSaving(true)
    const result = await updateOrderStatus({ orderId: order.id, status })
    setSaving(false)
    setMessage(result.ok ? `Order #${order.orderNumber} updated.` : result.message)
    if (result.ok) location.reload()
  }

  async function addStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await createStaffAccount({ name: staffName, email: staffEmail, password: staffPassword, employeeId, role: staffRole, creditLimit: Number(creditLimit), monthlyDeductionLimit: Number(deductionLimit) })
    setSaving(false)
    setMessage(result.ok ? 'Staff account created. Share the temporary password through your secure credential process.' : result.message)
    if (result.ok) { setStaffName(''); setStaffEmail(''); setStaffPassword(''); setEmployeeId(''); location.reload() }
  }

  return <main className="ops-shell"><header className="ops-header"><a className="ops-brand" href="/operations/workspace">CALM <span>BREAK</span><small>OPERATIONS</small></a><div className="ops-account"><span><b>{operator.name}</b><small>{operator.role} · {operator.employeeId ?? 'Team workspace'}</small></span><button className="text-button" onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => location.assign('/operations') } })}>Sign out</button></div></header>
    <div className="ops-layout"><aside className="ops-nav"><div className="auth-kicker">WORKSPACE</div>{([...(['manager', 'cashier'].includes(operator.role) ? ['terminal'] as const : []), 'orders', 'inventory', ...(operator.role === 'manager' ? ['team'] as const : [])] as const).map((item) => <button key={item} onClick={() => setSection(item)} className={section === item ? 'ops-nav-item selected' : 'ops-nav-item'}>{item === 'terminal' ? 'POS terminal' : item === 'orders' ? 'Order monitor' : item === 'inventory' ? 'Inventory' : 'Team accounts'}<span>{item === 'terminal' ? '' : item === 'orders' ? pending.length : item === 'inventory' ? lowStock.length : staff.length}</span></button>)}<div className="ops-nav-note">One workspace<br/>· secure staff access</div></aside>
      <section className="ops-content"><div className="ops-title-row"><div><span className="auth-kicker">MAIN CAMPUS · LIVE</span><h1>{section === 'terminal' ? 'POS terminal' : section === 'orders' ? 'Order monitor' : section === 'inventory' ? 'Inventory' : 'Team accounts'}</h1><p>{section === 'terminal' ? 'Build a counter order with live menu prices and stock.' : section === 'orders' ? 'Keep every order moving, from first pour to pickup.' : section === 'inventory' ? 'A clear view of what is on hand and what needs attention.' : 'Provision accounts for the people who keep the shop running.'}</p></div><div className="system-status"><i/> Database connected</div></div>
      {message && <p className="order-notice" role="status">{message}</p>}
      {section === 'terminal' && ['manager', 'cashier'].includes(operator.role) && <StaffTerminal products={products} />}
      {section === 'orders' && <><div className="ops-stats"><article><span>OPEN ORDERS</span><strong>{pending.length}</strong></article><article><span>MENU ITEMS</span><strong>{products.filter((product) => product.available).length}</strong></article><article><span>LOW STOCK</span><strong>{lowStock.length}</strong></article></div><div className="ops-card"><div className="ops-card-heading"><div><h2>Recent orders</h2><p>Newest orders appear first.</p></div></div>{orders.length === 0 ? <div className="ops-empty">No orders yet. New customer orders will appear here.</div> : <div className="order-list">{orders.map((order) => <article className="order-row" key={order.id}><div className="order-no"><strong>#{order.orderNumber}</strong><span>{order.segment === 'cafe' ? 'Café' : 'Tuck shop'} · {new Date(order.createdAt).toLocaleString()}</span></div><div className={`status-pill status-${order.status}`}>{order.status.replaceAll('_', ' ')}</div><span className="order-payment">{order.paymentMethod.replaceAll('_', ' ')}</span><strong>{money(order.total)}</strong><div className="order-actions">{order.status === 'new' && <button disabled={saving} onClick={() => advance(order, 'preparing')}>Start</button>}{order.status === 'preparing' && <button disabled={saving} onClick={() => advance(order, 'ready')}>Ready</button>}{order.status === 'ready' && <button disabled={saving} onClick={() => advance(order, order.segment === 'tuck_shop' ? 'out_for_delivery' : 'completed')}>{order.segment === 'tuck_shop' ? 'Dispatch' : 'Complete'}</button>}{order.status === 'out_for_delivery' && <button disabled={saving} onClick={() => advance(order, 'completed')}>Complete</button>}{!['completed', 'cancelled'].includes(order.status) && <button className="subtle-action" disabled={saving} onClick={() => advance(order, 'cancelled')}>Cancel</button>}</div></article>)}</div>}</div></>}
      {section === 'inventory' && <div className="ops-card"><div className="ops-card-heading"><div><h2>Live catalog</h2><p>Prices and availability are read from the database.</p></div></div>{products.length === 0 ? <div className="ops-empty">The catalog is empty. Add the starter menu through the database setup process.</div> : <div className="inventory-list">{products.map((product) => <article className="inventory-row" key={product.id}><div><strong>{product.name}</strong><span>{product.category} · SKU {product.sku} · {product.segment === 'cafe' ? 'Café' : 'Tuck shop'}</span></div><strong>{money(product.price)}</strong><span className={product.stock <= product.lowStockAt && product.segment === 'tuck_shop' ? 'stock-alert' : ''}>{product.segment === 'tuck_shop' ? `${product.stock} in stock` : `${product.prepMinutes} min prep`}</span><span>{product.available ? 'Available' : 'Paused'}</span></article>)}</div>}</div>}
      {section === 'team' && operator.role === 'manager' && <><div className="ops-card"><div className="ops-card-heading"><div><h2>Create a team account</h2><p>Roles are assigned here, never during customer registration.</p></div></div><form className="staff-form" onSubmit={addStaff}><label>Full name<input value={staffName} onChange={(event) => setStaffName(event.target.value)} required minLength={2} maxLength={100}/></label><label>Email<input type="email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} required maxLength={254}/></label><label>Employee ID<input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required minLength={2} maxLength={32} pattern="[A-Za-z0-9-]+"/></label><label>Role<select value={staffRole} onChange={(event) => setStaffRole(event.target.value)}><option value="cashier">Cashier</option><option value="barista">Barista</option><option value="kitchen">Kitchen</option><option value="manager">Manager</option></select></label><label>Temporary password<input type="password" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password"/></label><label>Credit limit<input type="number" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} min="0" max="100000" step="0.01"/></label><label>Monthly deduction limit<input type="number" value={deductionLimit} onChange={(event) => setDeductionLimit(event.target.value)} min="0" max="100000" step="0.01"/></label><button className="primary-button" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</button></form></div><div className="ops-card"><div className="ops-card-heading"><div><h2>Current team</h2><p>Manager-only account directory.</p></div></div>{staff.map((person) => <div className="inventory-row" key={person.id}><div><strong>{person.name}</strong><span>{person.email} · {person.employeeId ?? 'No employee ID'}</span></div><span>{person.role}</span><span>Credit {money(person.creditLimit)}</span><span>Monthly {money(person.monthlyDeductionLimit)}</span></div>)}</div></>}
      </section>
    </div></main>
}
