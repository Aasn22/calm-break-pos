import { and, eq } from 'drizzle-orm'
import { auth } from '../lib/auth'
import { db, pool, WORKSPACE_ID } from '../lib/db'
import { products, user } from '../lib/db/schema'

const managerName = process.env.MANAGER_NAME?.trim()
const managerEmail = process.env.MANAGER_EMAIL?.trim().toLowerCase()
const managerPassword = process.env.MANAGER_PASSWORD

if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
  throw new Error('DATABASE_URL and BETTER_AUTH_SECRET are required for setup.')
}
if (!managerName || !managerEmail || !managerPassword || managerPassword.length < 12 || managerPassword.length > 128) {
  throw new Error('Set MANAGER_NAME, MANAGER_EMAIL, and a unique MANAGER_PASSWORD (12–128 characters) in your trusted local environment.')
}

delete process.env.MANAGER_NAME
delete process.env.MANAGER_EMAIL
delete process.env.MANAGER_PASSWORD

const starterCatalog = [
  { sku: 'CB-COF-001', name: 'Cappuccino', category: 'Coffee', segment: 'cafe', price: '4.50', description: 'Espresso · steamed milk', prepMinutes: 4 },
  { sku: 'CB-COF-002', name: 'Iced matcha', category: 'Coffee', segment: 'cafe', price: '5.25', description: 'Ceremonial grade · oat milk', prepMinutes: 5 },
  { sku: 'CB-MEA-001', name: 'Avocado toast', category: 'Meals', segment: 'cafe', price: '8.75', description: 'Sourdough · chili flakes', prepMinutes: 8 },
  { sku: 'CB-BAK-001', name: 'Blueberry muffin', category: 'Bakery', segment: 'cafe', price: '3.50', description: 'Baked fresh this morning', prepMinutes: 2 },
  { sku: 'CB-DRK-001', name: 'Green glow juice', category: 'Drinks', segment: 'cafe', price: '6.00', description: 'Apple · cucumber · mint', prepMinutes: 3 },
  { sku: 'CB-MEA-002', name: 'Chicken wrap', category: 'Meals', segment: 'cafe', price: '9.25', description: 'Herb chicken · greens', prepMinutes: 7 },
  { sku: 'CB-TKS-001', name: 'Sparkling water', category: 'Tuck shop', segment: 'tuck_shop', price: '2.25', description: '500 ml · chilled', stock: 18 },
  { sku: 'CB-TKS-002', name: 'Phone cable', category: 'Tuck shop', segment: 'tuck_shop', price: '8.50', description: 'USB-C · 1 m', stock: 5 },
]

async function setup() {
try {
  const [existing] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, managerEmail!)).limit(1)
  let managerId = existing?.id
  if (existing) {
    if (existing.role !== 'manager') throw new Error('That email already belongs to an account; no password or role was changed. Use a new manager email.')
    console.info('Manager account already exists; its password and role were left unchanged.')
  } else {
    const created = await auth.api.signUpEmail({ body: { name: managerName!, email: managerEmail!, password: managerPassword! } })
    managerId = created.user.id
    await db.update(user).set({ role: 'manager', workspaceId: WORKSPACE_ID }).where(and(eq(user.id, managerId), eq(user.role, 'customer')))
    console.info('Initial manager account created.')
  }

  const rows = starterCatalog.map((item) => ({
    id: crypto.randomUUID(), workspaceId: WORKSPACE_ID, userId: managerId!,
    name: item.name, description: item.description, sku: item.sku, segment: item.segment,
    category: item.category, price: item.price, stock: item.stock ?? 0,
    lowStockAt: item.sku === 'CB-TKS-002' ? 8 : 5, prepMinutes: item.prepMinutes ?? 0,
  }))
  await db.insert(products).values(rows).onConflictDoNothing()
  console.info('Starter catalog is ready. Review prices, preparation times, stock thresholds, and items in Operations.')
} finally {
  await pool.end()
}
}

void setup().catch(() => {
  console.error('Database setup failed. Check the required variables and database state; existing accounts were not changed.')
  process.exitCode = 1
})
