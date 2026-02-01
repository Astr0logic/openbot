import type { Receipt } from "../receipt/Receipt.js";

export interface StorageAdapter {
    append(receipt: Receipt): Promise<void>;
}
