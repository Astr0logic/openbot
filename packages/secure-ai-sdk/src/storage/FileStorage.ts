import { appendFile } from "node:fs/promises";
import type { Receipt } from "../receipt/Receipt.js";
import type { StorageAdapter } from "./StorageAdapter.js";

export class FileStorage implements StorageAdapter {
    constructor(private path: string) { }

    async append(receipt: Receipt): Promise<void> {
        await appendFile(this.path, JSON.stringify(receipt) + "\n", "utf-8");
    }
}
