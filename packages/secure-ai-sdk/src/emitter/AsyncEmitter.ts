import type { Receipt } from "../receipt/Receipt.js";
import type { StorageAdapter } from "../storage/StorageAdapter.js";

/**
 * Fire-and-forget async emitter.
 * Never blocks the main inference path.
 */
export class AsyncEmitter {
    private queue: Receipt[] = [];
    private flushing = false;

    constructor(private storage: StorageAdapter) { }

    /**
     * Emit a receipt asynchronously.
     * Returns immediately, never throws.
     */
    emit(receipt: Receipt): Promise<void> {
        this.queue.push(receipt);
        this.scheduleFlush();
        return Promise.resolve();
    }

    private scheduleFlush(): void {
        if (this.flushing) return;

        setImmediate(() => {
            this.flush().catch(() => {
                // Fail silently - never block inference
            });
        });
    }

    private async flush(): Promise<void> {
        if (this.flushing) return;
        this.flushing = true;

        try {
            while (this.queue.length > 0) {
                const receipt = this.queue.shift();
                if (receipt) {
                    await this.storage.append(receipt);
                }
            }
        } finally {
            this.flushing = false;
        }
    }

    getPendingCount(): number {
        return this.queue.length;
    }
}
