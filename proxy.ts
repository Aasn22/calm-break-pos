import { NextRequest, NextResponse } from 'next/server'

function normalizeHost(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/:\d+$/, '') ?? ''
}

function isHostname(value: string) {
  return value.length <= 253 && value.split('.').every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
}

export function proxy(request: NextRequest) {
  const rawCustomerHost = process.env.CUSTOMER_HOST?.trim().toLowerCase() ?? ''
  const rawOperationsHost = process.env.OPERATIONS_HOST?.trim().toLowerCase() ?? ''
  const customerHost = normalizeHost(rawCustomerHost)
  const operationsHost = normalizeHost(rawOperationsHost)
  const host = normalizeHost(request.headers.get('host') ?? undefined)
  const configured = Boolean(rawCustomerHost || rawOperationsHost)

  if (configured) {
    if (!isHostname(rawCustomerHost) || !isHostname(rawOperationsHost) || customerHost === operationsHost) {
      return new NextResponse('Portal host configuration is incomplete.', { status: 503 })
    }

    if (host === operationsHost) {
      const path = request.nextUrl.pathname
      if (path === '/') return NextResponse.redirect(new URL('/operations', request.url))
      if (!path.startsWith('/operations') && !path.startsWith('/api/auth') && !path.startsWith('/api/operations') && !path.startsWith('/_next') && path !== '/favicon.ico') {
        return new NextResponse('Not found', { status: 404 })
      }
      if (path.startsWith('/api/auth/sign-up')) return new NextResponse('Not found', { status: 404 })
      return NextResponse.next()
    }

    if (host === customerHost) {
      const path = request.nextUrl.pathname
      if (path.startsWith('/operations') || path.startsWith('/api/operations')) return new NextResponse('Not found', { status: 404 })
      return NextResponse.next()
    }

    return new NextResponse('Not found', { status: 404 })
  }

  const path = request.nextUrl.pathname
  if (path.startsWith('/operations') || path.startsWith('/api/operations')) return NextResponse.next()
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
