import { z } from 'zod'

export const accountRoles = [
  'customer',
  'cashier',
  'shopkeeper',
  'chef',
  'order_taker',
  'barista',
  'kitchen',
  'manager',
  'admin',
] as const
export const accountFields = z
  .object({
    name: z.string().trim().min(2).max(100),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/),
    employeeId: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^KV\d{4}$/)
      .or(z.literal('')),
    role: z.enum(accountRoles),
    isApproved: z.boolean(),
    creditLimit: z.number().finite().min(0).max(100000).multipleOf(0.01),
    monthlyDeductionLimit: z
      .number()
      .finite()
      .min(0)
      .max(100000)
      .multipleOf(0.01),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'customer' && !value.employeeId)
      ctx.addIssue({
        code: 'custom',
        message: 'Customers require an employee ID in KV0000 format.',
        path: ['employeeId'],
      })
  })
export const editAccountSchema = accountFields.and(
  z.object({ id: z.string().min(1).max(100) }),
)
export const createAccountSchema = accountFields.and(
  z.object({ password: z.string().min(12).max(128) }),
)
export const resetAccountSchema = z
  .object({
    id: z.string().min(1).max(100),
    password: z.string().min(12).max(128),
    confirmation: z.string().min(12).max(128),
  })
  .refine((v) => v.password === v.confirmation, 'Passwords must match.')
export type ManagedAccount = {
  id: string
  name: string
  username: string | null
  employeeId: string | null
  role: string
  isApproved: boolean
  creditLimit: string
  monthlyDeductionLimit: string
}
