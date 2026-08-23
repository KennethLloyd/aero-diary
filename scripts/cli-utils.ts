import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';

export function loadCliEnvironment(): string {
  const envFile = existsSync('.env.local') ? '.env.local' : '.env';
  config({ path: envFile });
  return envFile;
}

export function createCliDatabase(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL ?? 'file:./data/aero-diary.db',
    }),
  });
}

export function requiredArgument(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing required argument ${name}.`);
  }
  return value;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function rejectUnknownArguments(args: string[], allowed: Set<string>): void {
  for (const argument of args) {
    if (argument.startsWith('--') && !allowed.has(argument)) {
      throw new Error(`Unknown argument ${argument}.`);
    }
  }
}
