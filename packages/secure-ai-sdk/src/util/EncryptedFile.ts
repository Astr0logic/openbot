/**
 * Encrypted file utilities for storing sensitive data at rest.
 *
 * Uses AES-256-GCM for authenticated encryption with:
 * - A key derived from a machine-specific identifier (or user-provided password).
 * - Per-file random IV and salt for key derivation.
 *
 * File format (binary):
 *   [VERSION: 1 byte] [SALT: 16 bytes] [IV: 12 bytes] [AUTH_TAG: 16 bytes] [CIPHERTEXT: N bytes]
 *
 * This provides encryption at rest for credential files on systems without a
 * native keychain (e.g., Linux without libsecret, or headless servers).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ENCRYPTION_VERSION = 0x01;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive a machine-specific key component for encryption.
 * This is NOT a secret, but adds machine-binding so encrypted files
 * cannot be trivially decrypted if copied to another machine.
 *
 * For stronger security, users should provide a password via environment
 * variable (OPENBOT_ENCRYPTION_KEY) which is mixed into the key derivation.
 */
function getMachineKeyMaterial(): string {
    const components = [os.hostname(), os.homedir(), os.type(), os.platform(), os.arch()];

    // Add a stable machine identifier if available
    const machineIdPath =
        process.platform === "linux"
            ? "/etc/machine-id"
            : process.platform === "win32"
                ? "C:\\Windows\\System32\\config\\systemprofile"
                : null;

    if (machineIdPath && fs.existsSync(machineIdPath)) {
        try {
            const machineId = fs.readFileSync(machineIdPath, "utf8").trim();
            components.push(machineId);
        } catch {
            // Ignore read errors
        }
    }

    return components.join("|");
}

/**
 * Get the encryption key for file encryption.
 * Priority:
 * 1. OPENBOT_ENCRYPTION_KEY environment variable (user-provided secret)
 * 2. Machine-derived key material (weaker, but better than plaintext)
 */
function getBaseKeyMaterial(): string {
    const envKey = process.env.OPENBOT_ENCRYPTION_KEY?.trim();
    if (envKey && envKey.length > 0) {
        return envKey;
    }
    return getMachineKeyMaterial();
}

/**
 * Derive an encryption key using PBKDF2.
 */
function deriveKey(salt: Buffer, keyMaterial: string): Buffer {
    return crypto.pbkdf2Sync(keyMaterial, salt, 100000, KEY_LENGTH, "sha256");
}

export type EncryptedFileOptions = {
    /**
     * Optional encryption key override. If not provided, uses
     * OPENBOT_ENCRYPTION_KEY env var or machine-derived key.
     */
    encryptionKey?: string;
};

/**
 * Encrypt data and write to file.
 */
export function saveEncryptedFile(
    pathname: string,
    data: unknown,
    options?: EncryptedFileOptions,
): void {
    const keyMaterial = options?.encryptionKey ?? getBaseKeyMaterial();

    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key
    const key = deriveKey(salt, keyMaterial);

    // Encrypt
    const plaintext = JSON.stringify(data, null, 2);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Assemble file: VERSION | SALT | IV | AUTH_TAG | CIPHERTEXT
    const fileData = Buffer.concat([
        Buffer.from([ENCRYPTION_VERSION]),
        salt,
        iv,
        authTag,
        ciphertext,
    ]);

    // Write with secure permissions
    const dir = path.dirname(pathname);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(pathname, fileData);
    fs.chmodSync(pathname, 0o600);
}

/**
 * Read and decrypt file.
 * Returns undefined if file doesn't exist or decryption fails.
 */
export function loadEncryptedFile(pathname: string, options?: EncryptedFileOptions): unknown {
    try {
        if (!fs.existsSync(pathname)) return undefined;

        const fileData = fs.readFileSync(pathname);
        const headerLength = 1 + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;

        if (fileData.length < headerLength) {
            // File too short to be valid encrypted file
            return undefined;
        }

        const version = fileData[0];
        if (version !== ENCRYPTION_VERSION) {
            // Unsupported version or not an encrypted file
            return undefined;
        }

        let offset = 1;
        const salt = fileData.subarray(offset, offset + SALT_LENGTH);
        offset += SALT_LENGTH;

        const iv = fileData.subarray(offset, offset + IV_LENGTH);
        offset += IV_LENGTH;

        const authTag = fileData.subarray(offset, offset + AUTH_TAG_LENGTH);
        offset += AUTH_TAG_LENGTH;

        const ciphertext = fileData.subarray(offset);

        // Derive key
        const keyMaterial = options?.encryptionKey ?? getBaseKeyMaterial();
        const key = deriveKey(salt, keyMaterial);

        // Decrypt
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);

        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
            "utf8",
        );

        return JSON.parse(plaintext) as unknown;
    } catch {
        // Decryption failed (wrong key, corrupted file, etc.)
        return undefined;
    }
}

/**
 * Check if a file is encrypted (starts with our version byte).
 */
export function isEncryptedFile(pathname: string): boolean {
    try {
        if (!fs.existsSync(pathname)) return false;

        const fd = fs.openSync(pathname, "r");
        const buf = Buffer.alloc(1);
        fs.readSync(fd, buf, 0, 1, 0);
        fs.closeSync(fd);

        return buf[0] === ENCRYPTION_VERSION;
    } catch {
        return false;
    }
}

/**
 * Migrate a plaintext JSON file to encrypted format.
 * Returns true if migration was performed, false otherwise.
 */
export function migrateToEncrypted(pathname: string, options?: EncryptedFileOptions): boolean {
    try {
        if (!fs.existsSync(pathname)) return false;
        if (isEncryptedFile(pathname)) return false; // Already encrypted

        // Read as JSON
        const raw = fs.readFileSync(pathname, "utf8");
        const data = JSON.parse(raw) as unknown;

        // Write as encrypted
        saveEncryptedFile(pathname, data, options);

        return true;
    } catch {
        return false;
    }
}
