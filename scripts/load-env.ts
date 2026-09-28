import { config } from 'dotenv';
import { existsSync } from 'node:fs';

const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile, quiet: true });
