'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { manageCatalog } from '@/app/actions/catalog'
import { runClientAction } from '@/lib/client-action'
import type { CatalogItem } from '@/lib/catalog'
export function CatalogManager({
  items,
  canManage,
}: {
  items: CatalogItem[]
  canManage: boolean
}) {
  const router = useRouter(),
    form = useRef<HTMLFormElement>(null),
    inFlight = useRef(false)
  const [selected, setSelected] = useState<CatalogItem | null>(null),
    [mode, setMode] = useState<'create' | 'edit' | 'stock' | null>(null),
    [segment, setSegment] = useState('cafe'),
    [filter, setFilter] = useState('all'),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  function open(
    mode: 'create' | 'edit' | 'stock',
    item: CatalogItem | null = null,
  ) {
    if (inFlight.current) return
    setMode(mode)
    setSelected(item)
    setSegment(item?.segment || 'cafe')
    setMessage('')
    setTimeout(
      () =>
        form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      0,
    )
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || !mode) return
    const f = new FormData(event.currentTarget)
    const data =
      mode === 'stock'
        ? {
            id: selected?.id,
            expectedStock: selected?.stock,
            delta: Number(f.get('delta')),
          }
        : {
            id: selected?.id,
            expectedUpdatedAt: selected
              ? new Date(selected.updatedAt).toISOString()
              : undefined,
            name: f.get('name'),
            description: f.get('description'),
            sku: f.get('sku'),
            category: f.get('category'),
            segment,
            price: Number(f.get('price')),
            prepMinutes: Number(f.get('prepMinutes')),
            lowStockAt: Number(f.get('lowStockAt') || 0),
            stock: Number(f.get('stock') || 0),
            available: f.get('availability') === 'true',
          }
    if (
      mode === 'stock' &&
      !window.confirm(
        `Apply stock change of ${f.get('delta')} to ${selected?.name}?`,
      )
    )
      return
    inFlight.current = true
    try {
      const result = await runClientAction(
        () => manageCatalog(mode, data),
        { pending: setBusy, message: setMessage },
        'Could not confirm the change. Refresh before retrying.',
      )
      if (result) {
        setMode(null)
        setSelected(null)
        setMessage(
          'Catalog updated. Refresh other open devices to load the latest values.',
        )
        router.refresh()
      }
    } finally {
      inFlight.current = false
    }
  }
  const shown = items.filter(
    (p) =>
      (filter === 'all' || p.segment === filter) &&
      `${p.name} ${p.sku} ${p.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  return (
    <section aria-label="Café menu and shop inventory">
      <div className="ops-card">
        <div className="ops-card-heading">
          <div>
            <h2>Café menu & shop inventory</h2>
            <p>
              {canManage
                ? 'Add products, set prices and preparation times, and manage availability and shop stock.'
                : 'Read-only catalog. Ask an administrator or manager to change items.'}
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              className="primary-button"
              onClick={() => open('create')}
            >
              Add item
            </button>
          )}
        </div>
        <div className="people-toolbar">
          <div
            className="menu-filters"
            role="group"
            aria-label="Service filter"
          >
            {[
              ['all', 'All items'],
              ['cafe', 'Café menu'],
              ['tuck_shop', 'Shop inventory'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`filter-chip ${filter === id ? 'is-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label>
            Search catalog
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, SKU or category"
            />
          </label>
        </div>
        <div className="people-directory">
          {shown.map((item) => (
            <article className="people-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.segment === 'cafe' ? 'Café' : 'Shop'} · {item.category}{' '}
                  · {item.sku}
                </small>
                <small>{item.description}</small>
              </div>
              <div>
                <strong>${Number(item.price).toFixed(2)}</strong>
                <small>{item.prepMinutes} min preparation</small>
                <small>
                  {item.available ? 'Available' : 'Paused / hidden'}
                </small>
              </div>
              <div>
                <small
                  className={
                    item.segment === 'tuck_shop' &&
                    item.stock <= item.lowStockAt
                      ? 'stock-alert'
                      : ''
                  }
                >
                  {item.segment === 'tuck_shop'
                    ? `${item.stock} in stock · alert at ${item.lowStockAt}`
                    : 'Made to order'}
                </small>
              </div>
              {canManage && (
                <div className="people-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => open('edit', item)}
                  >
                    Edit item
                  </button>
                  {item.segment === 'tuck_shop' && (
                    <button
                      type="button"
                      className="filter-chip"
                      onClick={() => open('stock', item)}
                    >
                      Adjust stock
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
          {!shown.length && (
            <p className="ops-empty">
              {canManage
                ? 'No matching items. Use Add item to set up your café menu or shop inventory.'
                : 'No matching items.'}
            </p>
          )}
        </div>
      </div>
      {message && (
        <p className="order-notice" role="status">
          {message}
        </p>
      )}
      {mode && (
        <div className="ops-card">
          <div className="ops-card-heading">
            <div>
              <h2>
                {mode === 'create'
                  ? 'Add a new item'
                  : mode === 'stock'
                    ? `Adjust stock: ${selected?.name}`
                    : `Edit: ${selected?.name}`}
              </h2>
              <p>
                {mode === 'stock'
                  ? `Current quantity: ${selected?.stock}. Positive adds stock; negative removes stock.`
                  : 'Pause items instead of deleting them to preserve order history.'}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              className="filter-chip"
              onClick={() => setMode(null)}
            >
              Cancel
            </button>
          </div>
          <form
            ref={form}
            key={`${mode}-${selected?.id || 'new'}`}
            className="staff-form catalog-editor-form"
            onSubmit={save}
          >
            <fieldset disabled={busy} className="account-fields">
              {mode === 'stock' ? (
                <label>
                  Quantity change
                  <input
                    name="delta"
                    type="number"
                    step="1"
                    min="-1000000"
                    max="1000000"
                    required
                    placeholder="e.g. 20 or -3"
                  />
                </label>
              ) : (
                <>
                  <label>
                    Item name
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={100}
                      defaultValue={selected?.name}
                    />
                  </label>
                  <label>
                    SKU
                    <input
                      name="sku"
                      required
                      pattern="[A-Za-z0-9._-]+"
                      maxLength={64}
                      defaultValue={selected?.sku}
                      placeholder="e.g. CAFE-001"
                    />
                  </label>
                  <label>
                    Service
                    <select
                      disabled={mode === 'edit'}
                      value={segment}
                      onChange={(e) => setSegment(e.target.value)}
                    >
                      <option value="cafe">Café</option>
                      <option value="tuck_shop">Shop</option>
                    </select>
                  </label>
                  <label>
                    Category
                    <input
                      name="category"
                      required
                      maxLength={80}
                      defaultValue={selected?.category}
                      placeholder="e.g. Coffee, Meals or Essentials"
                    />
                  </label>
                  <label>
                    Price ($)
                    <input
                      name="price"
                      type="number"
                      min="0.01"
                      max="100000"
                      step="0.01"
                      required
                      defaultValue={selected?.price}
                    />
                  </label>
                  <label>
                    Default preparation time (minutes)
                    <input
                      name="prepMinutes"
                      type="number"
                      min="0"
                      max="1440"
                      step="1"
                      required
                      defaultValue={selected?.prepMinutes ?? 0}
                    />
                  </label>
                  {segment === 'tuck_shop' && (
                    <>
                      {mode === 'create' && (
                        <label>
                          Opening stock
                          <input
                            name="stock"
                            type="number"
                            min="0"
                            max="1000000"
                            step="1"
                            required
                            defaultValue={0}
                          />
                        </label>
                      )}
                      <label>
                        Low-stock alert threshold
                        <input
                          name="lowStockAt"
                          type="number"
                          min="0"
                          max="1000000"
                          step="1"
                          required
                          defaultValue={selected?.lowStockAt ?? 5}
                        />
                      </label>
                    </>
                  )}
                  <label className="catalog-description">
                    Description
                    <textarea
                      name="description"
                      maxLength={1000}
                      defaultValue={selected?.description}
                    />
                  </label>
                  <label>
                    Availability
                    <select
                      name="availability"
                      defaultValue={String(selected?.available ?? true)}
                    >
                      <option value="true">Available to order</option>
                      <option value="false">Paused / hidden</option>
                    </select>
                  </label>
                </>
              )}
              <button className="primary-button" disabled={busy}>
                {busy
                  ? 'Saving…'
                  : mode === 'stock'
                    ? 'Confirm stock adjustment'
                    : 'Save item'}
              </button>
            </fieldset>
          </form>
        </div>
      )}
    </section>
  )
}
