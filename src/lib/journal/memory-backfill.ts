import { z } from 'zod';

const identifierSchema = z.string().trim().min(1).max(200);
const journalDateSchema = z.iso.date();
const optionsSchema = z
  .object({
    userId: identifierSchema,
    entryIds: z.array(identifierSchema).default([]),
    photoIds: z.array(identifierSchema).default([]),
    from: journalDateSchema.optional(),
    to: journalDateSchema.optional(),
    after: identifierSchema.optional(),
    limit: z.coerce.number().int().min(1).max(1_000).default(100),
    enqueue: z.boolean().default(false),
    status: z.boolean().default(false),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '--from must be on or before --to.',
  })
  .refine((value) => !(value.enqueue && value.status), {
    message: '--status cannot be combined with --enqueue.',
  });

export type MemoryBackfillOptions = z.infer<typeof optionsSchema>;
export type MemoryBackfillState = 'current' | 'old' | 'missing' | 'failed' | 'skipped';

export function parseMemoryBackfillOptions(
  args: readonly string[],
  kind: 'text' | 'photo',
): MemoryBackfillOptions {
  const values: Record<string, unknown> = { entryIds: [], photoIds: [] };
  const names: Record<string, string> = {
    '--user-id': 'userId',
    '--from': 'from',
    '--to': 'to',
    '--after': 'after',
    '--limit': 'limit',
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];

    if (flag === '--enqueue' || flag === '--status') {
      values[flag === '--enqueue' ? 'enqueue' : 'status'] = true;
      continue;
    }

    const name =
      flag === '--entry-id'
        ? 'entryIds'
        : flag === '--photo-id' && kind === 'photo'
          ? 'photoIds'
          : names[flag];
    const value = args[index + 1];

    if (!name || !value || value.startsWith('--')) {
      throw new Error(`Unknown option or missing value: ${flag}`);
    }

    if (name === 'entryIds' || name === 'photoIds') {
      (values[name] as string[]).push(value);
    } else {
      if (values[name] !== undefined) throw new Error(`Duplicate option: ${flag}`);

      values[name] = value;
    }

    index += 1;
  }

  return optionsSchema.parse(values);
}

export function memoryBackfillDateFilter(options: MemoryBackfillOptions) {
  return options.from || options.to ? { gte: options.from, lte: options.to } : undefined;
}

export function summarizeMemoryBackfill(states: readonly MemoryBackfillState[]) {
  const counts = { current: 0, old: 0, missing: 0, failed: 0, skipped: 0 };

  for (const state of states) counts[state] += 1;

  return counts;
}
