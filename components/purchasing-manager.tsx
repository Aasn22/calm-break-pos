'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { moduleAction } from '@/app/actions/modules'
import { runClientAction } from '@/lib/client-action'
import type { CatalogItem } from '@/lib/catalog'
import type { PurchaseView } from '@/lib/operations-modules'
const money = (s: string | number) => `$${Number(s).toFixed(2)}`
export function PurchasingManager({
  items,
  purchases,
}: {
  items: CatalogItem[]
  purchases: PurchaseView[]
}) {
  const router = useRouter(),
    inFlight = useRef(false),
    key = useRef<string | null>(null)
  const [show, setShow] = useState(false),
    [lines, setLines] = useState([
      { productId: items[0]?.id || '', quantity: 1, unitCost: '' },
    ]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [filter, setFilter] = useState('all')
  async function act(
    operation: 'purchase-receive' | 'purchase-cancel',
    id: string,
  ) {
    if (
      inFlight.current ||
      !window.confirm(
        operation === 'purchase-receive'
          ? 'Confirm all lines physically received? Shop stock increases once; café quantities are recorded but not tracked as stock.'
          : 'Cancel this outstanding purchase? Stock will not change.',
      )
    )
      return
    inFlight.current = true
    try {
      const r = await runClientAction(
        () => moduleAction(operation, { id }),
        { pending: setBusy, message: setMessage },
        'Could not confirm the purchase update. Refresh before retrying.',
      )
      if (r) {
        setMessage('Purchase updated.')
        router.refresh()
      }
    } finally {
      inFlight.current = false
    }
  }
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inFlight.current) return
    const form = new FormData(e.currentTarget)
    key.current ??= crypto.randomUUID()
    inFlight.current = true
    try {
      const r = await runClientAction(
        () =>
          moduleAction('purchase-create', {
            key: key.current,
            supplier: form.get('supplier'),
            invoiceNumber: form.get('invoiceNumber') || '',
            lines: lines.map((l) => ({ ...l, unitCost: Number(l.unitCost) })),
          }),
        { pending: setBusy, message: setMessage },
        'Could not confirm creation. Retry the same purchase; do not submit a second copy.',
      )
      if (r) {
        key.current = null
        setShow(false)
        setLines([{ productId: items[0]?.id || '', quantity: 1, unitCost: '' }])
        setMessage('Purchase order created. Stock changes only when received.')
        router.refresh()
      }
    } finally {
      inFlight.current = false
    }
  }
  return (
    <div>
      <div className="module-metrics">
        <article>
          <small>AWAITING RECEIPT</small>
          <strong>
            {purchases.filter((p) => p.status === 'ordered').length}
          </strong>
        </article>
        <article>
          <small>RECEIVED PURCHASE VALUE</small>
          <strong>
            {money(
              purchases
                .filter((p) => p.status === 'received')
                .reduce((n, p) => n + Number(p.total), 0),
            )}
          </strong>
        </article>
        <article>
          <small>SUPPLIERS</small>
          <strong>
            {new Set(purchases.map((p) => p.supplier.toLowerCase())).size}
          </strong>
        </article>
      </div>
      <div className="ops-card">
        <div className="ops-card-heading">
          <div>
            <h2>Purchase orders & receiving</h2>
            <p>
              Create an order, then record a complete physical delivery. Never
              increases stock on creation.
            </p>
          </div>
          <button
            className="primary-button"
            disabled={busy || !items.length}
            onClick={() => setShow(!show)}
          >
            {show ? 'Close form' : 'New purchase'}
          </button>
        </div>
        {!items.length && (
          <p className="ops-empty">
            Create café or shop products in Inventory before purchasing them.
          </p>
        )}
        {show && (
          <form className="staff-form purchase-form" onSubmit={create}>
            <fieldset disabled={busy} className="account-fields">
              <label>
                Supplier
                <input name="supplier" required minLength={2} maxLength={150} />
              </label>
              <label>
                Invoice / supplier reference
                <input name="invoiceNumber" maxLength={100} />
              </label>
              <div className="purchase-lines">
                <div className="module-table-head">
                  <span>Product</span>
                  <span>Quantity</span>
                  <span>Unit cost ($)</span>
                  <span />
                </div>
                {lines.map((line, index) => (
                  <div className="purchase-line" key={index}>
                    <select
                      aria-label={`Product ${index + 1}`}
                      required
                      value={line.productId}
                      onChange={(e) =>
                        setLines((v) =>
                          v.map((l, i) =>
                            i === index
                              ? { ...l, productId: e.target.value }
                              : l,
                          ),
                        )
                      }
                    >
                      <option value="">Choose item</option>
                      {items.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.sku}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Quantity ${index + 1}`}
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      required
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((v) =>
                          v.map((l, i) =>
                            i === index
                              ? { ...l, quantity: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label={`Unit cost ${index + 1}`}
                      type="number"
                      min={0}
                      max={100000}
                      step="0.01"
                      required
                      value={line.unitCost}
                      onChange={(e) =>
                        setLines((v) =>
                          v.map((l, i) =>
                            i === index
                              ? { ...l, unitCost: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="filter-chip"
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines((v) => v.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="filter-chip"
                  disabled={lines.length >= 50}
                  onClick={() =>
                    setLines((v) => [
                      ...v,
                      { productId: '', quantity: 1, unitCost: '' },
                    ])
                  }
                >
                  + Add line
                </button>
                <p className="purchase-total">
                  Total{' '}
                  {money(
                    lines.reduce(
                      (n, l) =>
                        n +
                        (Math.round(Number(l.unitCost) * 100) * l.quantity) /
                          100,
                      0,
                    ),
                  )}
                </p>
              </div>
              <button className="primary-button">
                {busy ? 'Saving…' : 'Create purchase order'}
              </button>
            </fieldset>
          </form>
        )}
        <div className="module-toolbar">
          {['all', 'ordered', 'received', 'cancelled'].map((s) => (
            <button
              className={`filter-chip ${filter === s ? 'is-active' : ''}`}
              key={s}
              onClick={() => setFilter(s)}
            >
              {s === 'all'
                ? 'All purchases'
                : s === 'ordered'
                  ? 'Awaiting receipt'
                  : s}
            </button>
          ))}
        </div>
        <div className="purchase-history">
          {purchases
            .filter((p) => filter === 'all' || p.status === filter)
            .map((p) => (
              <article className="purchase-record" key={p.id}>
                <div className="purchase-record-title">
                  <div>
                    <strong>{p.supplier}</strong>
                    <small>
                      {p.invoiceNumber || 'No supplier reference'} ·{' '}
                      {new Date(p.createdAt).toLocaleDateString()}
                    </small>
                  </div>
                  <span
                    className={`status-pill status-${p.status === 'received' ? 'completed' : p.status}`}
                  >
                    {p.status}
                  </span>
                  <strong>{money(p.total)}</strong>
                </div>
                <ul>
                  {p.lines.map((l) => (
                    <li key={l.productId}>
                      {l.quantity} × {l.name}
                      <span>{money(l.unitCost)} each</span>
                    </li>
                  ))}
                </ul>
                {p.receivedAt && (
                  <small>
                    Received {new Date(p.receivedAt).toLocaleString()}
                  </small>
                )}
                {p.status === 'ordered' && (
                  <div className="people-actions">
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void act('purchase-receive', p.id)}
                    >
                      Receive all items
                    </button>
                    <button
                      className="filter-chip"
                      disabled={busy}
                      onClick={() => void act('purchase-cancel', p.id)}
                    >
                      Cancel order
                    </button>
                  </div>
                )}
              </article>
            ))}
          {!purchases.length && (
            <p className="ops-empty">
              No purchase orders yet. Use New purchase to record your first
              supplier order.
            </p>
          )}
        </div>
      </div>
      {message && (
        <p className="order-notice" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
