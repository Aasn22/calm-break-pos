'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { changeFulfilment } from '@/app/actions/fulfilment'
import { overdue, type FulfilmentOrder } from '@/lib/fulfilment'
import { runClientAction } from '@/lib/client-action'
const when = (d: Date | string) =>
  new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export function FulfilmentBoard({
  orders,
  role,
  mine = false,
}: {
  orders: FulfilmentOrder[]
  role: string
  mine?: boolean
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(id)
  }, [])
  const manager = ['admin', 'manager'].includes(role)
  const alerts = orders.filter((o) => overdue(o).length)
  return (
    <div>
      {manager && !mine && alerts.length > 0 && (
        <div className="escalation-notice" role="alert">
          <strong>{alerts.length} orders need manager attention</strong>
          <p>
            {alerts
              .map((o) => `#${o.orderNumber}: ${overdue(o).join(', ')}`)
              .join(' · ')}
          </p>
        </div>
      )}
      <div className="workflow-grid">
        {orders.map((o) => (
          <Order
            key={o.id}
            order={o}
            manager={manager && !mine}
            canDeliver={!mine && !['chef', 'barista', 'kitchen'].includes(role)}
            mine={mine}
          />
        ))}
        {!orders.length && (
          <p className="ops-empty">No orders to display yet.</p>
        )}
      </div>
    </div>
  )
}
function Order({
  order: o,
  manager,
  canDeliver,
  mine,
}: {
  order: FulfilmentOrder
  manager: boolean
  canDeliver: boolean
  mine: boolean
}) {
  const router = useRouter(),
    guard = useRef(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [minutes, setMinutes] = useState(o.lines.map((l) => l.minutes))
  async function act(action: string, lineId?: string) {
    if (guard.current) return
    if (
      ['cancel', 'paid'].includes(action) &&
      !window.confirm(
        action === 'paid'
          ? 'Confirm this payment has actually been received? This records a manual payment, not an online charge.'
          : 'Cancel the entire order and restore undelivered shop stock?',
      )
    )
      return
    guard.current = true
    try {
      const result = await runClientAction(
        () =>
          changeFulfilment({
            id: o.id,
            version: o.version,
            action,
            lineId,
            minutes,
          }),
        { pending: setBusy, message: setMessage },
        'Could not confirm update. Refresh before retrying.',
      )
      if (result) router.refresh()
    } finally {
      guard.current = false
    }
  }
  const closed = ['completed', 'cancelled'].includes(o.status)
  return (
    <article className="workflow-card">
      <header>
        <div>
          <small>
            ORDER #{o.orderNumber} · {when(o.createdAt)}
          </small>
          <h3>{mine ? 'Your café + shop order' : o.customer}</h3>
        </div>
        <span className="status-pill">
          {o.status === 'completed' ? 'Fully delivered' : o.status}
        </span>
      </header>
      {o.deliveryLocation && (
        <p className="order-notice">Delivery: {o.deliveryLocation}</p>
      )}
      {!mine && (o.allergyNote || o.currentAllergies) && (
        <div className="allergy-alert">
          <strong>ALLERGY / SAFETY NOTE</strong>
          <p>{o.currentAllergies || o.allergyNote}</p>
          {o.currentAllergies !== o.allergyNote && (
            <small>
              At checkout: {o.allergyNote || 'None recorded'}. Profile changed
              after checkout.
            </small>
          )}
        </div>
      )}
      {!mine && overdue(o).length > 0 && (
        <p className="workflow-overdue">
          {overdue(o).join(' · ')} — manager attention
        </p>
      )}
      {o.lines.map((l, i) => (
        <div className="workflow-line" key={l.id}>
          <div>
            <strong>
              {l.quantity} × {l.productName}
            </strong>
            <small>
              {l.segment === 'tuck_shop' ? 'Shop' : 'Café'} · $
              {(Number(l.unitPrice) * l.quantity).toFixed(2)}
            </small>
            <small>
              {l.deliveredAt
                ? `Delivered ${when(l.deliveredAt)}`
                : l.dueAt
                  ? `Due ${when(l.dueAt)}`
                  : o.status === 'completed'
                    ? 'Historical completion; per-line timestamp unavailable'
                    : `Default ${l.minutes} min after confirmation`}
            </small>
          </div>
          {!mine && !o.confirmedAt && !closed ? (
            <label>
              Minutes
              <input
                aria-label={`Minutes for ${l.productName}`}
                type="number"
                min={0}
                max={1440}
                value={minutes[i]}
                onChange={(e) =>
                  setMinutes((v) =>
                    v.map((m, n) => (n === i ? Number(e.target.value) : m)),
                  )
                }
              />
            </label>
          ) : canDeliver && !closed && !l.deliveredAt && o.confirmedAt ? (
            <button
              className="filter-chip"
              disabled={busy}
              onClick={() => void act('deliver', l.id)}
            >
              Mark delivered
            </button>
          ) : null}
        </div>
      ))}
      <div className="workflow-total">
        <strong>${Number(o.total).toFixed(2)}</strong>
        <span>
          {o.paidAt ? 'Payment received' : 'Unpaid / billed to account'}
        </span>
      </div>
      {!mine && !closed && !o.confirmedAt && (
        <button
          className="primary-button"
          disabled={
            busy ||
            !o.lines.length ||
            minutes.some((m) => !Number.isInteger(m) || m < 0 || m > 1440)
          }
          onClick={() => void act('confirm')}
        >
          Confirm order & send timeframes
        </button>
      )}
      {manager && (
        <div className="people-actions">
          {!o.paidAt && o.status !== 'cancelled' && (
            <button
              className="filter-chip"
              disabled={busy}
              onClick={() => void act('paid')}
            >
              Record payment received
            </button>
          )}
          {!closed && !o.paidAt && !o.lines.some((l) => l.deliveredAt) && (
            <button
              className="filter-chip"
              disabled={busy}
              onClick={() => void act('cancel')}
            >
              Cancel order
            </button>
          )}
        </div>
      )}
      {message && (
        <p className="auth-error" role="alert">
          {message}
        </p>
      )}
    </article>
  )
}
