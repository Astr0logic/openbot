/**
 * Exponential Backoff - Calculates retry delays with jitter.
 *
 * Math:
 *   delay = min(maxDelay, baseDelay * 2^attempt) * (1 + random * jitter)
 *
 * Example with base=1000, max=30000, jitter=0.1:
 *   Attempt 0: 1000ms  ± 100ms
 *   Attempt 1: 2000ms  ± 200ms
 *   Attempt 2: 4000ms  ± 400ms
 *   Attempt 3: 8000ms  ± 800ms
 *   Attempt 4: 16000ms ± 1600ms
 *   Attempt 5: 30000ms ± 3000ms (capped)
 */

export type BackoffOptions = {
  /** Base delay in ms */
  baseDelayMs?: number;
  /** Maximum delay in ms */
  maxDelayMs?: number;
  /** Jitter factor (0-1) */
  jitter?: number;
  /** Maximum attempts before giving up */
  maxAttempts?: number;
};

const DEFAULT_BASE_DELAY = 1000;
const DEFAULT_MAX_DELAY = 30_000;
const DEFAULT_JITTER = 0.1;
const DEFAULT_MAX_ATTEMPTS = 5;

export class ExponentialBackoff {
  private baseDelayMs: number;
  private maxDelayMs: number;
  private jitter: number;
  private maxAttempts: number;
  private attempt = 0;

  constructor(options: BackoffOptions = {}) {
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY;
    this.jitter = options.jitter ?? DEFAULT_JITTER;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  /**
   * Get the next delay and increment attempt counter.
   * Returns null if max attempts exceeded.
   */
  next(): number | null {
    if (this.attempt >= this.maxAttempts) {
      return null;
    }

    const delay = this.calculateDelay(this.attempt);
    this.attempt++;
    return delay;
  }

  /**
   * Calculate delay for a given attempt (0-indexed).
   */
  calculateDelay(attempt: number): number {
    // Exponential: base * 2^attempt
    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt);

    // Cap at max
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);

    // Add jitter: ± jitter%
    const jitterRange = cappedDelay * this.jitter;
    const jitterOffset = (Math.random() * 2 - 1) * jitterRange;

    return Math.round(cappedDelay + jitterOffset);
  }

  /**
   * Get current attempt number.
   */
  getAttempt(): number {
    return this.attempt;
  }

  /**
   * Check if more attempts are available.
   */
  hasMore(): boolean {
    return this.attempt < this.maxAttempts;
  }

  /**
   * Reset the backoff counter.
   */
  reset(): void {
    this.attempt = 0;
  }

  /**
   * Sleep for the next delay period.
   * Returns false if max attempts exceeded.
   */
  async sleep(): Promise<boolean> {
    const delay = this.next();
    if (delay === null) return false;

    await new Promise((resolve) => setTimeout(resolve, delay));
    return true;
  }
}

/**
 * Execute a function with exponential backoff retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: BackoffOptions & {
    /** Called on each retry */
    onRetry?: (attempt: number, delay: number, error: unknown) => void;
    /** Should retry for this error? */
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const backoff = new ExponentialBackoff(options);
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error)) {
        throw error;
      }

      const delay = backoff.next();
      if (delay === null) {
        throw error; // Max attempts exceeded
      }

      options.onRetry?.(backoff.getAttempt(), delay, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Calculate total time for N retries with given options.
 * Useful for timeout calculations.
 */
export function calculateTotalBackoffTime(
  attempts: number,
  options: BackoffOptions = {},
): { min: number; max: number; expected: number } {
  const backoff = new ExponentialBackoff({ ...options, jitter: 0 });

  let total = 0;
  for (let i = 0; i < attempts; i++) {
    total += backoff.calculateDelay(i);
  }

  const jitter = options.jitter ?? DEFAULT_JITTER;
  return {
    min: Math.round(total * (1 - jitter)),
    max: Math.round(total * (1 + jitter)),
    expected: total,
  };
}
