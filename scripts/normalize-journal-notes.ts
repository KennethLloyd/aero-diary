#!/usr/bin/env tsx
import { normalizeJournalNote } from '../src/lib/journal/notes';
import { createCliDatabase, loadCliEnvironment } from './cli-utils';

async function main(): Promise<void> {
  loadCliEnvironment();
  const database = createCliDatabase();
  try {
    const entries = await database.entry.findMany({
      select: { id: true, note: true },
    });
    const updates = entries
      .map((entry) => ({ id: entry.id, note: normalizeJournalNote(entry.note) }))
      .filter((entry, index) => entry.note !== entries[index]?.note);

    await database.$transaction(async (transaction) => {
      for (const entry of updates) {
        await transaction.entry.update({
          where: { id: entry.id },
          data: { note: entry.note },
        });
      }
    });

    console.log(`Normalized ${updates.length} journal notes.`);
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
