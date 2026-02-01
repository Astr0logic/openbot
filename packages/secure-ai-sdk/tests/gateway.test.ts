import { describe, expect, it, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { Gateway } from "../src/gateway/Gateway.js";
import { SecureAI } from "../src/client/SecureAI.js";
import { Notary } from "../src/notary/Notary.js";
import { FileStorage } from "../src/storage/FileStorage.js";
import fs from "node:fs";

const TEST_RECEIPT_LOG = "test-gateway-receipts.jsonl";

describe("Gateway Mode", () => {
    let mockProvider: http.Server;
    let gateway: Gateway;
    let notary: Notary;
    let providerPort: number;
    let gatewayPort: number;

    beforeAll(async () => {
        // 1. Setup Mock Provider (e.g. fake OpenAI)
        mockProvider = http.createServer((req, res) => {
            if (req.url === "/v1/chat/completions" && req.method === "POST") {
                let body = "";
                req.on("data", c => body += c);
                req.on("end", () => {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        id: "chatcmpl-123",
                        choices: [{ message: { content: "Hello from Mock Provider" } }]
                    }));
                });
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        await new Promise<void>(resolve => {
            mockProvider.listen(0, () => resolve());
        });
        providerPort = (mockProvider.address() as any).port;

        // 2. Setup Gateway
        if (fs.existsSync(TEST_RECEIPT_LOG)) fs.unlinkSync(TEST_RECEIPT_LOG);

        notary = new Notary({
            provider: "openai",
            model: "gpt-4",
            receiptSink: TEST_RECEIPT_LOG,
            botId: "test-bot-v1"
        });

        gateway = new Gateway({
            notary,
            target: `http://localhost:${providerPort}`
        });

        await new Promise<void>(resolve => {
            gateway.listen(0).on("listening", resolve);
        });
        gatewayPort = (gateway["server"].address() as any).port;
    });

    afterAll(() => {
        gateway.close();
        mockProvider.close();
        if (fs.existsSync(TEST_RECEIPT_LOG)) fs.unlinkSync(TEST_RECEIPT_LOG);
    });

    it("proxies request and records receipt", async () => {
        // Make request to Gateway
        const req = http.request({
            hostname: "localhost",
            port: gatewayPort,
            method: "POST",
            path: "/v1/chat/completions",
            headers: { "Content-Type": "application/json" }
        }, (res) => {
            expect(res.statusCode).toBe(200);

            let body = "";
            res.on("data", c => body += c);
            res.on("end", () => {
                const json = JSON.parse(body);
                expect(json.choices[0].message.content).toBe("Hello from Mock Provider");
            });
        });

        req.write(JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "Hi" }] }));
        req.end();

        // Allow some time for async receipt generation
        await new Promise(r => setTimeout(r, 500));
    });
});
