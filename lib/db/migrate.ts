import { readFile } from 'node:fs/promises'

export type MigrationClient = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>
}

// Generated from lib/db/schema.ts by drizzle-kit. The baseline is adopted
// additively so a database provisioned by v0 can keep its existing rows.
export async function applyPortalSchema(client: MigrationClient) {
  const source = await readFile(
    new URL('../../migrations/0000_current_portal_schema.sql', import.meta.url),
    'utf8',
  )
  await client.query('BEGIN')
  try {
    await client.query("SET LOCAL lock_timeout = '15s'")
    await client.query("SET LOCAL statement_timeout = '60s'")
    await client.query('SELECT pg_advisory_xact_lock(157821, 94833)')
    const statements = source
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    const tables: { name: string; columns: string[] }[] = []
    for (const statement of statements) {
      const table = statement.match(/^CREATE TABLE "([a-z_]+)" \(([\s\S]+)\);$/)
      if (!table) continue
      await client.query(
        statement.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '),
      )
      const existing = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
        [table[1]],
      )
      const existingColumns = new Set(
        existing.rows.map((row) => row.column_name),
      )
      const columns: string[] = []
      for (const line of table[2].split('\n')) {
        const column = line.trim().replace(/,$/, '')
        const match = column.match(/^"([A-Za-z]+)" /)
        if (!match) continue
        columns.push(match[1])
        // Existing columns are never retyped, removed, or assigned new values.
        if (!existingColumns.has(match[1])) {
          await client.query(`ALTER TABLE "${table[1]}" ADD COLUMN ${column}`)
        }
      }
      tables.push({ name: table[1], columns })
    }
    for (const statement of statements) {
      const constraint = statement.match(
        /^ALTER TABLE "([a-z_]+)" ADD CONSTRAINT "([A-Za-z_]+)"/,
      )
      if (constraint) {
        const exists = await client.query(
          'SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname=$2',
          [`public.${constraint[1]}`, constraint[2]],
        )
        if (!exists.rows.length) await client.query(statement)
      } else if (/^CREATE (UNIQUE )?INDEX /.test(statement)) {
        await client.query(
          statement.replace(
            /^(CREATE (?:UNIQUE )?INDEX) /,
            '$1 IF NOT EXISTS ',
          ),
        )
      }
    }
    // Verify every field actually used by the current application.
    for (const table of tables) {
      await client.query(
        `SELECT ${table.columns.map((c) => `"${c}"`).join(',')} FROM "${table.name}" LIMIT 0`,
      )
    }
    await client.query('COMMIT')
    return tables.length
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
