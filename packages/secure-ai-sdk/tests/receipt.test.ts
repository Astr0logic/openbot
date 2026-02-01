import { describe, expect, it } from "vitest";
import { ReceiptBuilder } from "../src/receipt/ReceiptBuilder.js";
import { ReceiptChain } from "../src/receipt/ReceiptChain.js";

describe("ReceiptBuilder", () => {
    it("builds a receipt with all required fields", () => {
        const builder = new ReceiptBuilder({
            provider: "openai",
            model: "gpt-4o-mini",
            botId: "test-bot",
            botVersion: "1.0.0",
        });

        const receipt = builder.build({
            prompt: "Hello world",
            response: "Hi there",
            latencyMs: 150,
        });

        expect(receipt.receipt_id).toBeDefined();
        expect(receipt.timestamp_utc).toBeDefined();
        expect(receipt.provider).toBe("openai");
        expect(receipt.model).toBe("gpt-4o-mini");
        expect(receipt.request_hash).toHaveLength(64);
        expect(receipt.response_hash).toHaveLength(64);
        expect(receipt.latency_ms).toBe(150);
        expect(receipt.bot_id).toBe("test-bot");
        expect(receipt.bot_version).toBe("1.0.0");
    });

    it("chains receipts with previous_receipt_hash", () => {
        const builder = new ReceiptBuilder({ provider: "openai" });

        const r1 = builder.build({ prompt: "a", response: "b", latencyMs: 10 });
        const r2 = builder.build({ prompt: "c", response: "d", latencyMs: 20 });

        expect(r1.previous_receipt_hash).toBeUndefined();
        expect(r2.previous_receipt_hash).toBeDefined();
        expect(r2.previous_receipt_hash).toHaveLength(64);
    });

    it("produces different hashes for different content", () => {
        const builder = new ReceiptBuilder({ provider: "openai" });

        const r1 = builder.build({ prompt: "hello", response: "world", latencyMs: 10 });
        const r2 = builder.build({ prompt: "foo", response: "bar", latencyMs: 10 });

        expect(r1.request_hash).not.toBe(r2.request_hash);
        expect(r1.response_hash).not.toBe(r2.response_hash);
    });
});

describe("ReceiptChain", () => {
    it("appends receipts and maintains integrity", () => {
        const builder = new ReceiptBuilder({ provider: "openai" });
        const chain = new ReceiptChain();

        const r1 = builder.build({ prompt: "a", response: "b", latencyMs: 10 });
        chain.append(r1);

        const r2 = builder.build({ prompt: "c", response: "d", latencyMs: 20 });
        chain.append(r2);

        expect(chain.getLength()).toBe(2);
        expect(chain.verify()).toBe(true);
    });

    it("detects integrity violations", () => {
        const builder = new ReceiptBuilder({ provider: "openai" });
        const chain = new ReceiptChain();

        const r1 = builder.build({ prompt: "a", response: "b", latencyMs: 10 });
        chain.append(r1);

        // Create a receipt with wrong previous hash
        const badReceipt = {
            ...builder.build({ prompt: "c", response: "d", latencyMs: 20 }),
            previous_receipt_hash: "wrong-hash",
        };

        expect(() => chain.append(badReceipt)).toThrow("integrity violation");
    });
});
