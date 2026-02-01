/**
 * Config secret encryption for API keys and other sensitive values.
 *
 * This module provides functions to encrypt/decrypt sensitive fields
 * within OpenClaw config objects. Encrypted values are prefixed with
 * "enc:" to distinguish them from plaintext.
 *
 * Usage:
 * - Call `encryptConfigSecrets()` before saving config to disk
 * - Call `decryptConfigSecrets()` after loading config from disk
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";

const ENCRYPTED_PREFIX = "enc:";
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Fields to encrypt when found in config objects
const SECRET_FIELD_NAMES = new Set([
  "apiKey",
  "password",
  "token",
  "secret",
  "accessToken",
  "refreshToken",
  "botToken",
  "appToken",
]);

/**
 * Get encryption key material.
 */
function getKeyMaterial(): string {
  const envKey = process.env.OPENCLAW_ENCRYPTION_KEY?.trim();
  if (envKey && envKey.length > 0) return envKey;

  // Fallback to machine-derived key
  const components = [os.hostname(), os.homedir(), os.type(), os.platform()];
  const machineIdPath = process.platform === "linux" ? "/etc/machine-id" : null;
  if (machineIdPath && fs.existsSync(machineIdPath)) {
    try {
      components.push(fs.readFileSync(machineIdPath, "utf8").trim());
    } catch {
      // ignore
    }
  }
  return components.join("|");
}

function deriveKey(salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(getKeyMaterial(), salt, 100000, KEY_LENGTH, "sha256");
}

/**
 * Encrypt a single secret value.
 * Returns an "enc:..." prefixed string.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext || plaintext.startsWith(ENCRYPTED_PREFIX)) {
    return plaintext; // Already encrypted or empty
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: salt | iv | authTag | ciphertext
  const packed = Buffer.concat([salt, iv, authTag, ciphertext]);
  return ENCRYPTED_PREFIX + packed.toString("base64");
}

/**
 * Decrypt a secret value.
 * Returns the plaintext, or the original value if not encrypted or decryption fails.
 */
export function decryptSecret(encrypted: string): string {
  if (!encrypted || !encrypted.startsWith(ENCRYPTED_PREFIX)) {
    return encrypted; // Not encrypted
  }

  try {
    const packed = Buffer.from(encrypted.slice(ENCRYPTED_PREFIX.length), "base64");
    const minLength = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;
    if (packed.length < minLength) return encrypted;

    let offset = 0;
    const salt = packed.subarray(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;
    const iv = packed.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;
    const authTag = packed.subarray(offset, offset + AUTH_TAG_LENGTH);
    offset += AUTH_TAG_LENGTH;
    const ciphertext = packed.subarray(offset);

    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return encrypted; // Decryption failed, return as-is
  }
}

/**
 * Check if a value is an encrypted secret.
 */
export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Recursively encrypt secret fields in a config object.
 * Returns a new object with encrypted values.
 */
export function encryptConfigSecrets<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => encryptConfigSecrets(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SECRET_FIELD_NAMES.has(key) && typeof value === "string" && value.trim()) {
      result[key] = encryptSecret(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = encryptConfigSecrets(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Recursively decrypt secret fields in a config object.
 * Returns a new object with decrypted values.
 */
export function decryptConfigSecrets<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => decryptConfigSecrets(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SECRET_FIELD_NAMES.has(key) && typeof value === "string") {
      result[key] = decryptSecret(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = decryptConfigSecrets(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
