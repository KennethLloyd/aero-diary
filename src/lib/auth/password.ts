import { hash, verify } from '@node-rs/argon2';

// Argon2id parameters stay explicit so library defaults cannot weaken hashes.
// This module is shared with the user-provisioning script.
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

// Use a dummy hash for unknown emails to avoid timing attacks
// (i.e. user enumeration where an attacker can tell if an email is registered by measuring response time).
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Y3swWthAcrL2Tv9EyYop4g$QmkiG3T3TX0OcCQ2DbBtaWDN1XVerkWJh+4d5o9Ohbs';
