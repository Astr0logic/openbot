import { describe, expect, it } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  encryptConfigSecrets,
  decryptConfigSecrets,
  isEncryptedSecret,
} from "./config-secrets.js";

describe("config-secrets", () => {
  describe("encryptSecret / decryptSecret", () => {
    it("encrypts and decrypts a secret value", () => {
      const original = "my-api-key-12345";
      const encrypted = encryptSecret(original);

      expect(encrypted).toMatch(/^enc:/);
      expect(encrypted).not.toBe(original);

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(original);
    });

    it("returns empty values unchanged", () => {
      expect(encryptSecret("")).toBe("");
      expect(decryptSecret("")).toBe("");
    });

    it("does not double-encrypt already encrypted values", () => {
      const original = "secret-password";
      const encrypted = encryptSecret(original);
      const doubleEncrypted = encryptSecret(encrypted);

      expect(doubleEncrypted).toBe(encrypted);
    });

    it("returns non-encrypted values unchanged from decryptSecret", () => {
      const plaintext = "plain-value";
      expect(decryptSecret(plaintext)).toBe(plaintext);
    });

    it("produces different ciphertexts for the same input (random IV)", () => {
      const original = "same-secret";
      const enc1 = encryptSecret(original);
      const enc2 = encryptSecret(original);

      expect(enc1).not.toBe(enc2);
      expect(decryptSecret(enc1)).toBe(original);
      expect(decryptSecret(enc2)).toBe(original);
    });
  });

  describe("isEncryptedSecret", () => {
    it("returns true for encrypted values", () => {
      const encrypted = encryptSecret("test");
      expect(isEncryptedSecret(encrypted)).toBe(true);
    });

    it("returns false for non-encrypted values", () => {
      expect(isEncryptedSecret("plain")).toBe(false);
      expect(isEncryptedSecret(null)).toBe(false);
      expect(isEncryptedSecret(123)).toBe(false);
    });
  });

  describe("encryptConfigSecrets / decryptConfigSecrets", () => {
    it("encrypts apiKey fields recursively", () => {
      const config = {
        models: {
          openai: { apiKey: "sk-12345" },
          anthropic: { apiKey: "sk-ant-67890" },
        },
        tts: {
          elevenlabs: { apiKey: "xi-api-key", voice: "alloy" },
        },
        other: { nonSecret: "value" },
      };

      const encrypted = encryptConfigSecrets(config);

      expect(encrypted.models.openai.apiKey).toMatch(/^enc:/);
      expect(encrypted.models.anthropic.apiKey).toMatch(/^enc:/);
      expect(encrypted.tts.elevenlabs.apiKey).toMatch(/^enc:/);
      expect(encrypted.tts.elevenlabs.voice).toBe("alloy");
      expect(encrypted.other.nonSecret).toBe("value");
    });

    it("decrypts apiKey fields recursively", () => {
      const config = {
        models: {
          openai: { apiKey: "sk-12345" },
        },
        nested: {
          deep: { token: "my-token" },
        },
      };

      const encrypted = encryptConfigSecrets(config);
      const decrypted = decryptConfigSecrets(encrypted);

      expect(decrypted.models.openai.apiKey).toBe("sk-12345");
      expect(decrypted.nested.deep.token).toBe("my-token");
    });

    it("handles arrays", () => {
      const config = {
        providers: [
          { name: "openai", apiKey: "key1" },
          { name: "anthropic", apiKey: "key2" },
        ],
      };

      const encrypted = encryptConfigSecrets(config);
      expect(encrypted.providers[0].apiKey).toMatch(/^enc:/);
      expect(encrypted.providers[1].apiKey).toMatch(/^enc:/);

      const decrypted = decryptConfigSecrets(encrypted);
      expect(decrypted.providers[0].apiKey).toBe("key1");
      expect(decrypted.providers[1].apiKey).toBe("key2");
    });

    it("handles null and primitive values", () => {
      expect(encryptConfigSecrets(null)).toBe(null);
      expect(encryptConfigSecrets("string")).toBe("string");
      expect(encryptConfigSecrets(123)).toBe(123);
    });
  });
});
