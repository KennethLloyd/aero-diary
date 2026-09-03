import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  cacheComponents: true,
  cacheLife: {
    journal: {
      stale: 300,
      revalidate: 86_400,
      expire: 604_800,
    },
  },
};

export default nextConfig;
