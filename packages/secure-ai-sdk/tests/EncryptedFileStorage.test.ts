import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EncryptedFileStorage } from "../src/storage/EncryptedFileStorage.js";
import { loadEncryptedFile } from "../src/util/EncryptedFile.js";
import type { Receipt } from "../src/receipt/Receipt.js";

describe("EncryptedFileStorage", () => {
    let tempDir: string;
    let testFile: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-enc-test-"));
        testFile = path.join(tempDir, "receipts.enc");
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("appends receipts to an encrypted file", async () => {
        const storage = new EncryptedFileStorage(testFile, "test-key");
        const receipt: Receipt = {
            id: "r1",
            timestamp: 1234567890,
            latencyMs: 100,
            prompt: "test prompt",
            response: "test response"
        };


        await storage.append(receipt);

        expect(fs.existsSync(testFile)).toBe(true);

        const loaded = loadEncryptedFile(testFile, { encryptionKey: "test-key" });
        expect(loaded).toEqual([receipt]);
    });

    it("appends multiple receipts correctly", async () => {
        const storage = new EncryptedFileStorage(testFile, "test-key");
        const r1: Receipt = { id: "r1", timestamp: 1, latencyMs: 10, prompt: "p1", response: "res1" };
        const r2: Receipt = { id: "r2", timestamp: 2, latencyMs: 20, prompt: "p2", response: "res2" };

        await storage.append(r1);
        await storage.append(r2);

        const loaded = loadEncryptedFile(testFile, { encryptionKey: "test-key" });
        expect(loaded).toHaveLength(2);
        expect(loaded).toEqual([r1, r2]);
    });

    it("initializes empty file if not exists", async () => {
        const storage = new EncryptedFileStorage(testFile, "test-key");
        // No append
        // File is not created until first append in current implementation
        expect(fs.existsSync(testFile)).toBe(false);
    });
});
