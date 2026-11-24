import { Pool } from 'pg'
import { applyPortalSchema } from '../lib/db/migrate'

async function main() {
  if (
    process.argv.includes('--if-enabled') &&
    process.env.CALM_BREAK_MIGRATE !== 'true'
  )
    return
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required for migrations.')
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
    max: 1,
  })
  const client = await pool.connect()
  try {
    const count = await applyPortalSchema(client)
    const result = await client.query(
      `SELECT EXISTS(SELECT 1 FROM "user" WHERE role IN ('admin','manager') AND "isApproved"=true) AS present`,
    )
    console.info(
      `Current portal schema verified: ${count} tables. Administrator account present: ${result.rows[0].present ? 'yes' : 'no'}.`,
    )
    if (!result.rows[0].present)
      console.info(
        'An administrator must be initialized with locally supplied credentials before operations sign-in can succeed. No password or role was changed.',
      )
  } finally {
    client.release()
    await pool.end()
  }
}
void main().catch((error) => {
  // Do not log provider messages, SQL parameters or connection strings.
  const code =
    error && typeof error === 'object' && typeof error.code === 'string'
      ? error.code
      : 'unknown'
  console.error(
    `Portal schema migration failed (${code}); no deployment should be released. Check database permissions and schema compatibility.`,
  )
  process.exitCode = 1
})
