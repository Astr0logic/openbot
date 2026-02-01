import OpenAI from "openai";
import type { ProviderAdapter } from "../types/Provider.js";

export class OpenAIAdapter implements ProviderAdapter {
    private client: OpenAI;
    private model: string;

    constructor(apiKey: string, model = "gpt-4o-mini") {
        this.client = new OpenAI({ apiKey });
        this.model = model;
    }

    async run(prompt: string): Promise<string> {
        const result = await this.client.chat.completions.create({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
        });

        return result.choices[0]?.message?.content ?? "";
    }
}
