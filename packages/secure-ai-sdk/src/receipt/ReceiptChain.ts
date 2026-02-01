import { createHash } from "node:crypto";
import type { Receipt } from "./Receipt.js";

/**
 * Append-only receipt chain for integrity verification.
 */
export class ReceiptChain {
    private chain: Receipt[] = [];
    private lastHash: string | null = null;

    append(receipt: Receipt): void {
        if (this.lastHash && receipt.previous_receipt_hash !== this.lastHash) {
            throw new Error("Receipt chain integrity violation: previous_receipt_hash mismatch");
        }
        this.chain.push(receipt);
        this.lastHash = hash(JSON.stringify(receipt));
    }

    verify(): boolean {
        let expectedPrevHash: string | null = null;

        for (const receipt of this.chain) {
            if (receipt.previous_receipt_hash !== (expectedPrevHash || undefined)) {
                return false;
            }
            expectedPrevHash = hash(JSON.stringify(receipt));
        }

        return true;
    }

    getChain(): readonly Receipt[] {
        return this.chain;
    }

    getLength(): number {
        return this.chain.length;
    }

    getLastHash(): string | null {
        return this.lastHash;
    }
}

function hash(data: string): string {
    return createHash("sha256").update(data).digest("hex");
}
