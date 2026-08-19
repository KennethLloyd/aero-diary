import { hash, verify } from '@node-rs/argon2';

// Argon2id hashing (ADR-0002), params pinned so a library default change can't
// weaken stored hashes. Not `server-only`: shared with the create-user script.
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB per thread
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return verify(passwordHash, password, ARGON2_OPTIONS);
}

// Dummy hash for timing-uniform verify: unknown emails still run argon2 so
// response time doesn't leak which accounts exist.
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Y3swWthAcrL2Tv9EyYop4g$QmkiG3T3TX0OcCQ2DbBtaWDN1XVerkWJh+4d5o9Ohbs';