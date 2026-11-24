// Exact aliases verified on calm-break-pos. Never trust an arbitrary Host header
// or a wildcard such as *.vercel.app: other tenants must remain untrusted.
const projectOrigins = [
  'https://calm-break-pos.vercel.app',
  'https://calm-break-pos-calm-projects.vercel.app',
  'https://calm-break-pos-git-main-calm-projects.vercel.app',
  'https://myplate.digital',
  'https://www.myplate.digital',
]

type Environment = Record<string, string | undefined>
function origin(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['https:', 'http:'].includes(url.protocol)
    )
      return undefined
    return url.origin
  } catch {
    return undefined
  }
}

export function authOrigins(env: Environment = process.env) {
  const origins = new Set(projectOrigins)
  for (const value of [
    env.BETTER_AUTH_URL,
    ...[
      'VERCEL_URL',
      'VERCEL_BRANCH_URL',
      'VERCEL_PROJECT_PRODUCTION_URL',
      'CUSTOMER_HOST',
      'OPERATIONS_HOST',
    ].map((key) => (env[key] ? `https://${env[key]}` : undefined)),
  ]) {
    const candidate = origin(value)
    if (candidate?.startsWith('https://')) origins.add(candidate)
  }
  if (env.NODE_ENV === 'development') {
    origins.add('http://localhost:3000')
    for (const key of [
      'V0_RUNTIME_URL',
      'V0_DEV_APP_URL',
      'V0_BUILD_URL',
      'V0_SANDBOX_URL',
    ]) {
      const candidate = origin(env[key])
      if (candidate) origins.add(candidate)
    }
  }
  const trustedOrigins = [...origins]
  const fallback =
    origin(env.BETTER_AUTH_URL) ??
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? origin(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`)
      : undefined) ??
    projectOrigins[0]
  return {
    // Resolve on the current approved host so cookies/logout stay on that host.
    baseURL: {
      allowedHosts: trustedOrigins.map((value) => new URL(value).host),
      fallback,
      protocol:
        env.NODE_ENV === 'development' ? ('auto' as const) : ('https' as const),
    },
    trustedOrigins,
  }
}
