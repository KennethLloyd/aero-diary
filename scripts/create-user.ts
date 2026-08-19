#!/usr/bin/env tsx
// Admin provisioning (ADR-0002): create/update a user with an argon2id hash.
// Runs under plain Node via tsx — deliberately avoids `server-only` modules.
//
// Usage: pnpm create-user <email> <password> [--name "<Name>"] [--demo]
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { createUserSchema } from '../src/lib/auth/schemas';

// Load env like prisma.config.ts: `.env.local` on dev, `.env` on OCI.
const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

function usage(): never {
  console.error(
    'Usage: pnpm create-user <email> <password> [--name "<Name>"] [--demo]',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args[0];
  const password = args[1];
  if (!email || !password) usage();

  const nameFlag = args.indexOf('--name');
  const name = nameFlag >= 0 ? args[nameFlag + 1] : undefined;
  // `undefined` (not false) when the flag is absent — so an upsert re-run
  // without --demo leaves an existing demo user untouched (see update below).
  const isDemo = args.includes('--demo') ? true : undefined;

  const parsed = createUserSchema.safeParse({ email, password, name, isDemo });
  if (!parsed.success) {
    console.error(parsed.error.issues[0]?.message ?? 'Invalid input.');
    process.exit(1);
  }
  const {
    email: validatedEmail,
    password: validatedPassword,
    name: validatedName,
    isDemo: validatedDemo,
  } = parsed.data;

  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:./data/aero-diary.db',
  });
  const db = new PrismaClient({ adapter });

  const passwordHash = await hashPassword(validatedPassword);
  const user = await db.user.upsert({
    where: { email: validatedEmail },
    update: {
      passwordHash,
      name: validatedName ?? undefined,
      // `?? undefined` = leave untouched on re-run (mirror `name`): omitting
      // --demo must never flip an existing demo user back to a real one.
      isDemo: validatedDemo ?? undefined,
    },
    create: {
      email: validatedEmail,
      passwordHash,
      name: validatedName ?? null,
      isDemo: validatedDemo ?? false,
    },
  });

  console.log(
    `User ${user.email}${validatedDemo ? ' (demo)' : ''} ready — id ${user.id}.`,
  );
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});