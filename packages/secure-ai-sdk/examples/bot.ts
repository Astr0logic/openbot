import { SecureAI } from "../src/index.js";

const ai = new SecureAI({
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
    botId: "ops-bot",
    botVersion: "0.1.0",
});

(async () => {
    const result = await ai.run("Summarize why immutable receipts matter.");
    console.log(result);
})();
