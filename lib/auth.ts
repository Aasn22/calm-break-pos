import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { pool } from '@/lib/db'
import { authOrigins } from '@/lib/auth-origins'

export const auth = betterAuth({
  database: pool,
  ...authOrigins(),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: true,
        defaultValue: 'customer',
        input: false,
      },
      workspaceId: {
        type: 'string',
        required: true,
        defaultValue: 'calm-break-main',
        input: false,
      },
      employeeId: { type: 'string', required: false, input: false },
      username: { type: 'string', required: false, input: false },
      isApproved: {
        type: 'boolean',
        required: true,
        defaultValue: false,
        input: false,
      },
      creditLimit: {
        type: 'number',
        required: true,
        defaultValue: 0,
        input: false,
      },
      monthlyDeductionLimit: {
        type: 'number',
        required: true,
        defaultValue: 0,
        input: false,
      },
    },
  },
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
  plugins: [nextCookies()],
})
