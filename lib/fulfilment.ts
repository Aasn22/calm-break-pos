export type FulfilmentLine = {
  id: string
  productName: string
  segment: string
  quantity: number
  unitPrice: string
  minutes: number
  escalationMinutes: number
  dueAt: Date | string | null
  deliveredAt: Date | string | null
}
export type FulfilmentOrder = {
  id: string
  orderNumber: number
  status: string
  customerUserId: string | null
  customer: string
  createdAt: Date | string
  confirmedAt: Date | string | null
  allergyNote: string
  currentAllergies: string
  total: string
  version: number
  deliveryLocation?: string | null
  paidAt: Date | string | null
  lines: FulfilmentLine[]
}
export function overdue(order: FulfilmentOrder, now = Date.now()) {
  if (['completed', 'cancelled'].includes(order.status) || !order.lines.length)
    return []
  if (!order.confirmedAt)
    return now >=
      new Date(order.createdAt).getTime() +
        Math.min(...order.lines.map((l) => l.escalationMinutes)) * 60000
      ? ['Awaiting order confirmation']
      : []
  return order.lines
    .filter(
      (l) =>
        !l.deliveredAt &&
        l.dueAt &&
        now >= new Date(l.dueAt).getTime() + l.escalationMinutes * 60000,
    )
    .map((l) => `${l.productName} overdue`)
}
