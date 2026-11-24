'use client'

import { useMemo, useState } from 'react'
import { placeStaffOrder } from '@/app/actions/staff'

type Product = { id: string; name: string; sku: string; category: string; segment: string; price: string; stock: number; lowStockAt: number; prepMinutes: number; available: boolean }
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

export function StaffTerminal({ products }: { products: Product[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'credit' | 'salary_deduction'>('cash')
  const [accountEmail, setAccountEmail] = useState('')
  const [reference, setReference] = useState('')
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'staff_delivery'>('dine_in')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const available = products.filter((product) => product.available)
  const selected = available.filter((product) => (quantities[product.id] ?? 0) > 0)
  const total = useMemo(() => selected.reduce((sum, product) => sum + Number(product.price) * quantities[product.id], 0), [selected, quantities])

  async function checkout() {
    setBusy(true)
    setMessage('')
    const result = await placeStaffOrder({ lines: selected.map((product) => ({ productId: product.id, quantity: quantities[product.id] })), paymentMethod, accountEmail, paymentReference: reference, orderType })
    setBusy(false)
    if (!result.ok) { setMessage(result.message); return }
    setMessage(`Order #${result.orderNumber} sent to the order monitor.`)
    setQuantities({})
    setAccountEmail('')
    setReference('')
  }

  return <div className="terminal-layout"><div className="ops-card terminal-products"><div className="ops-card-heading"><div><h2>Start a new order</h2><p>Prices and stock are checked again on the server before checkout.</p></div></div><div className="terminal-product-grid">{available.map((product) => <article className="terminal-product" key={product.id}><div><span>{product.category} · {product.segment === 'cafe' ? 'Café' : 'Tuck shop'}</span><strong>{product.name}</strong><small>{product.segment === 'tuck_shop' ? `${product.stock} in stock` : `${product.prepMinutes} min prep`}</small></div><div className="terminal-product-bottom"><b>{money(Number(product.price))}</b><div className="quantity-control"><button aria-label={`Remove one ${product.name}`} disabled={!quantities[product.id]} onClick={() => setQuantities((current) => ({ ...current, [product.id]: Math.max(0, (current[product.id] ?? 0) - 1) }))}>−</button><span>{quantities[product.id] ?? 0}</span><button aria-label={`Add one ${product.name}`} disabled={(product.segment === 'tuck_shop' && (quantities[product.id] ?? 0) >= product.stock) || (quantities[product.id] ?? 0) >= 20} onClick={() => setQuantities((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }))}>+</button></div></div></article>)}</div></div><aside className="ops-card terminal-checkout"><div className="ops-card-heading"><div><h2>Current order</h2><p>{selected.reduce((sum, product) => sum + quantities[product.id], 0)} items</p></div></div><div className="terminal-cart">{selected.length === 0 ? <p className="ops-empty">Choose a menu item to start.</p> : selected.map((product) => <div className="terminal-cart-row" key={product.id}><span>{quantities[product.id]} × {product.name}</span><strong>{money(Number(product.price) * quantities[product.id])}</strong></div>)}<div className="terminal-total"><span>Total</span><strong>{money(total)}</strong></div><label className="terminal-label">Order type<select value={orderType} onChange={(event) => setOrderType(event.target.value as typeof orderType)}><option value="dine_in">Dine in</option><option value="takeaway">Takeaway</option><option value="staff_delivery">Staff delivery</option></select></label><label className="terminal-label">Payment<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="credit">Staff credit</option><option value="salary_deduction">Salary deduction</option></select></label>{paymentMethod !== 'cash' && <label className="terminal-label">{paymentMethod === 'bank_transfer' ? 'Transfer reference (optional)' : 'Staff account email'}<input value={paymentMethod === 'bank_transfer' ? reference : accountEmail} onChange={(event) => paymentMethod === 'bank_transfer' ? setReference(event.target.value) : setAccountEmail(event.target.value)} type={paymentMethod === 'bank_transfer' ? 'text' : 'email'} placeholder={paymentMethod === 'bank_transfer' ? 'Reference' : 'name@example.com'} maxLength={254}/></label>}{message && <p className="order-notice" role="status">{message}</p>}<button className="primary-button" onClick={checkout} disabled={busy || selected.length === 0}>{busy ? 'Processing…' : 'Place order'}</button></div></aside></div>
}
