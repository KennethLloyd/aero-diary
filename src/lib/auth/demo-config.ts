import { z } from 'zod';

const demoCredentialsSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(8).max(256),
});

export type DemoCredentials = z.infer<typeof demoCredentialsSchema>

// This module is shared by the Node setup script and server runtime. Keep all
// imports of it on the server; the server wrapper enforces that boundary for
// Next.js modules.
export function getDemoCredentials(): DemoCredentials | null {
  const parsed = demoCredentialsSchema.safeParse({
    email: process.env.DEMO_EMAIL,
    password: process.env.DEMO_PASSWORD,
  });
  return parsed.success ? parsed.data : null;
}

export function isDemoConfigured(): boolean {
  return getDemoCredentials() !== null;
}

export function requireDemoCredentials(): DemoCredentials {
  const credentials = getDemoCredentials();
  if (!credentials) {
    throw new Error('DEMO_EMAIL and DEMO_PASSWORD must be configured before seeding the demo.');
  }
  return credentials;
}
