import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { configured, query } from '@/lib/server/db'
import {
  allowed,
  currentUser,
  endSession,
  requireUser,
  startSession,
  type Surface,
} from '@/lib/server/auth'
import { hashPassword, verifyPassword } from '@/lib/server/password'
import { orderService, productSql } from '@/lib/server/orders'
import { hostAllowed } from '@/lib/hosts'
import { integer, type User } from '@/lib/domain'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const orders = orderService(query)
const text = (value: unknown, max: number, required = false) => {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error('Please check the form fields.')
  return value.trim()
}
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params
  const surface: Surface = path[0] === 'operations' ? 'operations' : 'customer'
  const action = path.slice(1).join('/')
  if (
    !['customer', 'operations'].includes(path[0]) ||
    !hostAllowed(request.headers.get('host') || '', surface)
  )
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    if (!configured())
      return NextResponse.json(
        {
          error:
            'Database setup required. Ordering and sign-in are not available yet.',
          configured: false,
        },
        { status: 503 },
      )
    const post = request.method === 'POST'
    if (post) {
      const origin = request.headers.get('origin')
      if (!origin || new URL(origin).host !== request.headers.get('host'))
        return NextResponse.json(
          { error: 'Invalid request origin.' },
          { status: 403 },
        )
      if (Number(request.headers.get('content-length') || 0) > 32768)
        throw new Error('Request too large.')
    }
    const body = post ? await request.json() : {}
    if (!post && action === 'session')
      return NextResponse.json({
        user: await currentUser(surface),
        configured: true,
      })
    if (!post && action === 'products') {
      if (surface === 'operations') await requireUser(surface)
      return NextResponse.json(
        await query(
          `${productSql} ${surface === 'customer' ? 'WHERE active=true' : ''} ORDER BY category,name`,
        ),
      )
    }
    if (post && (action === 'login' || action === 'register')) {
      const email = text(body.email, 254, true).toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error('Enter a valid email address.')
      const [attempt] = await query<{ attempts: number }>(
        `INSERT INTO cb_login_attempts(email,attempts,reset_at) VALUES ($1,1,now()+interval '15 minutes') ON CONFLICT(email) DO UPDATE SET attempts=CASE WHEN cb_login_attempts.reset_at<now() THEN 1 ELSE cb_login_attempts.attempts+1 END,reset_at=CASE WHEN cb_login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE cb_login_attempts.reset_at END RETURNING attempts`,
        [email],
      )
      if (attempt.attempts > 10)
        return NextResponse.json(
          { error: 'Too many attempts. Try again in 15 minutes.' },
          { status: 429 },
        )
      let user: User
      if (action === 'register') {
        if (surface !== 'customer')
          throw new Error('Operations accounts must be created by a manager.')
        const hash = await hashPassword(body.password)
        const rows = await query<User>(
          `INSERT INTO cb_users(id,name,email,role,password_hash) VALUES($1,$2,$3,'customer',$4) ON CONFLICT(email) DO NOTHING RETURNING id,name,email,role,allergies`,
          [randomUUID(), text(body.name, 100, true), email, hash],
        )
        if (!rows.length)
          throw new Error('Unable to create account. Try signing in instead.')
        user = rows[0]
      } else {
        const [found] = await query<User & { password_hash: string }>(
          'SELECT * FROM cb_users WHERE email=$1',
          [email],
        )
        // Perform password work even for unknown accounts.
        const valid = await verifyPassword(
          body.password,
          found?.password_hash ||
            '00000000000000000000000000000000:' + '00'.repeat(64),
        )
        if (!found || !valid || !allowed(found.role, surface))
          throw new Error('Email or password is incorrect for this portal.')
        const { password_hash: _, ...safe } = found
        user = safe
      }
      await startSession(user, surface)
      await query('DELETE FROM cb_login_attempts WHERE email=$1', [email])
      return NextResponse.json({ user })
    }
    const user = await requireUser(surface)
    if (post && action === 'logout') {
      await endSession(surface)
      return NextResponse.json({ ok: true })
    }
    if (!post && action === 'orders')
      return NextResponse.json(
        await orders.list(user, surface === 'operations'),
      )
    if (post && action === 'profile') {
      await query('UPDATE cb_users SET name=$1,allergies=$2 WHERE id=$3', [
        text(body.name, 100, true),
        text(body.allergies, 1000),
        user.id,
      ])
      // Current profile is also returned to operators alongside the immutable checkout note.
      return NextResponse.json({ ok: true })
    }
    if (surface === 'customer' && post && action === 'orders')
      return NextResponse.json(
        await orders.create(
          user,
          body.cart,
          text(body.key, 36, true),
          text(body.note, 1000),
        ),
      )
    if (surface === 'operations') {
      if (!post && action === 'customers')
        return NextResponse.json(
          await query<User>(
            "SELECT id,name,email,role,allergies FROM cb_users WHERE role IN ('customer','staff') ORDER BY name",
          ),
        )
      if (post && action === 'sale') {
        const [customer] = await query<User>(
          "SELECT id,name,email,role,allergies FROM cb_users WHERE id=$1 AND role IN ('customer','staff')",
          [text(body.customerId, 36, true)],
        )
        if (!customer)
          throw new Error('Select a valid customer or staff account.')
        return NextResponse.json(
          await orders.create(
            customer,
            body.cart,
            text(body.key, 36, true),
            text(body.note, 1000),
          ),
        )
      }
      if (!post && action === 'allergies')
        return NextResponse.json(
          await query(
            'SELECT id,allergies FROM cb_users WHERE id IN (SELECT DISTINCT user_id FROM cb_orders)',
          ),
        )
      if (post && action === 'orders') {
        await orders.update(
          text(body.id, 36, true),
          integer(body.version, 1, 1000000),
          text(body.action, 20, true),
          body.data,
          user.role,
        )
        return NextResponse.json({ ok: true })
      }
      if (user.role !== 'manager')
        return NextResponse.json(
          { error: 'Manager access required.' },
          { status: 403 },
        )
      if (post && action === 'products') {
        const category = body.category
        if (!['Café', 'Shop'].includes(category))
          throw new Error('Choose Café or Shop.')
        await query(
          `INSERT INTO cb_products(id,name,category,price,minutes,escalation_minutes,active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,price=EXCLUDED.price,minutes=EXCLUDED.minutes,escalation_minutes=EXCLUDED.escalation_minutes,active=EXCLUDED.active`,
          [
            body.id || randomUUID(),
            text(body.name, 100, true),
            category,
            integer(body.price, 1, 10000000),
            integer(body.minutes, 1, 1440),
            integer(body.escalationMinutes, 1, 1440),
            body.active === true,
          ],
        )
        return NextResponse.json({ ok: true })
      }
      if (post && action === 'accounts') {
        if (!['staff', 'operator', 'manager'].includes(body.role))
          throw new Error('Choose an account role.')
        const email = text(body.email, 254, true).toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new Error('Enter a valid email address.')
        const hash = await hashPassword(body.password)
        const added = await query(
          'INSERT INTO cb_users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING id',
          [randomUUID(), text(body.name, 100, true), email, body.role, hash],
        )
        if (!added.length)
          throw new Error('An account with this email already exists.')
        return NextResponse.json({ ok: true })
      }
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed.'
    if (message === 'UNAUTHORIZED')
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    // Never expose SQL, connection strings, or provider error details.
    if (
      error &&
      typeof error === 'object' &&
      ('code' in error || /connect|relation|database|timeout/i.test(message))
    ) {
      console.error(
        'Calm Break database request failed',
        'code' in error ? String(error.code) : 'connection',
      )
      return NextResponse.json(
        { error: 'Service unavailable. Please contact the administrator.' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
export const GET = handle
export const POST = handle
