import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

const handler = toNextJsHandler(auth)

export const GET = handler.GET

export async function POST(request: Request) {
  if (new URL(request.url).pathname.replace(/\/+$/, '').endsWith('/sign-up/email')) {
    return Response.json({ message: 'Use the approved registration form.' }, { status: 404 })
  }
  return handler.POST(request)
}
