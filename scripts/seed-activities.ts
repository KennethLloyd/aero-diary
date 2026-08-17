#!/usr/bin/env tsx
import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../src/generated/prisma/client'
import { LEGACY_ACTIVITIES } from '../src/lib/activities'

const envFile = existsSync('.env.local') ? '.env.local' : '.env'
config({ path: envFile })

async function main(): Promise<void> {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:./data/aero-diary.db',
  })
  const db = new PrismaClient({ adapter })

  try {
    const existing = await db.activity.findMany()
    for (const legacy of LEGACY_ACTIVITIES) {
      const match = existing.find(
        (activity) =>
          activity.name.trim().toLocaleLowerCase() ===
          legacy.name.toLocaleLowerCase(),
      )
      if (match) {
        continue
      }
      await db.activity.create({ data: legacy })
    }
    console.log(`Seeded ${LEGACY_ACTIVITIES.length} legacy activities.`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
