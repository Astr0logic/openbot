import type { Receipt } from "../receipt/Receipt.js";
import type { StorageAdapter } from "./StorageAdapter.js";
import { loadEncryptedFile, saveEncryptedFile } from "../util/EncryptedFile.js";

type ReceiptLog = Receipt[];

export class EncryptedFileStorage implements StorageAdapter {
    constructor(
        private path: string,
        private encryptionKey?: string
    ) { }

    async append(receipt: Receipt): Promise<void> {
        // TODO: This read-modify-write cycle is not atomic and not performant for high throughput.
        // It is acceptable for single-instance sidecars or low-volume local use.
        // Future improvement: Append-only log format.

        let log: ReceiptLog = [];
        const existing = loadEncryptedFile(this.path, { encryptionKey: this.encryptionKey });

        if (Array.isArray(existing)) {
            log = existing as ReceiptLog;
        }

        log.push(receipt);

        saveEncryptedFile(this.path, log, { encryptionKey: this.encryptionKey });
        return Promise.resolve();
    }
}
