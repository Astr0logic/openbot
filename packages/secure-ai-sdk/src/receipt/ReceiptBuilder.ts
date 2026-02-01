import { createHash, randomUUID } from "node:crypto";
import type { Receipt } from "./Receipt.js";

export interface ReceiptBuilderConfig {
    provider?: string;
    model?: string;
    botId?: string;
    botVersion?: string;
}

export class ReceiptBuilder {
    private lastHash: string | null = null;
    private _defaultModel?: string;

    constructor(private config: ReceiptBuilderConfig) {
        this._defaultModel = config.model;
    }

    get defaultModel(): string | undefined {
        return this._defaultModel;
    }

    build(input: {
        prompt: string;
        response: string;
        latencyMs: number;
        model?: string;
    }): Receipt {
        const requestHash = hash(input.prompt);
        const responseHash = hash(input.response);

        const receipt: Receipt = {
            receipt_id: randomUUID(),
            timestamp_utc: new Date().toISOString(),
            provider: this.config.provider || "openai",
            model: input.model || this.config.model || "gpt-4o-mini",
            request_hash: requestHash,
            response_hash: responseHash,
            latency_ms: input.latencyMs,
            bot_id: this.config.botId,
            bot_version: this.config.botVersion,
            previous_receipt_hash: this.lastHash || undefined,
        };

        this.lastHash = hash(JSON.stringify(receipt));
        return receipt;
    }

    getLastHash(): string | null {
        return this.lastHash;
    }
}

function hash(data: string): string {
    return createHash("sha256").update(data).digest("hex");
}
