import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const LOCAL_DATABASE_URL = 'postgresql://aero:aero-local-only@127.0.0.1:5432/aero_diary';

export function createDatabaseClient(connectionString = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema: 'public' }),
  });
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
}
