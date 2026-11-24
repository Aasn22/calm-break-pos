import { randomUUID } from 'node:crypto'
import type { Order, Product, User } from '../domain'
import { confirm, deliver, integer } from '../domain'
import type { Query } from './db'
export const productSql =
  'SELECT id,name,category,price,minutes,escalation_minutes AS "escalationMinutes",active FROM cb_products'
export function orderService(query: Query) {
  return {
    async list(user: User, operations: boolean) {
      const rows = await query<{ payload: Order; version: number }>(
        `SELECT payload,version FROM cb_orders ${operations ? '' : 'WHERE user_id=$1'} ORDER BY created_at DESC`,
        operations ? [] : [user.id],
      )
      return rows.map((r) => ({ ...r.payload, version: r.version }))
    },
    async create(user: User, cart: unknown, key: string, note: string) {
      if (!/^[0-9a-f-]{36}$/i.test(key))
        throw new Error('Invalid checkout key.')
      const [existing] = await query<{ payload: Order; version: number }>(
        'SELECT payload,version FROM cb_orders WHERE user_id=$1 AND request_key=$2',
        [user.id, key],
      )
      if (existing) return { ...existing.payload, version: existing.version }
      if (!Array.isArray(cart) || !cart.length || cart.length > 50)
        throw new Error('Choose between 1 and 50 items.')
      const seen = new Set<string>()
      const products = await query<Product>(`${productSql} WHERE active=true`)
      const lines = cart.map((entry) => {
        if (!entry || typeof entry !== 'object')
          throw new Error('Invalid cart item.')
        const p = products.find((p) => p.id === entry.productId)
        if (!p || seen.has(p.id))
          throw new Error(
            'Your cart contains an unavailable or duplicate item. Refresh the menu.',
          )
        seen.add(p.id)
        return {
          productId: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          quantity: integer(entry.quantity, 1, 99),
          minutes: p.minutes,
          escalationMinutes: p.escalationMinutes,
          dueAt: null,
          deliveredAt: null,
        }
      })
      // Read allergies at checkout, not from an untrusted client payload.
      const [profile] = await query<{ allergies: string }>(
        'SELECT allergies FROM cb_users WHERE id=$1',
        [user.id],
      )
      const id = randomUUID()
      const order: Order = {
        id,
        userId: user.id,
        customer: user.name,
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        allergyNote: profile.allergies,
        note,
        lines,
        version: 1,
        paid: false,
      }
      const [saved] = await query<{ payload: Order; version: number }>(
        `INSERT INTO cb_orders(id,user_id,payload,request_key) VALUES ($1,$2,$3,$4) ON CONFLICT(user_id,request_key) DO UPDATE SET request_key=EXCLUDED.request_key RETURNING payload,version`,
        [id, user.id, JSON.stringify(order), key],
      )
      return { ...saved.payload, version: saved.version }
    },
    async update(
      id: string,
      version: number,
      action: string,
      data: unknown,
      role: string,
    ) {
      const [row] = await query<{ payload: Order; version: number }>(
        'SELECT payload,version FROM cb_orders WHERE id=$1',
        [id],
      )
      if (!row) throw new Error('Order not found.')
      if (row.version !== version)
        throw new Error(
          'Order changed on another device. Refresh and try again.',
        )
      let next = row.payload
      if (action === 'confirm') next = confirm(next, data)
      else if (action === 'deliver') next = deliver(next, data)
      else if (action === 'paid' && role === 'manager')
        next = { ...next, paid: true }
      else throw new Error('Action is not permitted.')
      const changed = await query(
        'UPDATE cb_orders SET payload=$1,version=version+1 WHERE id=$2 AND version=$3 RETURNING id',
        [JSON.stringify(next), id, version],
      )
      if (!changed.length)
        throw new Error(
          'Order changed on another device. Refresh and try again.',
        )
    },
  }
}
