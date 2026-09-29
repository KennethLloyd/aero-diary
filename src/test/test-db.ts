import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL must point to an isolated PostgreSQL test database.');
}

export const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString }, { schema: 'public' }),
});

// Truncate all tables between tests (children before parents for FKs).
export async function resetTestDb(): Promise<void> {
  await testDb.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Session",
      "EntryActivity",
      "Photo",
      "StagedPhotoCancellation",
      "StagedPhoto",
      "JournalMemoryPassage",
      "JournalMemoryGeneration",
      "AeroAiTurn",
      "AeroAiThread",
      "Entry",
      "Activity",
      "User"
    RESTART IDENTITY CASCADE
  `);
}
