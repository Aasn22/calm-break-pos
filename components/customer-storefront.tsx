'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coffee, Store } from 'lucide-react'
import Link from 'next/link'
import { placeOrder } from '@/app/actions/orders'
import { authClient } from '@/lib/auth-client'

type MenuProduct = { id: string; name: string; description: string; category: string; segment: string; price: string; stock: number; prepMinutes: number }
const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
type CustomerOrder = { id: string; orderNumber: number; status: string; total: string; createdAt: Date }

export function CustomerStorefront({ items, customerName, orders = [] }: { items: MenuProduct[]; customerName?: string; orders?: CustomerOrder[] }) {
  const router = useRouter()
  const [category, setCategory] = useState('All items')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash')
  const [reference, setReference] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const categories = ['All items', ...new Set(items.map((item) => item.category))]
  const visible = useMemo(() => items.filter((item) => category === 'All items' || item.category === category), [category, items])
  const selected = items.filter((item) => (quantities[item.id] ?? 0) > 0)
  const total = selected.reduce((sum, item) => sum + Number(item.price) * quantities[item.id], 0)

  async function submitOrder() {
    setBusy(true)
    setNotice('')
    const result = await placeOrder({
      lines: selected.map((item) => ({ productId: item.id, quantity: quantities[item.id] })),
      paymentMethod,
      paymentReference: reference,
      orderType: 'takeaway',
    })
    setBusy(false)
    if (!result.ok) { setNotice(result.message); return }
    setNotice(`Order #${result.orderNumber} is in. We’ll take it from here.`)
    router.refresh()
    setQuantities({})
    setReference('')
  }

  return <main className="storefront">
    <header className="store-header"><Link href="/" className="wordmark">CALM <span>BREAK</span></Link><div className="store-header-actions">{customerName ? <><span className="welcome-name">Hi, {customerName}</span><button className="text-button" onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => location.assign('/') } })}>Sign out</button></> : <><Link href="/sign-in" className="text-button">Sign in</Link><Link href="/sign-up" className="small-cta">Join us</Link></>}</div></header>
    <section className="store-hero"><div><span className="auth-kicker">A BETTER KIND OF BREAK</span><h1>A little pause<br/><em>goes a long way.</em></h1><p>Good food, good coffee, and a softer moment in your day.</p></div><div className="store-hero-art" aria-hidden="true"><span className="store-sun"/><span className="store-cup"><Coffee size={74} strokeWidth={1.2} /></span><span className="store-note">take a<br/><i>moment</i></span></div></section>
    <section className="menu-section" aria-labelledby="menu-title"><div className="menu-title-row"><div><span className="auth-kicker">FRESH FROM THE CAFÉ</span><h2 id="menu-title">Find your favorite.</h2></div>{customerName && <span className="menu-count">{items.length} good things, made fresh</span>}</div>
      <div className="menu-filters" aria-label="Filter menu categories">{categories.map((value) => <button key={value} className={category === value ? 'filter-chip is-active' : 'filter-chip'} onClick={() => setCategory(value)}>{value}</button>)}</div>
      {items.length === 0 ? <p className="empty-menu">The menu is being prepared. Please check back soon.</p> : <div className="menu-grid">{visible.map((item, index) => <article className="menu-card" key={item.id}><div className={`menu-card-art art-tone-${index % 4}`}><span aria-hidden="true">{item.segment === 'tuck_shop' ? <Store size={38} strokeWidth={1.3} /> : <Coffee size={38} strokeWidth={1.3} />}</span><small>{item.category}</small></div><div className="menu-card-content"><div><h3>{item.name}</h3><p>{item.description}</p><span className="prep-time">{item.prepMinutes ? `${item.prepMinutes} min` : 'Ready to go'}</span></div><div className="menu-card-bottom"><strong>{money(Number(item.price))}</strong>{customerName && <div className="quantity-control"><button aria-label={`Remove one ${item.name}`} disabled={!quantities[item.id]} onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, (current[item.id] ?? 0) - 1) }))}>−</button><span>{quantities[item.id] ?? 0}</span><button aria-label={`Add one ${item.name}`} disabled={item.segment === 'tuck_shop' && (quantities[item.id] ?? 0) >= item.stock} onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.min(20, (current[item.id] ?? 0) + 1) }))}>+</button></div>}</div></div></article>)}</div>}
    </section>
    {customerName && <section className="checkout-panel" aria-labelledby="checkout-title"><div><span className="auth-kicker">A LITTLE SOMETHING FOR YOU</span><h2 id="checkout-title">Your order <span>{selected.length ? `· ${money(total)}` : ''}</span></h2></div><div className="checkout-controls"><label>Payment<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'bank_transfer')}><option value="cash">Pay at counter</option><option value="bank_transfer">Bank transfer</option></select></label>{paymentMethod === 'bank_transfer' && <label>Transfer reference<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} placeholder="Reference (optional)"/></label>}<button className="primary-button" disabled={!selected.length || busy} onClick={submitOrder}>{busy ? 'Placing order…' : 'Place order'}</button></div>{notice && <p className="order-notice" role="status">{notice}</p>}    </section>}
    {customerName && <section className="customer-orders" aria-labelledby="orders-title"><div className="menu-title-row"><div><span className="auth-kicker">MADE FOR YOU</span><h2 id="orders-title">Your recent orders.</h2></div></div>{orders.length === 0 ? <p className="empty-menu">Your orders will appear here after checkout.</p> : <div className="customer-order-list">{orders.map((order) => <article className="customer-order-row" key={order.id}><strong>Order #{order.orderNumber}</strong><span className={`status-pill status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span><span>{money(Number(order.total))}</span><time dateTime={new Date(order.createdAt).toISOString()}>{new Date(order.createdAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</time></article>)}</div>}</section>}
    <footer className="store-footer"><span>CALM BREAK</span><span>PAUSE · REFRESH · RECHARGE</span><Link href="/operations">Team sign in</Link></footer>
  </main>
}
