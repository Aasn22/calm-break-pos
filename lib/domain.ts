export type Role = 'customer' | 'staff' | 'operator' | 'manager'
export type User = {
  id: string
  name: string
  email: string
  role: Role
  allergies: string
}
export type Product = {
  id: string
  name: string
  category: 'Café' | 'Shop'
  price: number
  minutes: number
  escalationMinutes: number
  active: boolean
}
export type Line = {
  productId: string
  name: string
  category: string
  price: number
  quantity: number
  minutes: number
  escalationMinutes: number
  dueAt: string | null
  deliveredAt: string | null
}
export type Order = {
  id: string
  userId: string
  customer: string
  createdAt: string
  confirmedAt: string | null
  allergyNote: string
  note: string
  lines: Line[]
  version: number
  paid: boolean
}
export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
export const total = (order: Pick<Order, 'lines'>) =>
  order.lines.reduce((n, l) => n + l.price * l.quantity, 0)
export const complete = (order: Order) =>
  !!order.confirmedAt &&
  order.lines.length > 0 &&
  order.lines.every((l) => !!l.deliveredAt)
export function alerts(order: Order, now = Date.now()) {
  if (complete(order)) return []
  if (!order.confirmedAt)
    return now >=
      Date.parse(order.createdAt) +
        Math.min(...order.lines.map((l) => l.escalationMinutes)) * 60000
      ? ['Awaiting confirmation']
      : []
  return order.lines
    .filter(
      (l) =>
        !l.deliveredAt &&
        l.dueAt &&
        now >= Date.parse(l.dueAt) + l.escalationMinutes * 60000,
    )
    .map((l) => `${l.name} overdue`)
}
export function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(`Enter a whole number between ${min} and ${max}.`)
  return value
}
export function confirm(
  order: Order,
  minutes: unknown,
  now = new Date(),
): Order {
  if (order.confirmedAt) throw new Error('This order is already confirmed.')
  if (!Array.isArray(minutes) || minutes.length !== order.lines.length)
    throw new Error('Set a timeframe for every item.')
  return {
    ...order,
    confirmedAt: now.toISOString(),
    lines: order.lines.map((l, i) => ({
      ...l,
      minutes: integer(minutes[i], 1, 1440),
      dueAt: new Date(now.getTime() + minutes[i] * 60000).toISOString(),
    })),
  }
}
export function deliver(order: Order, index: unknown, now = new Date()): Order {
  if (!order.confirmedAt)
    throw new Error('Confirm the order before delivering items.')
  const i = integer(index, 0, order.lines.length - 1)
  if (order.lines[i].deliveredAt)
    throw new Error('This item has already been delivered.')
  return {
    ...order,
    lines: order.lines.map((l, n) =>
      n === i ? { ...l, deliveredAt: now.toISOString() } : l,
    ),
  }
}

export const allowed = (role: Role, surface: 'customer' | 'operations') =>
  surface === 'operations'
    ? ['operator', 'manager'].includes(role)
    : ['customer', 'staff'].includes(role)
