#!/usr/bin/env tsx
// Seed a user's private journal style standard without exposing its contents.
// Usage: pnpm seed-style-standard <email> <style-standard-file>
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';
import { z } from 'zod';

const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

function usage(): never {
  console.error('Usage: pnpm seed-style-standard <email> <style-standard-file>');
  process.exit(1);
}

async function main(): Promise<void> {
  const [emailArgument, filePath] = process.argv.slice(2);
  if (!emailArgument || !filePath) usage();

  const emailResult = z.email().trim().toLowerCase().safeParse(emailArgument);
  if (!emailResult.success) {
    console.error('Invalid email address.');
    process.exit(1);
  }

  let styleStandard: string;
  try {
    styleStandard = readFileSync(filePath, 'utf8').trim();
  } catch {
    console.error(`Could not read style standard file: ${filePath}`);
    process.exit(1);
  }
  if (!styleStandard) {
    console.error('Style standard file is empty.');
    process.exit(1);
  }

  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:./data/aero-diary.db',
  });
  const db = new PrismaClient({ adapter });

  try {
    const existingUser = await db.user.findUnique({
      where: { email: emailResult.data },
      select: { isDemo: true },
    });
    if (!existingUser) throw new Error(`User not found: ${emailResult.data}`);
    if (existingUser.isDemo) {
      throw new Error('Private style standards can only be seeded for a non-demo user.');
    }

    const user = await db.user.update({
      where: { email: emailResult.data },
      data: { styleStandard },
      select: { email: true },
    });
    console.log(`Style standard seeded for ${user.email}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
