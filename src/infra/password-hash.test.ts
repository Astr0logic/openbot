import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isHashedPassword,
  safeEqualPlaintext,
  verifyPassword,
} from "./password-hash.js";

describe("password-hash", () => {
  describe("hashPassword", () => {
    it("produces a scrypt hash format", async () => {
      const hash = await hashPassword("test-password");
      expect(hash).toMatch(/^\$scrypt\$\d+\$\d+\$\d+\$/);
    });

    it("produces different hashes for same password (random salt)", async () => {
      const hash1 = await hashPassword("same-password");
      const hash2 = await hashPassword("same-password");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("verifies correct password against hash", async () => {
      const password = "my-secure-password";
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it("rejects incorrect password", async () => {
      const hash = await hashPassword("correct-password");
      const result = await verifyPassword("wrong-password", hash);
      expect(result).toBe(false);
    });

    it("handles plaintext passwords for backwards compatibility", async () => {
      const plaintext = "legacy-password";
      const result = await verifyPassword(plaintext, plaintext);
      expect(result).toBe(true);
    });

    it("rejects mismatched plaintext passwords", async () => {
      const result = await verifyPassword("input", "stored");
      expect(result).toBe(false);
    });

    it("returns false for malformed hash", async () => {
      const result = await verifyPassword("test", "$scrypt$invalid");
      expect(result).toBe(false);
    });

    it("returns false for corrupted hash data", async () => {
      const result = await verifyPassword("test", "$scrypt$16384$8$1$!!invalid!!$!!invalid!!");
      expect(result).toBe(false);
    });
  });

  describe("isHashedPassword", () => {
    it("returns true for hashed passwords", async () => {
      const hash = await hashPassword("test");
      expect(isHashedPassword(hash)).toBe(true);
    });

    it("returns false for plaintext", () => {
      expect(isHashedPassword("plaintext-password")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isHashedPassword("")).toBe(false);
    });
  });

  describe("safeEqualPlaintext", () => {
    it("returns true for equal strings", () => {
      expect(safeEqualPlaintext("secret", "secret")).toBe(true);
    });

    it("returns false for different strings", () => {
      expect(safeEqualPlaintext("secret", "other")).toBe(false);
    });

    it("returns false for different length strings", () => {
      expect(safeEqualPlaintext("short", "longer-string")).toBe(false);
    });
  });
});
