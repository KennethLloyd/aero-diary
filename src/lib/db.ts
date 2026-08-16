import 'server-only'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma/client'

// Server-only Prisma singleton (ADR-0002: no client ever sees the DB).
// The better-sqlite3 driver adapter is the Prisma 7 + SQLite combo
// verified against Turbopack at scaffold time (ADR-0001).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:./data/aero-diary.db',
  })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}