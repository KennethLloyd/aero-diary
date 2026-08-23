#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import {
  buildImportValidationReport,
  importJournalEntries,
  parseJournalImportTemplate,
  validateImportTarget,
} from '../src/lib/journal/importer';
import {
  createCliDatabase,
  hasFlag,
  loadCliEnvironment,
  rejectUnknownArguments,
  requiredArgument,
} from './cli-utils';

const ALLOWED_FLAGS = new Set(['--email', '--input', '--dry-run', '--apply', '--batch-size']);

function usage(): never {
  console.error('Usage: pnpm db:import -- --email <existing-user> --input <path> (--dry-run | --apply) [--batch-size <n>]');
  process.exit(1);
}

function batchSizeArgument(args: string[]): number | undefined {
  const index = args.indexOf('--batch-size');
  if (index < 0) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--batch-size must be a positive integer.');
  }
  return value;
}

async function main(): Promise<void> {
  loadCliEnvironment();
  const args = process.argv.slice(2).filter((argument) => argument !== '--');
  if (args.length === 0) usage();
  rejectUnknownArguments(args, ALLOWED_FLAGS);

  const email = requiredArgument(args, '--email');
  const inputPath = requiredArgument(args, '--input');
  const dryRun = hasFlag(args, '--dry-run');
  const apply = hasFlag(args, '--apply');
  if (dryRun === apply) {
    throw new Error('Choose exactly one of --dry-run or --apply.');
  }

  const raw = readFileSync(inputPath);
  const parsed = parseJournalImportTemplate(raw);
  const database = createCliDatabase();

  try {
    const demoEmail = process.env.DEMO_EMAIL?.trim();
    if (!demoEmail) throw new Error('DEMO_EMAIL must be configured before importing into a selected account.');
    const target = await validateImportTarget(database, email, demoEmail);
    const report = await buildImportValidationReport(
      database,
      target.id,
      parsed.entries,
      parsed.sourceHash,
    );
    console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', target: target.email, ...report }, null, 2));

    if (dryRun) return;

    await importJournalEntries(database, target.id, parsed.entries, parsed.template.schema.tags, {
      batchSize: batchSizeArgument(args),
      onBatch: ({ completed, total }) => {
        console.log(`Imported ${completed}/${total} entries.`);
      },
    });
    console.log(`Journal import applied for ${target.email}.`);
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
