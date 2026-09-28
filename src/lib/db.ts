import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { createDatabaseClient } from '@/lib/db-client';

// Server-only Prisma singleton; the database never reaches the client.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createDatabaseClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
