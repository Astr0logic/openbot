import { OpenAIAdapter } from "./OpenAIAdapter.js";
import { Notary } from "../notary/Notary.js";
import type { StorageAdapter } from "../storage/StorageAdapter.js";

export interface SecureAIConfig {
    provider: "openai";
    apiKey: string;
    model?: string;
    botId?: string;
    botVersion?: string;
    receiptSink?: string;
    storage?: StorageAdapter;
    captureRawContent?: boolean;
}

export class SecureAI {
    private adapter: OpenAIAdapter;
    private notary: Notary;

    constructor(private config: SecureAIConfig) {
        this.adapter = new OpenAIAdapter(config.apiKey, config.model);

        this.notary = new Notary({
            storage: config.storage,
            receiptSink: config.receiptSink,
            provider: config.provider,
            model: config.model,
            botId: config.botId,
            botVersion: config.botVersion,
        });
    }

    async run(prompt: string): Promise<string> {
        const start = Date.now();

        const response = await this.adapter.run(prompt);

        this.notary.notarize({
            prompt,
            response,
            latencyMs: Date.now() - start
        });

        return response;
    }

    /**
     * Submit a raw observation to the receipt log.
     * Used by Gateway or other external observers.
     */
    submit(data: {
        prompt: string;
        response: string;
        latencyMs: number;
        model?: string;
        provider?: string;
    }): void {
        this.notary.notarize(data);
    }

    /**
     * Get the last receipt hash for chaining verification.
     */
    getLastReceiptHash(): string | null {
        return this.notary.getLastReceiptHash();
    }

    /**
     * Get count of pending receipts in the emit queue.
     */
    getPendingReceiptCount(): number {
        return this.notary.getPendingReceiptCount();
    }
}
