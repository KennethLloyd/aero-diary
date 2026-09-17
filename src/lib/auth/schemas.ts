import { z } from 'zod';

// Login checks format only; the action returns one generic credential error.
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
});

export type LoginInput = z.infer<typeof loginSchema>

export const appLockPinSchema = z
  .string({ error: 'Enter a 4-digit or 6-digit PIN.' })
  .regex(/^(?:[0-9]{4}|[0-9]{6})$/, {
    error: 'Enter a 4-digit or 6-digit PIN.',
  });

export const appLockTimeoutSchema = z
  .enum(['0', '1', '5', '15'], {
    error: 'Choose a valid lock timeout.',
  })
  .transform(Number);

export const enableAppLockSchema = z.object({
  pin: appLockPinSchema,
  timeoutMinutes: appLockTimeoutSchema,
});

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
});

export type CreateUserInput = z.infer<typeof createUserSchema>
