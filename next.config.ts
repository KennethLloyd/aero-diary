import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Turbopack is the default bundler in Next.js 16 for both `dev` and `build`.
  // The Prisma `prisma-client` generator emits plain TypeScript that is bundled
  // like any other source — the generator + better-sqlite3 adapter combo is
  // verified against Turbopack per ADR-0001.
}

export default nextConfig