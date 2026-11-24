import { Pool } from 'pg'
export type Query = <T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
) => Promise<T[]>
const globalDb = globalThis as unknown as { cbPool?: Pool }
export function configured() {
  return !!process.env.DATABASE_URL
}
export const query: Query = async (text, values) => {
  if (!configured())
    throw new Error(
      'Database is not connected. Please contact the administrator.',
    )
  const pool = (globalDb.cbPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 8000,
  }))
  const result = await pool.query(text, values)
  return result.rows
}
