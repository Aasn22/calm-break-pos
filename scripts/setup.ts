// Run locally with DATABASE_URL and initial manager details supplied through your environment.
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from '../lib/server/password.ts'
async function main() {
  const { DATABASE_URL, MANAGER_EMAIL, MANAGER_NAME, MANAGER_PASSWORD } =
    process.env
  if (!DATABASE_URL || !MANAGER_EMAIL || !MANAGER_NAME || !MANAGER_PASSWORD)
    throw new Error(
      'Set DATABASE_URL, MANAGER_EMAIL, MANAGER_NAME and MANAGER_PASSWORD in your local environment. Do not commit them.',
    )
  const pool = new pg.Pool({ connectionString: DATABASE_URL })
  try {
    const hash = await hashPassword(MANAGER_PASSWORD)
    await pool.query(
      await readFile(new URL('./schema.sql', import.meta.url), 'utf8'),
    )
    await pool.query(
      `INSERT INTO cb_users(id,name,email,role,password_hash) VALUES($1,$2,$3,'manager',$4) ON CONFLICT(email) DO NOTHING`,
      [randomUUID(), MANAGER_NAME, MANAGER_EMAIL.toLowerCase().trim(), hash],
    )
    console.log(
      'Schema ready. Initial manager created if the email was not already registered.',
    )
  } finally {
    await pool.end()
  }
}
void main().catch(() => {
  console.error(
    'Setup failed. Check database access and manager environment variables; no credentials have been logged.',
  )
  process.exitCode = 1
})
