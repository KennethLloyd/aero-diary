#!/usr/bin/env tsx
// Canonical fresh-environment setup: pnpm db:seed.
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';
import { requireDemoCredentials } from '../src/lib/auth/demo-config';
import { seedDemoData } from '../src/lib/demo-seed';

const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

async function main(): Promise<void> {
  const credentials = requireDemoCredentials();
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:./data/aero-diary.db',
  });
  const database = new PrismaClient({ adapter });

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
