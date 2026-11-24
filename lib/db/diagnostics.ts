export function reportDatabaseFailure(context: string, error: unknown) {
  const visited = new Set<unknown>()
  let current = error
  let code = 'unknown'
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current)
    const entry = current as { code?: unknown; cause?: unknown }
    if (
      typeof entry.code === 'string' &&
      /^[A-Z0-9_]{2,30}$/.test(entry.code)
    ) {
      code = entry.code
      break
    }
    current = entry.cause
  }
  console.error(
    `[Calm Break ${context}] Database/authentication request failed (code=${code}). No request data logged.`,
  )
}
