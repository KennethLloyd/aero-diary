import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import { z } from 'zod';

const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

const DEVICE_AUTH_ENDPOINT = 'https://oauth2.googleapis.com/device/code';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

const deviceCodeResponseSchema = z.object({
  device_code: z.string().min(1),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().optional(),
  user_code: z.string().min(1),
  verification_uri: z.string().url().optional(),
  verification_url: z.string().url().optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().min(1).optional(),
});

type DeviceCodeResponse = z.infer<typeof deviceCodeResponseSchema>
type TokenResponse = z.infer<typeof tokenResponseSchema>

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to ${envFile} before running pnpm drive:bootstrap.`);
  }
  return value;
}

async function postForm<T>(
  endpoint: string,
  values: Record<string, string>,
  schema: z.ZodType<T>,
  allowError = false,
): Promise<T> {
  const response = await fetch(endpoint, {
    body: new URLSearchParams(values),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });
  const body: unknown = await response.json();
  if (!response.ok && !allowError) {
    const error = tokenResponseSchema.parse(body);
    throw new Error(`${endpoint} failed: ${error.error_description ?? error.error ?? response.statusText}`);
  }
  return schema.parse(body);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const clientId = requiredEnv('GOOGLE_DRIVE_CLIENT_ID');
  const clientSecret = requiredEnv('GOOGLE_DRIVE_CLIENT_SECRET');
  const device = await postForm(DEVICE_AUTH_ENDPOINT, {
    client_id: clientId,
    scope: DRIVE_SCOPE,
  }, deviceCodeResponseSchema) as DeviceCodeResponse;

  const verificationUrl = device.verification_url ?? device.verification_uri;
  if (!verificationUrl) throw new Error('Google did not return a verification URL.');
  console.log(`Open ${verificationUrl} and enter code ${device.user_code}.`);
  console.log('Waiting for Google authorization…');

  const expiresAt = Date.now() + device.expires_in * 1_000;
  let interval = Math.max(device.interval ?? 5, 5);
  while (Date.now() < expiresAt) {
    await sleep(interval * 1_000);
    const token = await postForm(TOKEN_ENDPOINT, {
      client_id: clientId,
      client_secret: clientSecret,
      device_code: device.device_code,
      grant_type: DEVICE_GRANT_TYPE,
    }, tokenResponseSchema, true) as TokenResponse;

    if (token.refresh_token) {
      console.log('\nAdd this value to .env.local and the OCI environment:');
      console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${token.refresh_token}`);
      return;
    }

    if (token.error === 'authorization_pending') continue;
    if (token.error === 'slow_down') {
      interval += 5;
      continue;
    }
    throw new Error(token.error_description ?? token.error ?? 'Google did not return a refresh token.');
  }

  throw new Error('The Google device code expired before authorization completed.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
