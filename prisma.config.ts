import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// The Prisma CLI does not load `.env.local` (that is a Next.js convention).
// Load whichever env file exists: `.env.local` on Mac dev, `.env` on OCI prod.
const envFile = existsSync('.env.local') ? '.env.local' : '.env'
config({ path: envFile })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // `?? ''` keeps `prisma generate` (postinstall) working on a fresh clone
  // before `.env.local` exists; migrate/seed require DATABASE_URL to be set.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
})