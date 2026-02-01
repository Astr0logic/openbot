import { ReceiptBuilder } from "../receipt/ReceiptBuilder.js";
import { AsyncEmitter } from "../emitter/AsyncEmitter.js";
import { FileStorage } from "../storage/FileStorage.js";
import type { StorageAdapter } from "../storage/StorageAdapter.js";
import type { Receipt } from "../receipt/Receipt.js";

export interface NotaryConfig {
    /**
     * Storage adapter for receipts.
     * Defaults to FileStorage("./receipts.log")
     */
    storage?: StorageAdapter;

    // Metadata for receipts
    provider?: string;
    model?: string;
    botId?: string;
    botVersion?: string;
    receiptSink?: string;
}

export class Notary {
    private emitter: AsyncEmitter;
    private receiptBuilder: ReceiptBuilder;

    constructor(private config: NotaryConfig) {
        const storage = config.storage ?? new FileStorage(config.receiptSink || "./receipts.log");
        this.emitter = new AsyncEmitter(storage);

        this.receiptBuilder = new ReceiptBuilder({
            provider: config.provider,
            model: config.model,
            botId: config.botId,
            botVersion: config.botVersion,
        });
    }

    /**
     * Submit an interaction for notarization.
     */
    notarize(data: {
        prompt: string;
        response: string;
        latencyMs: number;
        model?: string;
        provider?: string;
    }): void {
        const receipt = this.receiptBuilder.build({
            ...data,
            model: data.model ?? this.receiptBuilder.defaultModel,
        });

        // Fire-and-forget
        this.emitter.emit(receipt).catch(() => { });
    }

    /**
     * Get the last receipt hash for chaining verification.
     */
    getLastReceiptHash(): string | null {
        return this.receiptBuilder.getLastHash();
    }

    /**
     * Get count of pending receipts in the emit queue.
     */
    getPendingReceiptCount(): number {
        return this.emitter.getPendingCount();
    }
}
