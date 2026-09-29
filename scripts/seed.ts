#!/usr/bin/env tsx
// Canonical fresh-environment setup: pnpm db:seed.
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { createDatabaseClient } from '../src/lib/db-client';
import { requireDemoCredentials } from '../src/lib/auth/demo-config';
import { seedDemoData } from '../src/lib/demo-seed';

const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

async function main(): Promise<void> {
  const credentials = requireDemoCredentials();
  const database = createDatabaseClient();

  try {
    const summary = await seedDemoData(database, credentials);
    console.log(`Demo dataset ready: ${summary.entries} entries, ${summary.activities} activities, ${summary.photos} photos.`);
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
