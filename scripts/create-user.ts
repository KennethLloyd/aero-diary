#!/usr/bin/env tsx
// Admin provisioning (ADR-0002): create/update a user with an argon2id hash.
// Runs under plain Node via tsx — deliberately avoids `server-only` modules.
//
// Usage: pnpm create-user <email> <password> [--name "<Name>"]
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';
import { createUserSchema } from '../src/lib/auth/schemas';
import { provisionUser } from '../src/lib/auth/provision-user';

// Load env like prisma.config.ts: `.env.local` on dev, `.env` on OCI.
const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

function usage(): never {
  console.error(
    'Usage: pnpm create-user <email> <password> [--name "<Name>"]',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args[0];
  const password = args[1];
  if (!email || !password) usage();

  const nameFlag = args.indexOf('--name');
  if (
    args.some((argument, index) =>
      argument.startsWith('--') && argument !== '--name'
      || argument === '--name' && index !== nameFlag,
    )
    || nameFlag >= 0 && !args[nameFlag + 1]
    || nameFlag >= 0 && args.length > nameFlag + 2
  ) {
    usage();
  }
  const name = nameFlag >= 0 ? args[nameFlag + 1] : undefined;

  const parsed = createUserSchema.safeParse({ email, password, name });
  if (!parsed.success) {
    console.error(parsed.error.issues[0]?.message ?? 'Invalid input.');
    process.exit(1);
  }
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:./data/aero-diary.db',
  });
  const db = new PrismaClient({ adapter });

  const user = await provisionUser(db, parsed.data);

  console.log(`User ${user.email} ready — id ${user.id}.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
