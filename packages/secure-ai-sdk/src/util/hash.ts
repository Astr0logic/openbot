import { createHash } from "node:crypto";

/**
 * Create SHA-256 hash of input string.
 */
export function sha256(data: string): string {
    return createHash("sha256").update(data).digest("hex");
}

/**
 * Create SHA-256 hash of object (JSON serialized).
 */
export function sha256Object(data: unknown): string {
    return sha256(JSON.stringify(data));
}
