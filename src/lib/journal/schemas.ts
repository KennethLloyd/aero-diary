import { z } from 'zod'
import { Mood } from '@/generated/prisma/enums'

const MOOD_VALUES = [
  Mood.AWFUL,
  Mood.BAD,
  Mood.MEH,
  Mood.GOOD,
  Mood.RAD,
] as const

export const createEntrySchema = z.object({
  mood: z.enum(MOOD_VALUES, { error: 'Choose a mood.' }),
  note: z
    .string({ error: 'Write a note before saving.' })
    .trim()
    .min(1, { error: 'Write a note before saving.' })
    .max(20_000, { error: 'Notes must be 20,000 characters or fewer.' }),
  activityIds: z
    .array(z.string().trim().min(1).max(100))
    .max(100, { error: 'Choose fewer activities.' }),
  localOffset: z.coerce
    .number({ error: 'Invalid local time.' })
    .int()
    .min(-840)
    .max(840)
    .optional(),
})

export type CreateEntryInput = z.infer<typeof createEntrySchema>

export const entryIdSchema = z
  .string({ error: 'Entry not found.' })
  .trim()
  .min(1, { error: 'Entry not found.' })
  .max(100, { error: 'Entry not found.' })

export const monthParamSchema = z
  .string({ error: 'Invalid month.' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Invalid month.' })

export const activitySchema = z.object({
  name: z
    .string({ error: 'Enter an activity name.' })
    .trim()
    .min(1, { error: 'Enter an activity name.' })
    .max(50, { error: 'Activity names must be 50 characters or fewer.' }),
  emoji: z
    .string({ error: 'Choose an emoji.' })
    .trim()
    .min(1, { error: 'Choose an emoji.' })
    .max(16, { error: 'Emoji must be 16 characters or fewer.' }),
})

export type ActivityInput = z.infer<typeof activitySchema>

export const activityIdSchema = z
  .string({ error: 'Invalid activity.' })
  .trim()
  .min(1, { error: 'Invalid activity.' })
  .max(100, { error: 'Invalid activity.' })
