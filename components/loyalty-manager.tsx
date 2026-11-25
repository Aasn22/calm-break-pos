'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { moduleAction } from '@/app/actions/modules'
import { runClientAction } from '@/lib/client-action'
import type { LoyaltyView } from '@/lib/operations-modules'
export function LoyaltyManager({
  view,
  customer = false,
}: {
  view: LoyaltyView
  customer?: boolean
}) {
  const router = useRouter(),
    guard = useRef(false),
    redemption = useRef<{ customerId: string; key: string } | null>(null)
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [search, setSearch] = useState('')
  async function act(
    op:
      | 'loyalty-configure'
      | 'loyalty-award'
      | 'loyalty-redeem'
      | 'loyalty-fulfill',
    data: unknown,
  ) {
    if (guard.current) return
    guard.current = true
    try {
      const r = await runClientAction(
        () => moduleAction(op, data),
        { pending: setBusy, message: setMessage },
        'Could not confirm the loyalty update. Refresh before retrying.',
      )
      if (r) {
        redemption.current = null
        setMessage(
          op === 'loyalty-redeem'
            ? 'Reward redeemed and points deducted. Show the reward record to the café team.'
            : 'Loyalty program updated.',
        )
        router.refresh()
      }
    } finally {
      guard.current = false
    }
  }
  const members = view.members.filter((m) =>
    `${m.name} ${m.employeeId || ''}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  return (
    <div>
      <div className="module-metrics">
        <article>
          <small>PROGRAM</small>
          <strong>{view.enabled ? 'Active' : 'Disabled'}</strong>
        </article>
        <article>
          <small>{customer ? 'YOUR POINTS' : 'MEMBERS'}</small>
          <strong>
            {customer ? view.members[0]?.points || 0 : view.members.length}
          </strong>
        </article>
        <article>
          <small>REWARD THRESHOLD</small>
          <strong>{view.rewardPoints} pts</strong>
        </article>
      </div>
      {!customer && (
        <div className="ops-card">
          <div className="ops-card-heading">
            <div>
              <h2>Earning & reward rules</h2>
              <p>
                Disabled until you enable it. Points are explicitly awarded to
                completed customer-linked orders, once per order.
              </p>
            </div>
          </div>
          <form
            key={`${view.enabled}-${view.pointsPerDollar}-${view.rewardPoints}-${view.rewardLabel}`}
            className="staff-form"
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              void act('loyalty-configure', {
                enabled: f.get('enabled') === 'true',
                pointsPerDollar: Number(f.get('pointsPerDollar')),
                rewardPoints: Number(f.get('rewardPoints')),
                rewardLabel: f.get('rewardLabel'),
              })
            }}
          >
            <label>
              Program
              <select name="enabled" defaultValue={String(view.enabled)}>
                <option value="false">Disabled</option>
                <option value="true">Active</option>
              </select>
            </label>
            <label>
              Points per $1 (rounded down per order)
              <input
                name="pointsPerDollar"
                type="number"
                required
                min={1}
                max={100}
                defaultValue={view.pointsPerDollar}
              />
            </label>
            <label>
              Points needed for one reward
              <input
                name="rewardPoints"
                type="number"
                required
                min={1}
                max={1000000}
                defaultValue={view.rewardPoints}
              />
            </label>
            <label>
              Reward description
              <input
                name="rewardLabel"
                required
                minLength={2}
                maxLength={120}
                defaultValue={view.rewardLabel}
              />
            </label>
            <button className="primary-button" disabled={busy}>
              Save loyalty rules
            </button>
            <p className="people-explainer">
              Rewards are recorded fulfilment entitlements, not automatic
              checkout discounts or cash payments. Changing rules affects future
              awards/redemptions only.
            </p>
          </form>
        </div>
      )}
      <div className="ops-card">
        <div className="ops-card-heading">
          <div>
            <h2>{customer ? 'Your loyalty wallet' : 'Member balances'}</h2>
            <p>
              {view.rewardPoints} points = {view.rewardLabel}.{' '}
              {view.enabled
                ? 'Program is active.'
                : 'Earning and redemption are paused.'}
            </p>
          </div>
          {!customer && (
            <label>
              Search members
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or employee ID"
              />
            </label>
          )}
        </div>
        <div className="people-directory">
          {members.map((m) => (
            <div className="loyalty-member" key={m.id}>
              <div>
                <strong>{m.name}</strong>
                <small>{m.employeeId || 'Customer'}</small>
              </div>
              <strong>{m.points} pts</strong>
              <button
                className="primary-button"
                disabled={busy || !view.enabled || m.points < view.rewardPoints}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Redeem ${view.rewardPoints} points for ${view.rewardLabel}?`,
                    )
                  )
                    return
                  if (
                    redemption.current &&
                    redemption.current.customerId !== m.id
                  ) {
                    setMessage(
                      'A redemption is pending for another customer. Refresh before switching customers.',
                    )
                    return
                  }
                  redemption.current ??= {
                    customerId: m.id,
                    key: crypto.randomUUID(),
                  }
                  void act('loyalty-redeem', redemption.current)
                }}
              >
                Redeem reward
              </button>
            </div>
          ))}
          {!members.length && (
            <p className="ops-empty">
              No customer members match this search. Customer accounts are
              managed in Customers.
            </p>
          )}
        </div>
      </div>
      {!customer && (
        <div className="ops-card">
          <div className="ops-card-heading">
            <div>
              <h2>Award completed orders</h2>
              <p>
                Review each completed order before awarding points. This is not
                proof of payment; confirm settlement separately.
              </p>
            </div>
          </div>
          <div className="people-directory">
            {view.eligibleOrders.map((o) => (
              <div className="loyalty-member" key={o.id}>
                <strong>Order #{o.orderNumber}</strong>
                <span>
                  ${Number(o.total).toFixed(2)} ·{' '}
                  {Math.floor(Number(o.total) * view.pointsPerDollar)} pts
                </span>
                <button
                  className="filter-chip"
                  disabled={busy || !view.enabled}
                  onClick={() => void act('loyalty-award', { id: o.id })}
                >
                  Award points
                </button>
              </div>
            ))}
            {!view.eligibleOrders.length && (
              <p className="ops-empty">
                No unawarded completed customer orders.
              </p>
            )}
          </div>
        </div>
      )}
      <div className="ops-card">
        <div className="ops-card-heading">
          <div>
            <h2>Points & reward history</h2>
            <p>
              Most recent 100 entries. Earned points and redeemed rewards remain
              in the ledger.
            </p>
          </div>
        </div>
        <div className="people-directory">
          {view.entries.map((entry) => (
            <div className="loyalty-member" key={entry.id}>
              <div>
                <strong>{entry.note}</strong>
                <small>
                  {new Date(entry.createdAt).toLocaleString()} ·{' '}
                  {view.members.find((m) => m.id === entry.customerId)?.name ||
                    'Customer'}
                </small>
                {entry.kind === 'redeem' && (
                  <small>
                    Reward reference: {entry.id.slice(0, 8).toUpperCase()}
                  </small>
                )}
              </div>
              <strong>
                {entry.points > 0 ? '+' : ''}
                {entry.points} pts
              </strong>
              {entry.kind === 'redeem' ? (
                <div>
                  <span className="status-pill">
                    {view.fulfilledIds.includes(entry.id)
                      ? 'Reward fulfilled'
                      : 'Awaiting handover'}
                  </span>
                  {!customer && !view.fulfilledIds.includes(entry.id) && (
                    <button
                      type="button"
                      className="filter-chip"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Confirm this reward has physically been handed to the customer?',
                          )
                        )
                          void act('loyalty-fulfill', { id: entry.id })
                      }}
                    >
                      Mark reward fulfilled
                    </button>
                  )}
                </div>
              ) : (
                <span className="status-pill">
                  {entry.kind === 'fulfill' ? 'Fulfilled' : 'Earned'}
                </span>
              )}
            </div>
          ))}
          {!view.entries.length && (
            <p className="ops-empty">No loyalty activity yet.</p>
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
