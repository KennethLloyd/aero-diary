import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import { google } from 'googleapis';

const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to ${envFile} before running pnpm drive:bootstrap.`);
  }
  return value;
}

async function main() {
  const clientId = requiredEnv('GOOGLE_DRIVE_CLIENT_ID');
  const clientSecret = requiredEnv('GOOGLE_DRIVE_CLIENT_SECRET');
  const state = randomBytes(32).toString('hex');
  const server = createServer();

  try {
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Could not determine the local OAuth callback port.'));
          return;
        }
        resolve(address.port);
      });
    });

    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authorizationUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_SCOPE],
      state,
    });

    console.log('Open this URL in your browser to authorize Aero Diary:');
    console.log(authorizationUrl);
    console.log('Waiting for Google authorization…');

    const code = await new Promise<string>((resolve, reject) => {
      server.on('request', (request, response) => {
        const requestUrl = new URL(request.url ?? '/', redirectUri);
        if (requestUrl.pathname !== '/oauth2callback') {
          response.writeHead(404).end('Not found.');
          return;
        }

        const returnedState = requestUrl.searchParams.get('state');
        const error = requestUrl.searchParams.get('error');
        if (returnedState !== state) {
          response.writeHead(400).end('Invalid OAuth state. You can close this tab.');
          reject(new Error('Google returned an invalid OAuth state.'));
          return;
        }
        if (error) {
          response.writeHead(400).end('Google authorization was denied. You can close this tab.');
          reject(new Error(`Google authorization failed: ${error}.`));
          return;
        }

        const authorizationCode = requestUrl.searchParams.get('code');
        if (!authorizationCode) {
          response.writeHead(400).end('Google did not return an authorization code. You can close this tab.');
          reject(new Error('Google did not return an authorization code.'));
          return;
        }

        response.writeHead(200).end('Aero Diary authorization complete. You can close this tab and return to the terminal.');
        resolve(authorizationCode);
      });
    });

    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Try again.');

    console.log('\nAdd this value to the host environment:');
    console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } finally {
    server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
