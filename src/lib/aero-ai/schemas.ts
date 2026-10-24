import { z } from 'zod';
import { JOURNAL_RETRIEVAL_MODES } from '@/lib/journal/memory-selection';

export const aeroAiThreadIdSchema = z.cuid();

export const aeroAiMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  requestId: z.uuid(),
  stream: z.boolean().optional().default(true),
});

export const retrieveJournalToolInputSchema = z
  .object({
    query: z.string().trim().min(1).max(2_000),
    limit: z.number().int().min(1).max(8).default(6),
    mode: z.enum(JOURNAL_RETRIEVAL_MODES).default('relevance'),
  })
  .strict();

export type AeroAiMessageRequest = z.infer<typeof aeroAiMessageRequestSchema>;
export type RetrieveJournalToolInput = z.infer<typeof retrieveJournalToolInputSchema>;

export const journalEvidenceSchema = z.object({
  entryId: z.string().min(1).max(128),
  journalDate: z.string(),
  mood: z.string(),
  content: z.string(),
  score: z.number().finite(),
  sources: z
    .array(
      z.discriminatedUnion('sourceType', [
        z.object({
          sourceType: z.literal('text'),
          passageIndex: z.number().int().nonnegative(),
          similarity: z.number().finite(),
        }),
        z.object({
          sourceType: z.literal('photo'),
          photoId: z.string().min(1).max(128),
          similarity: z.number().finite(),
        }),
      ]),
    )
    .max(4)
    .optional(),
});
