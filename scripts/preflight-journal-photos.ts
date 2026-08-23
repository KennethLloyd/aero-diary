#!/usr/bin/env tsx
import { getPhotoStore } from '../src/lib/drive/store';
import { validateImportTarget } from '../src/lib/journal/importer';
import { preflightJournalPhotos } from '../src/lib/journal/photo-preflight';
import {
  createCliDatabase,
  hasFlag,
  loadCliEnvironment,
  rejectUnknownArguments,
  requiredArgument,
} from './cli-utils';

const ALLOWED_FLAGS = new Set(['--email', '--apply']);

async function main(): Promise<void> {
  loadCliEnvironment();
  const args = process.argv.slice(2).filter((argument) => argument !== '--');
  rejectUnknownArguments(args, ALLOWED_FLAGS);
  const email = requiredArgument(args, '--email');
  const database = createCliDatabase();

  try {
    const demoEmail = process.env.DEMO_EMAIL?.trim();
    if (!demoEmail) throw new Error('DEMO_EMAIL must be configured before running photo preflight.');
    const target = await validateImportTarget(database, email, demoEmail);
    const report = await preflightJournalPhotos(
      database,
      target.id,
      getPhotoStore(),
      hasFlag(args, '--apply'),
    );
    console.log(JSON.stringify({ mode: hasFlag(args, '--apply') ? 'apply' : 'report', ...report }, null, 2));
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
