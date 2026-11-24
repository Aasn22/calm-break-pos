import { and, eq } from 'drizzle-orm'
import { auth } from '../lib/auth'
import { db, pool, WORKSPACE_ID } from '../lib/db'
import { products, user } from '../lib/db/schema'

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const adminUsername = adminEmail?.split('@')[0].replace(/[^a-z0-9._-]/g, '').slice(0, 32)
const adminName = process.env.ADMIN_NAME?.trim() || adminEmail?.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const adminPassword = process.env.ADMIN_PASSWORD

if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
  throw new Error('DATABASE_URL and BETTER_AUTH_SECRET are required for setup.')
}
if (!adminName || !adminEmail || !adminUsername || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(adminUsername) || !adminPassword || adminPassword.length < 12 || adminPassword.length > 128) {
  throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD (12–128 characters). ADMIN_NAME is optional and defaults from the email address.')
}

delete process.env.ADMIN_NAME
delete process.env.ADMIN_EMAIL
delete process.env.ADMIN_PASSWORD

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
    const [existing] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, adminEmail!)).limit(1)
    let adminId = existing?.id
    if (existing) {
      if (!['admin', 'manager'].includes(existing.role)) throw new Error('That email already belongs to a non-administrator account; no password or role was changed.')
      const [usernameOwner] = await db.select({ id: user.id }).from(user).where(eq(user.username, adminUsername!)).limit(1)
      if (usernameOwner && usernameOwner.id !== existing.id) throw new Error('The administrator username derived from the email is already in use.')
      await db.update(user).set({ role: 'admin', username: adminUsername!, workspaceId: WORKSPACE_ID, isApproved: true, emailVerified: true, updatedAt: new Date() }).where(eq(user.id, existing.id))
      console.info('Administrator account already exists; its password was left unchanged.')
    } else {
      const created = await auth.api.signUpEmail({ body: { name: adminName!, email: adminEmail!, password: adminPassword! } })
      adminId = created.user.id
      const [updated] = await db.update(user).set({ role: 'admin', username: adminUsername!, workspaceId: WORKSPACE_ID, isApproved: true, emailVerified: true, updatedAt: new Date() })
        .where(and(eq(user.id, adminId), eq(user.role, 'customer'))).returning({ id: user.id })
      if (!updated) throw new Error('Administrator role could not be assigned.')
      console.info('Initial administrator account created.')
    }

    if (process.env.SEED_STARTER_CATALOG === 'true') {
      const rows = starterCatalog.map((item) => ({
        id: crypto.randomUUID(), workspaceId: WORKSPACE_ID, userId: adminId!,
        name: item.name, description: item.description, sku: item.sku, segment: item.segment,
        category: item.category, price: item.price, stock: item.stock ?? 0,
        lowStockAt: item.sku === 'CB-TKS-002' ? 8 : 5, prepMinutes: item.prepMinutes ?? 0,
      }))
      await db.insert(products).values(rows).onConflictDoNothing()
      console.info('Starter catalog is ready. Review prices, preparation times, stock thresholds, and items in Operations.')
    }
  } finally {
    await pool.end()
  }
}

void setup().catch(() => {
  console.error('Database setup failed. Check the required variables and database state; existing accounts were not changed.')
  process.exitCode = 1
})
