import { boolean, bigserial, check, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const user = pgTable('user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false), image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  role: text('role').notNull().default('customer'), workspaceId: text('workspaceId').notNull().default('calm-break-main'),
  employeeId: text('employeeId').unique(), username: text('username'), isApproved: boolean('isApproved').notNull().default(true),
  approvedAt: timestamp('approvedAt'), approvedBy: text('approvedBy'), creditLimit: numeric('creditLimit', { precision: 12, scale: 2 }).notNull().default('0'),
  monthlyDeductionLimit: numeric('monthlyDeductionLimit', { precision: 12, scale: 2 }).notNull().default('0'),
}, (table) => [
  uniqueIndex('user_username_key').on(table.username).where(sql`${table.username} is not null`),
  check('user_role_check', sql`${table.role} in ('customer', 'admin', 'cashier', 'shopkeeper', 'chef', 'order_taker', 'barista', 'kitchen', 'manager')`),
  check('user_username_format_check', sql`${table.username} is null or ${table.username} ~ '^[a-z0-9][a-z0-9._-]{2,31}$'`),
])
export const session = pgTable('session', {
  id: text('id').primaryKey(), expiresAt: timestamp('expiresAt').notNull(), token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'), userAgent: text('userAgent'), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
})
export const account = pgTable('account', {
  id: text('id').primaryKey(), accountId: text('accountId').notNull(), providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }), accessToken: text('accessToken'),
  refreshToken: text('refreshToken'), idToken: text('idToken'), accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'), scope: text('scope'), password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})
export const verification = pgTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(), createdAt: timestamp('createdAt').defaultNow(), updatedAt: timestamp('updatedAt').defaultNow(),
})
const owner = () => text('userId').notNull().references(() => user.id)
export const products = pgTable('products', {
  id: text('id').primaryKey(), workspaceId: text('workspaceId').notNull().default('calm-break-main'), userId: owner(),
  name: text('name').notNull(), description: text('description').notNull().default(''), sku: text('sku').notNull(),
  segment: text('segment').notNull(), category: text('category').notNull(), price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  stock: integer('stock').notNull().default(0), lowStockAt: integer('lowStockAt').notNull().default(5),
  prepMinutes: integer('prepMinutes').notNull().default(0), available: boolean('available').notNull().default(true),
  createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => [unique().on(table.workspaceId, table.sku)])
export const orders = pgTable('orders', {
  id: text('id').primaryKey(), workspaceId: text('workspaceId').notNull().default('calm-break-main'), userId: owner(),
  customerUserId: text('customerUserId').references(() => user.id), orderNumber: bigserial('orderNumber', { mode: 'number' }).notNull(),
  segment: text('segment').notNull(), status: text('status').notNull().default('new'), paymentMethod: text('paymentMethod').notNull(),
  paymentReference: text('paymentReference'), deliveryLocation: text('deliveryLocation'), orderType: text('orderType').notNull().default('takeaway'),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(), tax: numeric('tax', { precision: 12, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(), prepStartedAt: timestamp('prepStartedAt'), readyAt: timestamp('readyAt'),
  completedAt: timestamp('completedAt'), createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => [index('orders_workspace_created_idx').on(table.workspaceId, table.createdAt), index('orders_workspace_status_idx').on(table.workspaceId, table.status)])
export const orderItems = pgTable('order_items', {
  id: text('id').primaryKey(), workspaceId: text('workspaceId').notNull().default('calm-break-main'), userId: owner(),
  orderId: text('orderId').notNull().references(() => orders.id, { onDelete: 'cascade' }), productId: text('productId').notNull().references(() => products.id),
  productName: text('productName').notNull(), quantity: integer('quantity').notNull(), unitPrice: numeric('unitPrice', { precision: 12, scale: 2 }).notNull(),
  modifiers: jsonb('modifiers').notNull().default({}), createdAt: timestamp('createdAt').notNull().defaultNow(),
})
export const purchases = pgTable('purchases', {
  id: text('id').primaryKey(), workspaceId: text('workspaceId').notNull().default('calm-break-main'), userId: owner(), supplier: text('supplier').notNull(),
  invoiceNumber: text('invoiceNumber'), segment: text('segment').notNull(), status: text('status').notNull().default('ordered'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(), receivedAt: timestamp('receivedAt'), createdAt: timestamp('createdAt').notNull().defaultNow(),
})
export const purchaseItems = pgTable('purchase_items', {
  id: text('id').primaryKey(), workspaceId: text('workspaceId').notNull().default('calm-break-main'), userId: owner(),
  purchaseId: text('purchaseId').notNull().references(() => purchases.id, { onDelete: 'cascade' }), productId: text('productId').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(), unitCost: numeric('unitCost', { precision: 12, scale: 2 }).notNull(),
})
export const ledgerEntries = pgTable('ledger_entries', {
  id: text('id').primaryKey(), workspaceId: text('workspaceId').notNull().default('calm-break-main'), userId: owner(),
  orderId: text('orderId').notNull().references(() => orders.id), accountUserId: text('accountUserId').notNull().references(() => user.id),
  kind: text('kind').notNull(), amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => [index('ledger_account_created_idx').on(table.workspaceId, table.accountUserId, table.createdAt)])
