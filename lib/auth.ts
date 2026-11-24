import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { pool } from '@/lib/db'

const baseURL = process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` :
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.V0_RUNTIME_URL)

export const auth = betterAuth({
  database: pool,
  baseURL,
  emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 12, maxPasswordLength: 128 },
  user: {
    additionalFields: {
      role: { type: 'string', required: true, defaultValue: 'customer', input: false },
      workspaceId: { type: 'string', required: true, defaultValue: 'calm-break-main', input: false },
      employeeId: { type: 'string', required: false, input: false },
      username: { type: 'string', required: false, input: false },
      isApproved: { type: 'boolean', required: true, defaultValue: true, input: false },
      creditLimit: { type: 'number', required: true, defaultValue: 0, input: false },
      monthlyDeductionLimit: { type: 'number', required: true, defaultValue: 0, input: false },
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development' ? [
      'http://localhost:3000',
      ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
      ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
      ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
      ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
    ] : []),
    ...(process.env.NODE_ENV === 'production' ? [
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
      ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
      ...(process.env.CUSTOMER_HOST ? [`https://${process.env.CUSTOMER_HOST}`] : []),
      ...(process.env.OPERATIONS_HOST ? [`https://${process.env.OPERATIONS_HOST}`] : []),
    ] : []),
  ],
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
  ...(process.env.NODE_ENV === 'development' ? {
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'none' as const,
        secure: true,
      },
    },
  } : {}),
  plugins: [nextCookies()],
})
