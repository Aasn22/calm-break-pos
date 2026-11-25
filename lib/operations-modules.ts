import { z } from 'zod'
export const operationsSections = [
  'terminal',
  'orders',
  'inventory',
  'team',
  'customers',
  'admin',
  'purchasing',
  'loyalty',
] as const
export type OperationsSection = (typeof operationsSections)[number]
export const sectionTitles: Record<OperationsSection, string> = {
  terminal: 'POS terminal',
  orders: 'Order monitor',
  inventory: 'Inventory & café menu',
  team: 'Team & access',
  customers: 'Customers',
  admin: 'Admin dashboard',
  purchasing: 'Purchasing',
  loyalty: 'Loyalty program',
}
export const sectionPath = (section: OperationsSection) =>
  `/operations/${section}`
export function allowedSection(role: string, section: OperationsSection) {
  if (['admin', 'team', 'customers'].includes(section))
    return role === 'admin' || (section === 'team' && role === 'manager')
  if (['purchasing', 'loyalty'].includes(section))
    return ['admin', 'manager'].includes(role)
  if (section === 'terminal')
    return [
      'admin',
      'manager',
      'cashier',
      'shopkeeper',
      'order_taker',
    ].includes(role)
  return [
    'admin',
    'manager',
    'cashier',
    'shopkeeper',
    'order_taker',
    'chef',
    'barista',
    'kitchen',
  ].includes(role)
}
export const purchaseDraft = z.object({
  key: z.string().uuid(),
  supplier: z.string().trim().min(2).max(150),
  invoiceNumber: z.string().trim().max(100),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(100000),
        unitCost: z.number().finite().min(0).max(100000).multipleOf(0.01),
      }),
    )
    .min(1)
    .max(50),
})
export const policyInput = z.object({
  enabled: z.boolean(),
  pointsPerDollar: z.number().int().min(1).max(100),
  rewardPoints: z.number().int().min(1).max(1000000),
  rewardLabel: z.string().trim().min(2).max(120),
})
export type PurchaseView = {
  id: string
  supplier: string
  invoiceNumber: string | null
  status: string
  total: string
  createdAt: Date | string
  receivedAt: Date | string | null
  lines: {
    productId: string
    name: string
    quantity: number
    unitCost: string
  }[]
}
export type LoyaltyView = {
  fulfilledIds: string[]
  configured: boolean
  enabled: boolean
  pointsPerDollar: number
  rewardPoints: number
  rewardLabel: string
  members: {
    id: string
    name: string
    employeeId: string | null
    points: number
  }[]
  entries: {
    id: string
    customerId: string
    points: number
    kind: string
    note: string
    createdAt: Date | string
  }[]
  eligibleOrders: {
    id: string
    orderNumber: number
    total: string
    customerUserId: string | null
  }[]
}
