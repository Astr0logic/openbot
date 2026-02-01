import type { Receipt } from "../receipt/Receipt.js";

/**
 * Simple in-memory async queue for receipts.
 */
export class Queue {
    private items: Receipt[] = [];

    enqueue(receipt: Receipt): void {
        this.items.push(receipt);
    }

    dequeue(): Receipt | undefined {
        return this.items.shift();
    }

    peek(): Receipt | undefined {
        return this.items[0];
    }

    get length(): number {
        return this.items.length;
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }

    clear(): void {
        this.items = [];
    }
}
