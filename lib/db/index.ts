import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

const globalForDb = globalThis as typeof globalThis & { calmBreakPool?: Pool }
export const pool = globalForDb.calmBreakPool ?? new Pool({ connectionString: process.env.DATABASE_URL })
if (process.env.NODE_ENV !== 'production') globalForDb.calmBreakPool = pool
export const db = drizzle(pool, { schema })
export const WORKSPACE_ID = 'calm-break-main'
