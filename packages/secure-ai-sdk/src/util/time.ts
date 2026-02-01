/**
 * Get current UTC timestamp in ISO format.
 */
export function utcNow(): string {
    return new Date().toISOString();
}

/**
 * Get high-precision timestamp in milliseconds.
 */
export function nowMs(): number {
    return Date.now();
}

/**
 * Calculate elapsed time in milliseconds.
 */
export function elapsed(startMs: number): number {
    return Date.now() - startMs;
}
