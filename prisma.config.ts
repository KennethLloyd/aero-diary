import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The Prisma CLI does not load `.env.local` (that is a Next.js convention).
// Load whichever environment file exists: `.env.local` locally or `.env` on a host.
const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // `?? ''` keeps `prisma generate` (postinstall) working on a fresh clone
  // before `.env.local` exists; migration commands require DATABASE_URL.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
