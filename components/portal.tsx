'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Coffee,
  LogOut,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserRound,
  X,
} from 'lucide-react'
import {
  alerts,
  complete,
  money,
  total,
  type Order,
  type Product,
  type User,
} from '@/lib/domain'

type Surface = 'customer' | 'operations'
const time = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const shortId = (id: string) => id.slice(0, 8).toUpperCase()
async function request<T>(
  surface: Surface,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${surface}/${path}`, {
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  const result = await response.json()
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || 'Unable to connect. Please try again.'),
      { status: response.status },
    )
  return result
}

export default function Portal({ surface }: { surface: Surface }) {
  const operations = surface === 'operations'
  const [user, setUser] = useState<User | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [tab, setTab] = useState(operations ? 'Orders' : 'Menu')
  const [category, setCategory] = useState('All items')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [synced, setSynced] = useState('')
  const [, setTick] = useState(0)
  const checkoutKey = useRef<string | null>(null)
  const manager = user?.role === 'manager'
  const refresh = useCallback(async () => {
    try {
      const session = await request<{ user: User | null }>(surface, 'session')
      setUser(session.user)
      if (!operations || session.user)
        setProducts(await request<Product[]>(surface, 'products'))
      if (session.user) {
        setOrders(await request<Order[]>(surface, 'orders'))
        if (operations) {
          const rows = await request<{ id: string; allergies: string }[]>(
            surface,
            'allergies',
          )
          setProfiles(Object.fromEntries(rows.map((p) => [p.id, p.allergies])))
        }
      } else {
        setOrders([])
        setProfiles({})
      }
      setSynced(new Date().toLocaleTimeString())
      setError('')
    } catch (e) {
      setError((e as Error).message)
      setSynced('')
    } finally {
      setLoading(false)
    }
  }, [surface, operations])
  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      void refresh()
      setTick((n) => n + 1)
    }, 5000)
    return () => clearInterval(id)
  }, [refresh])
  async function mutate(path: string, data: unknown, onRejected?: () => void) {
    setBusy(true)
    setMessage('')
    try {
      await request(surface, path, data)
      await refresh()
      return true
    } catch (e) {
      const status = (e as Error & { status?: number }).status
      if (status && status >= 400 && status < 500) {
        if (path === 'orders') checkoutKey.current = null
        onRejected?.()
      }
      setMessage((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  function quantity(id: string, delta: number) {
    if (checkoutKey.current) {
      setMessage(
        'Checkout is awaiting confirmation. Retry the same order before changing the basket.',
      )
      return
    }
    setCart((c) => ({
      ...c,
      [id]: Math.min(99, Math.max(0, (c[id] || 0) + delta)),
    }))
  }
  async function checkout() {
    if (!user) {
      setShowLogin(true)
      return
    }
    checkoutKey.current ??= crypto.randomUUID()
    const ok = await mutate('orders', {
      cart: Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([productId, quantity]) => ({ productId, quantity })),
      note,
      key: checkoutKey.current,
    })
    if (ok) {
      setCart({})
      setNote('')
      checkoutKey.current = null
      setTab('Orders')
      setMessage('Order sent. The team will confirm your delivery timeframe.')
    }
  }
  const cartProducts = products.filter((p) => cart[p.id])
  const count = Object.values(cart).reduce((n, q) => n + q, 0)
  const cartTotal = cartProducts.reduce((n, p) => n + p.price * cart[p.id], 0)
  const escalated = orders.filter((o) => alerts(o).length)
  const unpaid = orders.filter((o) => !o.paid).reduce((n, o) => n + total(o), 0)
  const active = orders.filter((o) => !complete(o))

  if (operations && !user)
    return (
      <main className="login-page">
        <div className="login-intro">
          <Brand />
          <div>
            <span className="eyebrow gold">CALM BREAK OPERATIONS</span>
            <h1>
              Good service.
              <br />
              <em>Working together.</em>
            </h1>
            <p>A dedicated workspace for the café, shop and management team.</p>
            <span className="security-note">
              <ShieldCheck size={17} /> Restricted to authorised operations
              accounts
            </span>
          </div>
          <small>PAUSE · REFRESH · RECHARGE</small>
        </div>
        <div className="login-panel">
          <span className="eyebrow">TEAM ACCESS</span>
          <h2>Welcome to your shift.</h2>
          <p>Sign in with your operator or manager account.</p>
          {error && (
            <div className="notice warning" role="alert">
              {error}
            </div>
          )}
          {loading ? (
            <p>Checking connection…</p>
          ) : (
            <Login
              surface={surface}
              onDone={() => {
                void refresh()
              }}
            />
          )}
        </div>
      </main>
    )

  return (
    <div className="app">
      <header className="header">
        <Brand />
        <nav aria-label="Main navigation">
          {(operations
            ? manager
              ? ['Orders', 'New sale', 'Items', 'Accounts']
              : ['Orders', 'New sale']
            : ['Menu', 'Orders', 'Account']
          ).map((t) => (
            <button
              className={tab === t ? 'nav-active' : ''}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="header-end">
          {user ? (
            <>
              <span className="user-tag">
                <UserRound size={16} />
                {user.name}
                <small>{user.role}</small>
              </span>
              <button
                className="icon-button"
                aria-label="Sign out"
                disabled={busy}
                onClick={async () => {
                  if (await mutate('logout', {})) {
                    setCart({})
                    checkoutKey.current = null
                  }
                }}
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <button className="button small" onClick={() => setShowLogin(true)}>
              Sign in <ArrowRight size={15} />
            </button>
          )}
        </div>
      </header>
      <main className="main">
        {error && (
          <div className="notice warning" role="alert">
            <AlertTriangle size={17} />
            <span>{error} Orders are not being submitted.</span>
            <button onClick={() => void refresh()}>Retry</button>
          </div>
        )}
        {message && (
          <div className="notice" role="status">
            {message}
            <button aria-label="Dismiss message" onClick={() => setMessage('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {operations ? (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  OPERATIONS / {manager ? 'MANAGER' : 'TEAM'}
                </span>
                <h1>
                  {tab === 'Orders'
                    ? 'Every order. One workspace.'
                    : tab === 'Items'
                      ? 'A well-prepared menu.'
                      : tab === 'New sale'
                        ? 'A good break starts here.'
                        : 'Your people, connected.'}
                </h1>
                <p>Café and shop orders, moving together.</p>
              </div>
              <span className="sync">
                {synced
                  ? `Updated ${synced} · refreshes every 5s`
                  : 'Not connected'}
              </span>
            </div>
            {manager && escalated.length > 0 && (
              <section className="escalation" role="alert">
                <AlertTriangle />
                <div>
                  <b>
                    {escalated.length} order{escalated.length === 1 ? '' : 's'}{' '}
                    need manager attention
                  </b>
                  <p>
                    {escalated
                      .map((o) => `#${shortId(o.id)}: ${alerts(o).join(', ')}`)
                      .join(' · ')}
                  </p>
                </div>
              </section>
            )}
            {tab === 'Orders' && (
              <>
                <div className="stats">
                  <Stat
                    label="Awaiting confirmation"
                    value={String(orders.filter((o) => !o.confirmedAt).length)}
                  />
                  <Stat
                    label="In progress"
                    value={String(active.filter((o) => o.confirmedAt).length)}
                  />
                  <Stat
                    label="Fully delivered"
                    value={String(orders.filter(complete).length)}
                  />
                  <Stat
                    label="Needs attention"
                    value={String(escalated.length)}
                  />
                </div>
                <div className="section-heading">
                  <h2>Order board</h2>
                  <button
                    className="text-button"
                    onClick={() => void refresh()}
                  >
                    Refresh orders
                  </button>
                </div>
                <div className="order-grid">
                  {[...active, ...orders.filter(complete)].map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      operations
                      manager={manager}
                      currentAllergies={profiles[order.userId]}
                      busy={busy}
                      act={(action, data) =>
                        mutate('orders', {
                          id: order.id,
                          version: order.version,
                          action,
                          data,
                        })
                      }
                    />
                  ))}
                  {!orders.length && (
                    <Empty
                      title="Ready for the first order"
                      detail="Confirmed checkouts from the customer and staff portal will appear here."
                    />
                  )}
                </div>
              </>
            )}
            {tab === 'New sale' && (
              <Sale
                products={products.filter((p) => p.active)}
                busy={busy}
                save={(data, onRejected) => mutate('sale', data, onRejected)}
              />
            )}
            {tab === 'Items' && manager && (
              <Items
                products={products}
                busy={busy}
                save={(data) => mutate('products', data)}
              />
            )}
            {tab === 'Accounts' && manager && (
              <Accounts busy={busy} save={(data) => mutate('accounts', data)} />
            )}
          </>
        ) : (
          <>
            {tab === 'Menu' && (
              <>
                <section className="hero">
                  <div className="hero-copy">
                    <span className="eyebrow gold">
                      YOUR EVERYDAY, A LITTLE BETTER
                    </span>
                    <h1>
                      A good break.
                      <br />
                      <em>All in one place.</em>
                    </h1>
                    <p>
                      Fresh café favourites and everyday shop essentials.
                      <br />
                      One basket. One order. Delivered at their own pace.
                    </p>
                    <a className="button gold-button" href="#menu">
                      Find your favourites <ArrowRight size={17} />
                    </a>
                    <div className="hero-features">
                      <span>
                        <Coffee size={15} /> Made to order
                      </span>
                      <span>
                        <ShoppingBag size={15} /> Shop essentials
                      </span>
                    </div>
                  </div>
                  <div className="hero-art">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <div className="cup-art">
                      <Coffee size={100} strokeWidth={1} />
                      <small>CALM BREAK</small>
                    </div>
                    <span className="hero-stamp">
                      PAUSE
                      <br />
                      <i>for a moment</i>
                    </span>
                  </div>
                </section>
                <div className="benefits">
                  <span>
                    <CheckCircle2 /> One checkout for café + shop
                  </span>
                  <span>
                    <Clock3 /> Confirmed delivery estimates
                  </span>
                  <span>
                    <ShieldCheck /> Allergy notes sent to the team
                  </span>
                </div>
                <div className="menu-layout" id="menu">
                  <section>
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">
                          A LITTLE OF WHAT YOU LOVE
                        </span>
                        <h2>Café meets everyday.</h2>
                      </div>
                      <label className="search">
                        <Search size={17} />
                        <input
                          aria-label="Search menu"
                          placeholder="Find something good…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="filters">
                      {['All items', 'Café', 'Shop'].map((c) => (
                        <button
                          className={category === c ? 'selected' : ''}
                          key={c}
                          onClick={() => setCategory(c)}
                        >
                          {c === 'Café' ? (
                            <Coffee size={15} />
                          ) : c === 'Shop' ? (
                            <Store size={15} />
                          ) : null}
                          {c}
                        </button>
                      ))}
                    </div>
                    <div className="products">
                      {products
                        .filter(
                          (p) =>
                            p.active &&
                            (category === 'All items' ||
                              category === p.category) &&
                            p.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((p) => (
                          <article className="product" key={p.id}>
                            <div
                              className={`product-art ${p.category === 'Shop' ? 'shop-art' : ''}`}
                            >
                              {p.category === 'Café' ? (
                                <Coffee size={49} strokeWidth={1} />
                              ) : (
                                <ShoppingBag size={49} strokeWidth={1} />
                              )}
                              <span>{p.category}</span>
                            </div>
                            <div className="product-info">
                              <div className="product-title">
                                <h3>{p.name}</h3>
                                <small>
                                  <Clock3 size={12} />
                                  {p.minutes} min default
                                </small>
                              </div>
                              <div className="product-bottom">
                                <b>{money(p.price)}</b>
                                <button
                                  className="add"
                                  aria-label={`Add ${p.name}`}
                                  onClick={() => quantity(p.id, 1)}
                                >
                                  <Plus size={18} />
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                    </div>
                    {!products.length && (
                      <Empty
                        title={
                          loading
                            ? 'Preparing the menu…'
                            : 'The menu is not available yet'
                        }
                        detail="Please check back once the team has connected the ordering service."
                      />
                    )}
                  </section>
                  <aside className="basket">
                    <span className="eyebrow">YOUR LITTLE BREAK</span>
                    <h2>
                      One lovely basket <ShoppingBag size={21} />
                    </h2>
                    {count > 0 && !checkoutKey.current && (
                      <button
                        className="text-button"
                        onClick={() => setCart({})}
                      >
                        Clear basket
                      </button>
                    )}
                    <p className="muted">Café + shop, together.</p>
                    {!count ? (
                      <div className="basket-empty">
                        <ShoppingBag size={34} strokeWidth={1} />
                        <p>A little something for you?</p>
                        <small>Add your favourites to get started.</small>
                      </div>
                    ) : (
                      <>
                        <div className="basket-lines">
                          {cartProducts.map((p) => (
                            <div className="basket-line" key={p.id}>
                              <div>
                                <b>{p.name}</b>
                                <small>
                                  {p.category} · {money(p.price)}
                                </small>
                              </div>
                              <div className="stepper">
                                <button
                                  aria-label={`Remove one ${p.name}`}
                                  onClick={() => quantity(p.id, -1)}
                                >
                                  <Minus size={13} />
                                </button>
                                <span>{cart[p.id]}</span>
                                <button
                                  aria-label={`Add one ${p.name}`}
                                  onClick={() => quantity(p.id, 1)}
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <label>
                          Order note
                          <textarea
                            maxLength={1000}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Room, delivery location or special requests"
                          />
                        </label>
                        <div className="allergy-hint">
                          <ShieldCheck size={16} />
                          <span>
                            {user?.allergies
                              ? `Allergy note: ${user.allergies}`
                              : 'Add allergy information in your account before ordering.'}
                          </span>
                        </div>
                        <div className="basket-total">
                          <span>Total</span>
                          <b>{money(cartTotal)}</b>
                        </div>
                        <button
                          className="button full"
                          disabled={busy || !!error}
                          onClick={() => void checkout()}
                        >
                          {busy
                            ? 'Sending…'
                            : checkoutKey.current
                              ? 'Retry same order'
                              : 'Place order'}
                          <ArrowRight size={16} />
                        </button>
                        <small className="basket-foot">
                          Billed to your account. The team confirms timings
                          after receiving your order.
                        </small>
                      </>
                    )}
                  </aside>
                </div>
              </>
            )}
            {tab === 'Orders' && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">YOUR ORDERS</span>
                    <h1>A little closer to your break.</h1>
                    <p>Follow each item, from confirmation to delivery.</p>
                  </div>
                  <span className="sync">
                    {synced ? `Updated ${synced} · every 5s` : 'Not connected'}
                  </span>
                </div>
                {!user ? (
                  <SignInPrompt onClick={() => setShowLogin(true)} />
                ) : (
                  <div className="order-grid">
                    {orders.map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                    {!orders.length && (
                      <Empty
                        title="Your first break is waiting"
                        detail="Choose café and shop favourites from the menu. They will arrive here as one order."
                      />
                    )}
                  </div>
                )}
              </>
            )}
            {tab === 'Account' && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">YOUR ACCOUNT</span>
                    <h1>Your break, your way.</h1>
                    <p>Profile, allergy notes and account bills.</p>
                  </div>
                </div>
                {!user ? (
                  <SignInPrompt onClick={() => setShowLogin(true)} />
                ) : (
                  <div className="account-grid">
                    <Profile
                      user={user}
                      busy={busy}
                      save={(data) => mutate('profile', data)}
                    />
                    <section className="panel">
                      <span className="eyebrow">ACCOUNT & BILLS</span>
                      <h2>Outstanding balance</h2>
                      <div className="balance">{money(unpaid)}</div>
                      <p className="muted">
                        Payment is handled by the team. Online payment is not
                        collected here.
                      </p>
                      {orders.map((o) => (
                        <div className="bill" key={o.id}>
                          <div>
                            <b>#{shortId(o.id)}</b>
                            <small>
                              {new Date(o.createdAt).toLocaleDateString()} ·{' '}
                              {o.paid ? 'Paid' : 'Unpaid'}
                            </small>
                          </div>
                          <b>{money(total(o))}</b>
                        </div>
                      ))}
                    </section>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      <footer className="footer">
        <span>CALM BREAK</span>
        <span>PAUSE · REFRESH · RECHARGE</span>
        <span>A little pause goes a long way.</span>
      </footer>
      {showLogin && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Sign in"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close sign in"
              onClick={() => setShowLogin(false)}
            >
              <X />
            </button>
            <Brand />
            <Login
              surface={surface}
              onDone={() => {
                setShowLogin(false)
                void refresh()
              }}
            />
          </section>
        </div>
      )}
    </div>
  )
}
function Brand() {
  return (
    <div className="brand">
      <img
        src="/calm-break-mark.png"
        alt="Calm Break — Pause, Refresh, Recharge"
      />
      <div>
        <b>CALM BREAK</b>
        <small>PAUSE · REFRESH · RECHARGE</small>
      </div>
    </div>
  )
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  )
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <Coffee size={30} strokeWidth={1} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  )
}
function SignInPrompt({ onClick }: { onClick: () => void }) {
  return (
    <section className="panel">
      <h2>A space just for you.</h2>
      <p>Sign in to see your orders, profile and bills.</p>
      <button className="button" onClick={onClick}>
        Sign in <ArrowRight size={16} />
      </button>
    </section>
  )
}
function Login({ surface, onDone }: { surface: Surface; onDone: () => void }) {
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError('')
        const values = Object.fromEntries(new FormData(e.currentTarget))
        try {
          await request(surface, register ? 'register' : 'login', values)
          onDone()
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2>{register ? 'Make yourself at home.' : 'Welcome back.'}</h2>
      {register && (
        <label>
          Your name
          <input name="name" required maxLength={100} autoComplete="name" />
        </label>
      )}
      <label>
        Email address
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="username"
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={register ? 12 : undefined}
          maxLength={128}
          autoComplete={register ? 'new-password' : 'current-password'}
        />
      </label>
      {register && (
        <small className="muted">
          Use at least 12 characters. Staff accounts are provided by your
          manager.
        </small>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button full" disabled={busy}>
        {busy
          ? 'Please wait…'
          : register
            ? 'Create customer account'
            : 'Sign in'}
        <ArrowRight size={16} />
      </button>
      {surface === 'customer' && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setRegister(!register)
            setError('')
          }}
        >
          {register
            ? 'Already have an account? Sign in'
            : 'New here? Create a customer account'}
        </button>
      )}
    </form>
  )
}
function Profile({
  user,
  busy,
  save,
}: {
  user: User
  busy: boolean
  save: (data: unknown) => Promise<boolean>
}) {
  const [saved, setSaved] = useState(false)
  return (
    <form
      className="panel form"
      onSubmit={async (e) => {
        e.preventDefault()
        const data = Object.fromEntries(new FormData(e.currentTarget))
        setSaved(await save(data))
      }}
    >
      <span className="eyebrow">PROFILE & SAFETY</span>
      <h2>Your details</h2>
      <label>
        Name
        <input name="name" defaultValue={user.name} required maxLength={100} />
      </label>
      <label>
        Email
        <input value={user.email} disabled />
      </label>
      <label>
        Allergies and dietary safety notes
        <textarea
          name="allergies"
          defaultValue={user.allergies}
          maxLength={1000}
          placeholder="For example: severe peanut allergy"
        />
      </label>
      <p className="allergy-hint">
        <AlertTriangle size={18} /> These notes are shown to the operations team
        on every order. Speak directly to the team about severe allergies.
      </p>
      <button className="button" disabled={busy}>
        Save profile <Check size={16} />
      </button>
      {saved && (
        <p role="status">
          Profile updated. Your latest allergy notes are visible to the team.
        </p>
      )}
    </form>
  )
}
function OrderCard({
  order,
  operations = false,
  manager = false,
  currentAllergies,
  busy,
  act,
}: {
  order: Order
  operations?: boolean
  manager?: boolean
  currentAllergies?: string
  busy?: boolean
  act?: (action: string, data: unknown) => Promise<boolean>
}) {
  const [minutes, setMinutes] = useState(order.lines.map((l) => l.minutes))
  const late = alerts(order)
  return (
    <article className={`order-card ${late.length ? 'late' : ''}`}>
      <div className="order-top">
        <div>
          <span className="eyebrow">ORDER #{shortId(order.id)}</span>
          <h3>
            {operations
              ? order.customer
              : new Date(order.createdAt).toLocaleDateString()}
          </h3>
          <small>Placed {time(order.createdAt)}</small>
        </div>
        <span className={`status ${complete(order) ? 'delivered' : ''}`}>
          {complete(order)
            ? 'Fully delivered'
            : order.confirmedAt
              ? 'In progress'
              : 'Awaiting confirmation'}
        </span>
      </div>
      {operations && (order.allergyNote || currentAllergies) && (
        <div className="allergy-alert">
          <AlertTriangle size={18} />
          <div>
            <b>ALLERGY / SAFETY NOTE</b>
            <p>{currentAllergies || order.allergyNote}</p>
            {currentAllergies !== undefined &&
              currentAllergies !== order.allergyNote && (
                <small>
                  At checkout: {order.allergyNote || 'None recorded'}. Profile
                  updated since checkout.
                </small>
              )}
          </div>
        </div>
      )}
      {order.note && (
        <p className="order-note">
          <b>Order note:</b> {order.note}
        </p>
      )}
      {operations && late.length > 0 && (
        <div className="overdue">
          <AlertTriangle size={15} />
          {late.join(' · ')} — manager attention required
        </div>
      )}
      <div className="order-lines">
        {order.lines.map((line, i) => (
          <div className="order-line" key={line.productId}>
            <div>
              <b>
                {line.quantity} × {line.name}
              </b>
              <small>
                {line.category} · {money(line.price * line.quantity)}
              </small>
              {line.deliveredAt ? (
                <span className="line-delivered">
                  <CheckCircle2 size={13} /> Delivered {time(line.deliveredAt)}
                </span>
              ) : line.dueAt ? (
                <small className="due">
                  <Clock3 size={13} />
                  Due {time(line.dueAt)} · {line.minutes} min
                </small>
              ) : (
                <small>
                  Default estimate: {line.minutes} min after confirmation
                </small>
              )}
            </div>
            {operations && !order.confirmedAt ? (
              <label className="time-input">
                Timeframe
                <input
                  type="number"
                  min={1}
                  max={1440}
                  aria-label={`Timeframe for ${line.name}`}
                  value={minutes[i]}
                  onChange={(e) =>
                    setMinutes((v) =>
                      v.map((m, n) => (n === i ? Number(e.target.value) : m)),
                    )
                  }
                />
                <small>minutes</small>
              </label>
            ) : operations && !line.deliveredAt ? (
              <button
                className="button small secondary"
                disabled={busy}
                onClick={() => void act?.('deliver', i)}
              >
                Mark delivered
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="order-bottom">
        <b>{money(total(order))}</b>
        <span>{order.paid ? 'Paid' : 'Billed · unpaid'}</span>
      </div>
      {operations && !order.confirmedAt && (
        <button
          className="button full"
          disabled={
            busy ||
            minutes.some((m) => !Number.isInteger(m) || m < 1 || m > 1440)
          }
          onClick={() => void act?.('confirm', minutes)}
        >
          Confirm order & send timeframes <Check size={16} />
        </button>
      )}
      {manager && !order.paid && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm('Confirm payment has been received for this bill?')
            )
              void act?.('paid', null)
          }}
        >
          Record payment received
        </button>
      )}
    </article>
  )
}
function Items({
  products,
  busy,
  save,
}: {
  products: Product[]
  busy: boolean
  save: (data: unknown) => Promise<boolean>
}) {
  const [editing, setEditing] = useState<Product | null>(null)
  const [nonce, setNonce] = useState(0)
  return (
    <div className="account-grid">
      <section className="panel">
        <div className="section-heading">
          <h2>Menu & shop items</h2>
          <button
            className="text-button"
            onClick={() => {
              setEditing(null)
              setNonce((n) => n + 1)
            }}
          >
            + New item
          </button>
        </div>
        {products.map((p) => (
          <button
            key={p.id}
            className={`item-row ${editing?.id === p.id ? 'editing' : ''}`}
            onClick={() => setEditing(p)}
          >
            <span>
              <b>{p.name}</b>
              <small>
                {p.category} · {p.active ? 'Available' : 'Hidden'}
              </small>
            </span>
            <span>
              {money(p.price)}
              <small>
                {p.minutes} min · +{p.escalationMinutes} min escalation
              </small>
            </span>
          </button>
        ))}
      </section>
      <form
        key={`${editing?.id || 'new'}-${nonce}`}
        className="panel form"
        onSubmit={async (e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const ok = await save({
            id: editing?.id,
            name: f.get('name'),
            category: f.get('category'),
            price: Math.round(Number(f.get('price')) * 100),
            minutes: Number(f.get('minutes')),
            escalationMinutes: Number(f.get('escalationMinutes')),
            active: f.get('active') === 'on',
          })
          if (ok) {
            setEditing(null)
            setNonce((n) => n + 1)
          }
        }}
      >
        <span className="eyebrow">MANAGER CONTROLS</span>
        <h2>{editing ? 'Edit item' : 'Add an item'}</h2>
        <label>
          Item name
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={editing?.name}
          />
        </label>
        <label>
          Service
          <select name="category" defaultValue={editing?.category || 'Café'}>
            <option>Café</option>
            <option>Shop</option>
          </select>
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
            defaultValue={editing ? editing.price / 100 : ''}
          />
        </label>
        <label>
          Default preparation / fulfilment time (minutes)
          <input
            name="minutes"
            type="number"
            min="1"
            max="1440"
            required
            defaultValue={editing?.minutes || 15}
          />
        </label>
        <label>
          Manager escalation threshold (minutes)
          <input
            name="escalationMinutes"
            type="number"
            min="1"
            max="1440"
            required
            defaultValue={editing?.escalationMinutes || 5}
          />
        </label>
        <p className="muted">
          Escalate unconfirmed orders after this threshold. Once confirmed,
          escalate undelivered items this many minutes after their due time.
          Changes apply to new orders only.
        </p>
        <label className="checkbox">
          <input
            name="active"
            type="checkbox"
            defaultChecked={editing?.active ?? true}
          />{' '}
          Available to order
        </label>
        <button className="button" disabled={busy}>
          Save item <Check size={16} />
        </button>
      </form>
    </div>
  )
}
function Accounts({
  busy,
  save,
}: {
  busy: boolean
  save: (data: unknown) => Promise<boolean>
}) {
  const [saved, setSaved] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  return (
    <div className="account-grid">
      <section className="panel">
        <ShieldCheck size={30} />
        <h2>
          The right access.
          <br />
          For the right people.
        </h2>
        <p>
          <b>Staff</b> use the ordering portal to order café and shop items,
          update allergies, and view their bills.
        </p>
        <p>
          <b>Operators</b> confirm orders and mark individual items delivered in
          the operations portal.
        </p>
        <p>
          <b>Managers</b> also manage items, default timeframes, escalation
          thresholds, accounts and payment records.
        </p>
        <p className="muted">
          Accounts cannot switch between customer/staff and operations access.
          Use a separate account for each responsibility.
        </p>
      </section>
      <form
        ref={form}
        className="panel form"
        onSubmit={async (e) => {
          e.preventDefault()
          const ok = await save(
            Object.fromEntries(new FormData(e.currentTarget)),
          )
          setSaved(ok)
          if (ok) form.current?.reset()
        }}
      >
        <span className="eyebrow">MANAGER ONLY</span>
        <h2>Create an account</h2>
        <label>
          Name
          <input name="name" required maxLength={100} />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="off" />
        </label>
        <label>
          Access role
          <select name="role">
            <option value="staff">Staff — ordering, profile & bills</option>
            <option value="operator">Operator — café & shop operations</option>
            <option value="manager">Manager — full operations access</option>
          </select>
        </label>
        <label>
          Initial password
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
        </label>
        <button className="button" disabled={busy}>
          Create account <Plus size={16} />
        </button>
        {saved && (
          <p role="status">
            Account created. Share the correct portal address and credentials
            securely.
          </p>
        )}
      </form>
    </div>
  )
}

function Sale({
  products,
  busy,
  save,
}: {
  products: Product[]
  busy: boolean
  save: (data: unknown, onRejected?: () => void) => Promise<boolean>
}) {
  const [customers, setCustomers] = useState<User[]>([])
  const [customerId, setCustomerId] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const key = useRef<string | null>(null)
  useEffect(() => {
    request<User[]>('operations', 'customers')
      .then(setCustomers)
      .catch((e) => setError(e.message))
  }, [])
  const customer = customers.find((c) => c.id === customerId)
  const chosen = products.filter((p) => cart[p.id])
  return (
    <div className="account-grid">
      <section className="panel">
        <span className="eyebrow">CAFÉ + SHOP POS</span>
        <h2>Start a counter order</h2>
        <p>
          Choose an account, then add café and shop items to the same bill.
          Confirm delivery timeframes from the order board after sending.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {products.map((p) => (
          <div className="item-row" key={p.id}>
            <span>
              <b>{p.name}</b>
              <small>
                {p.category} · {money(p.price)} · {p.minutes} min
              </small>
            </span>
            <button
              className="button small"
              disabled={!!key.current}
              aria-label={`Add ${p.name} to counter order`}
              onClick={() =>
                setCart((c) => ({
                  ...c,
                  [p.id]: Math.min(99, (c[p.id] || 0) + 1),
                }))
              }
            >
              <Plus size={14} />
            </button>
          </div>
        ))}
      </section>
      <form
        className="panel form"
        onSubmit={async (e) => {
          e.preventDefault()
          key.current ??= crypto.randomUUID()
          if (
            await save(
              {
                customerId,
                key: key.current,
                note,
                cart: chosen.map((p) => ({
                  productId: p.id,
                  quantity: cart[p.id],
                })),
              },
              () => {
                key.current = null
              },
            )
          ) {
            key.current = null
            setCart({})
            setNote('')
            setError(
              'Order sent. Open the order board to confirm its timeframes.',
            )
          }
        }}
      >
        <h2>Current order</h2>
        <label>
          Customer / staff account
          <select
            required
            value={customerId}
            disabled={!!key.current}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Select an account</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.email}
              </option>
            ))}
          </select>
        </label>
        {customer?.allergies && (
          <div className="allergy-alert">
            <AlertTriangle />
            <div>
              <b>ALLERGY NOTE</b>
              <p>{customer.allergies}</p>
            </div>
          </div>
        )}
        {chosen.map((p) => (
          <div className="basket-line" key={p.id}>
            <b>{p.name}</b>
            <div className="stepper">
              <button
                disabled={!!key.current}
                type="button"
                aria-label={`Remove one ${p.name}`}
                onClick={() =>
                  setCart((c) => ({ ...c, [p.id]: Math.max(0, c[p.id] - 1) }))
                }
              >
                <Minus size={14} />
              </button>
              <span>{cart[p.id]}</span>
              <button
                disabled={!!key.current}
                type="button"
                aria-label={`Add one ${p.name}`}
                onClick={() =>
                  setCart((c) => ({ ...c, [p.id]: Math.min(99, c[p.id] + 1) }))
                }
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        ))}
        <label>
          Order / delivery note
          <textarea
            value={note}
            maxLength={1000}
            disabled={!!key.current}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="basket-total">
          <span>Total</span>
          <b>{money(chosen.reduce((n, p) => n + p.price * cart[p.id], 0))}</b>
        </div>
        <button
          className="button"
          disabled={busy || !chosen.length || !customerId}
        >
          {key.current ? 'Retry same counter order' : 'Send order to board'}
          <ArrowRight size={16} />
        </button>
        <small className="muted">
          This records an unpaid account bill. Record actual payment from the
          manager order board.
        </small>
      </form>
    </div>
  )
}
