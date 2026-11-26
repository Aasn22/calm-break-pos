import { z } from 'zod'
export const catalogFields = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9._-]+$/),
  category: z.string().trim().min(1).max(80),
  segment: z.enum(['cafe', 'tuck_shop']),
  price: z.number().finite().positive().max(100000).multipleOf(0.01),
  escalationMinutes: z.number().int().min(1).max(1440).default(5),
  prepMinutes: z.number().int().min(0).max(1440),
  lowStockAt: z.number().int().min(0).max(1000000),
  available: z.boolean(),
})
export const catalogEdit = catalogFields.and(
  z.object({
    id: z.string().min(1).max(100),
    expectedUpdatedAt: z.string().datetime(),
  }),
)
export const catalogCreate = catalogFields.and(
  z.object({ stock: z.number().int().min(0).max(1000000) }),
)
export const stockAdjustment = z.object({
  id: z.string().min(1).max(100),
  expectedStock: z.number().int().min(0),
  delta: z
    .number()
    .int()
    .min(-1000000)
    .max(1000000)
    .refine((n) => n !== 0, 'Enter a nonzero stock change.'),
})
export type CatalogItem = {
  id: string
  name: string
  description: string
  sku: string
  category: string
  segment: string
  price: string
  stock: number
  lowStockAt: number
  escalationMinutes: number
  prepMinutes: number
  available: boolean
  updatedAt: Date | string
}
