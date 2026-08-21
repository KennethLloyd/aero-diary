'use server';

import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { configuredLlmClient } from '@/lib/journal/llm-client-config';
import { requestPolishedEntry } from '@/lib/journal/polish';
import { polishEntrySchema } from '@/lib/journal/schemas';

const POLISH_FAILED = 'Polish is unavailable right now. Your entry can still be saved as written.';
const DEFAULT_POLISH_STANDARD =
  'Revise the entry for concise, clear, natural language while preserving the writer’s meaning, voice, facts, details, and emotional honesty. Return the complete entry only; do not add commentary or invent anything.';

export type PolishEntryState = { revisedText?: string; error?: string } | undefined

export async function polishEntry(
  _prevState: PolishEntryState,
  formData: FormData,
): Promise<PolishEntryState> {
  const session = await verifySession();
  const parsed = polishEntrySchema.safeParse({ note: formData.get('note') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Write a note before polishing.' };
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { styleStandard: true },
  });
  const styleStandard = user?.styleStandard?.trim() || DEFAULT_POLISH_STANDARD;

  try {
    const revisedText = await requestPolishedEntry({
      note: parsed.data.note,
      styleStandard,
    }, configuredLlmClient());
    return { revisedText };
  } catch {
    return { error: POLISH_FAILED };
  }
}
