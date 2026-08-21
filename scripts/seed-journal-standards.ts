#!/usr/bin/env tsx
// Provision the real user's private standard and the demo standard together.
// Usage: pnpm seed-journal-standards <real-user-email> <private-style-file>
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';
import { z } from 'zod';

const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

const genericStylePath = resolve(process.cwd(), 'prisma/seed/generic-style-standard.txt');

function usage(): never {
  console.error('Usage: pnpm seed-journal-standards <real-user-email> <private-style-file>');
  process.exit(1);
}

function readStyleFile(filePath: string, label: string): string {
  try {
    const styleStandard = readFileSync(filePath, 'utf8').trim();
    if (styleStandard) return styleStandard;
  } catch {
    // Fall through to the operator-facing error below.
  }
  console.error(`Could not read a non-empty ${label} style standard: ${filePath}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const [emailArgument, privateStylePath] = process.argv.slice(2);
  if (!emailArgument || !privateStylePath) usage();

  const emailResult = z.email().trim().toLowerCase().safeParse(emailArgument);
  if (!emailResult.success) {
    console.error('Invalid email address.');
    process.exit(1);
  }

  const privateStyleStandard = readStyleFile(privateStylePath, 'private');
  const genericStyleStandard = readStyleFile(genericStylePath, 'generic demo');
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:./data/aero-diary.db',
  });
  const db = new PrismaClient({ adapter });

  try {
    const realUser = await db.user.findUnique({
      where: { email: emailResult.data },
      select: { id: true, email: true, isDemo: true },
    });
    if (!realUser || realUser.isDemo) {
      throw new Error(`Real user not found: ${emailResult.data}`);
    }

    const demoUser = await db.user.findFirst({
      where: { isDemo: true },
      select: { id: true, email: true },
    });
    if (!demoUser) throw new Error('Demo user not found. Provision the demo user first.');

    await db.$transaction([
      db.user.update({
        where: { id: realUser.id },
        data: { styleStandard: privateStyleStandard },
      }),
      db.user.update({
        where: { id: demoUser.id },
        data: { styleStandard: genericStyleStandard },
      }),
    ]);
    console.log(`Journal standards seeded for ${realUser.email} and ${demoUser.email}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
