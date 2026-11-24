import { NextRequest, NextResponse } from 'next/server'
import { hostAllowed } from './lib/hosts'
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const host = request.headers.get('host') || ''
  const operationsHost = process.env.OPERATIONS_HOST
  if (
    path === '/' &&
    operationsHost &&
    host.toLowerCase() === operationsHost.toLowerCase() &&
    hostAllowed(host, 'operations')
  )
    return NextResponse.rewrite(new URL('/operations', request.url))
  const surface =
    path.startsWith('/operations') || path.startsWith('/api/operations')
      ? 'operations'
      : 'customer'
  if (!hostAllowed(host, surface))
    return new NextResponse('Not found', { status: 404 })
  return NextResponse.next()
}
export const config = { matcher: ['/', '/operations/:path*', '/api/:path*'] }
