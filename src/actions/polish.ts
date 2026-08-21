'use server';

import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { requestPolishedEntry } from '@/lib/journal/polish';
import { polishEntrySchema } from '@/lib/journal/schemas';

const POLISH_FAILED = 'Polish is unavailable right now. Your entry can still be saved as written.';

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
  if (!user?.styleStandard?.trim()) return { error: POLISH_FAILED };

  try {
    const revisedText = await requestPolishedEntry({
      note: parsed.data.note,
      styleStandard: user.styleStandard,
    });
    return { revisedText };
  } catch {
    return { error: POLISH_FAILED };
  }
}
