import { saveEncryptedFile, ReceiptBuilder, ReceiptChain } from "../src/index.js";

const builder = new ReceiptBuilder({
    provider: "openai",
    model: "test-model",
    botId: "test-bot"
});

const chain = new ReceiptChain();

// Create 3 valid receipts
for (let i = 0; i < 3; i++) {
    const receipt = builder.build({
        prompt: `prompt ${i}`,
        response: `response ${i}`,
        latencyMs: 10 + i
    });
    chain.append(receipt);
}

console.log("Generated chain with length:", chain.getLength());
console.log("Last Hash:", chain.getLastHash());

// Save to file
saveEncryptedFile("./dummy.enc", chain.getChain(), { encryptionKey: "secret" });
console.log("Saved to ./dummy.enc");
