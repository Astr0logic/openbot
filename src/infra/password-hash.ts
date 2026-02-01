/**
 * Password hashing utilities using scrypt (Node.js native).
 *
 * Provides secure password hashing and verification for gateway authentication.
 * Uses scrypt with random salt - no external dependencies required.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Scrypt parameters (N=16384, r=8, p=1) - good balance of security and speed
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hash format: $scrypt$N$r$p$salt$hash
 * All values base64 encoded where applicable.
 */
const HASH_PREFIX = "$scrypt$";

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Hash a password using scrypt.
 * Returns a string that can be stored in config.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  const params = [SCRYPT_N, SCRYPT_R, SCRYPT_P].join("$");
  const saltB64 = salt.toString("base64");
  const hashB64 = derivedKey.toString("base64");

  return `${HASH_PREFIX}${params}$${saltB64}$${hashB64}`;
}

/**
 * Verify a password against a stored hash.
 * Returns true if the password matches.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash.startsWith(HASH_PREFIX)) {
    // Not a hashed password - treat as plaintext for backwards compatibility
    return password === storedHash;
  }

  try {
    const parts = storedHash.slice(HASH_PREFIX.length).split("$");
    if (parts.length !== 5) {
      return false;
    }

    const [nStr, rStr, pStr, saltB64, hashB64] = parts;
    const N = parseInt(nStr!, 10);
    const r = parseInt(rStr!, 10);
    const p = parseInt(pStr!, 10);

    if (isNaN(N) || isNaN(r) || isNaN(p)) {
      return false;
    }

    const salt = Buffer.from(saltB64!, "base64");
    const expectedHash = Buffer.from(hashB64!, "base64");

    const derivedKey = await scryptAsync(password, salt, expectedHash.length, { N, r, p });

    return timingSafeEqual(derivedKey, expectedHash);
  } catch {
    return false;
  }
}

/**
 * Check if a string looks like a hashed password.
 */
export function isHashedPassword(value: string): boolean {
  return value.startsWith(HASH_PREFIX);
}

/**
 * Synchronous plaintext comparison for backwards compatibility.
 * Use verifyPassword for hashed passwords.
 */
export function safeEqualPlaintext(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
