import { z } from 'zod'

// Login input validation (ADR-0002). Format checks only — credential failures
// return one generic message in the action (no user enumeration).
export const loginSchema = z.object({
  email: z
    .email({ error: 'Enter a valid email address.' })
    .trim()
    .toLowerCase()
    .max(254),
  password: z
    .string({ error: 'Enter your password.' })
    .min(1, { error: 'Enter your password.' })
    .max(256),
})

export type LoginInput = z.infer<typeof loginSchema>

// create-user script input (CONTEXT.md: Zod on every input). Stricter password
// policy than login — this provisions a real account, not a login attempt.
export const createUserSchema = z.object({
  email: z
    .email({ error: 'Invalid email address.' })
    .trim()
    .toLowerCase()
    .max(254),
  password: z
    .string()
    .min(8, { error: 'Password must be at least 8 characters.' })
    .max(256),
  name: z.string().trim().max(100).optional(),
  isDemo: z.boolean().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

// Demo user email (ADR-0006); "Try the demo" opens a session for this account.
export const DEMO_EMAIL = 'demo@aerodiary.local'