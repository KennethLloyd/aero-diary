import { z } from 'zod';

export const aeroAiThreadIdSchema = z.cuid();

export const aeroAiMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  requestId: z.uuid(),
  stream: z.boolean().optional().default(true),
});

export const retrieveJournalToolInputSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(8).default(6),
}).strict();

export type AeroAiMessageRequest = z.infer<typeof aeroAiMessageRequestSchema>
export type RetrieveJournalToolInput = z.infer<typeof retrieveJournalToolInputSchema>
