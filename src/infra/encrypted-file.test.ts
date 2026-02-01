import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isEncryptedFile,
  loadEncryptedFile,
  migrateToEncrypted,
  saveEncryptedFile,
} from "./encrypted-file.js";

describe("encrypted-file", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openbot-enc-test-"));
    testFile = path.join(tempDir, "test-creds.enc");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  describe("saveEncryptedFile and loadEncryptedFile", () => {
    it("encrypts and decrypts data correctly", () => {
      const data = {
        accessToken: "sk-test-12345",
        refreshToken: "refresh-67890",
        expiresAt: Date.now() + 3600000,
      };

      saveEncryptedFile(testFile, data, { encryptionKey: "test-key" });

      expect(fs.existsSync(testFile)).toBe(true);

      const loaded = loadEncryptedFile(testFile, { encryptionKey: "test-key" });
      expect(loaded).toEqual(data);
    });

    it("returns undefined for wrong encryption key", () => {
      const data = { secret: "value" };

      saveEncryptedFile(testFile, data, { encryptionKey: "correct-key" });

      const loaded = loadEncryptedFile(testFile, { encryptionKey: "wrong-key" });
      expect(loaded).toBeUndefined();
    });

    it("returns undefined for non-existent file", () => {
      const loaded = loadEncryptedFile("/nonexistent/path.enc");
      expect(loaded).toBeUndefined();
    });

    it("returns undefined for corrupted file", () => {
      fs.writeFileSync(testFile, "not encrypted data");
      const loaded = loadEncryptedFile(testFile, { encryptionKey: "key" });
      expect(loaded).toBeUndefined();
    });

    it("creates parent directories if needed", () => {
      const nestedFile = path.join(tempDir, "nested", "dir", "creds.enc");

      saveEncryptedFile(nestedFile, { test: true }, { encryptionKey: "key" });

      expect(fs.existsSync(nestedFile)).toBe(true);
    });

    it("sets restrictive file permissions", () => {
      saveEncryptedFile(testFile, { test: true }, { encryptionKey: "key" });

      const stats = fs.statSync(testFile);
      // 0o600 = owner read/write only
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it("uses OPENBOT_ENCRYPTION_KEY env var when no key provided", () => {
      vi.stubEnv("OPENBOT_ENCRYPTION_KEY", "env-secret-key");

      const data = { envTest: true };
      saveEncryptedFile(testFile, data);

      // Should decrypt with same env var
      const loaded = loadEncryptedFile(testFile);
      expect(loaded).toEqual(data);
    });

    it("handles complex nested data structures", () => {
      const data = {
        oauth: {
          accessToken: "token",
          nested: {
            deep: {
              value: [1, 2, 3],
            },
          },
        },
        expires: 12345678,
        enabled: true,
      };

      saveEncryptedFile(testFile, data, { encryptionKey: "key" });
      const loaded = loadEncryptedFile(testFile, { encryptionKey: "key" });

      expect(loaded).toEqual(data);
    });

    it("produces different ciphertext for same data (random IV)", () => {
      const data = { same: "data" };

      const file1 = path.join(tempDir, "file1.enc");
      const file2 = path.join(tempDir, "file2.enc");

      saveEncryptedFile(file1, data, { encryptionKey: "key" });
      saveEncryptedFile(file2, data, { encryptionKey: "key" });

      const content1 = fs.readFileSync(file1);
      const content2 = fs.readFileSync(file2);

      // Files should be different due to random salt and IV
      expect(content1.equals(content2)).toBe(false);

      // But both should decrypt to same data
      const loaded1 = loadEncryptedFile(file1, { encryptionKey: "key" });
      const loaded2 = loadEncryptedFile(file2, { encryptionKey: "key" });
      expect(loaded1).toEqual(data);
      expect(loaded2).toEqual(data);
    });
  });

  describe("isEncryptedFile", () => {
    it("returns true for encrypted files", () => {
      saveEncryptedFile(testFile, { test: true }, { encryptionKey: "key" });

      expect(isEncryptedFile(testFile)).toBe(true);
    });

    it("returns false for plaintext JSON files", () => {
      fs.writeFileSync(testFile, JSON.stringify({ test: true }));

      expect(isEncryptedFile(testFile)).toBe(false);
    });

    it("returns false for non-existent files", () => {
      expect(isEncryptedFile("/nonexistent/file")).toBe(false);
    });

    it("returns false for empty files", () => {
      fs.writeFileSync(testFile, "");

      expect(isEncryptedFile(testFile)).toBe(false);
    });
  });

  describe("migrateToEncrypted", () => {
    it("migrates plaintext JSON to encrypted format", () => {
      const data = { migrated: true, token: "secret-123" };
      fs.writeFileSync(testFile, JSON.stringify(data, null, 2));

      const result = migrateToEncrypted(testFile, { encryptionKey: "key" });

      expect(result).toBe(true);
      expect(isEncryptedFile(testFile)).toBe(true);

      const loaded = loadEncryptedFile(testFile, { encryptionKey: "key" });
      expect(loaded).toEqual(data);
    });

    it("returns false for already encrypted files", () => {
      saveEncryptedFile(testFile, { test: true }, { encryptionKey: "key" });

      const result = migrateToEncrypted(testFile, { encryptionKey: "key" });

      expect(result).toBe(false);
    });

    it("returns false for non-existent files", () => {
      const result = migrateToEncrypted("/nonexistent/file");

      expect(result).toBe(false);
    });

    it("returns false for invalid JSON files", () => {
      fs.writeFileSync(testFile, "not valid json {{{");

      const result = migrateToEncrypted(testFile, { encryptionKey: "key" });

      expect(result).toBe(false);
    });
  });
});
