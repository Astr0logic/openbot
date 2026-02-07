/**
 * Circuit Breaker - Prevents cascading failures by tracking worker health.
 *
 * States:
 *   CLOSED  - Normal operation, requests flow through
 *   OPEN    - Failures exceeded threshold, requests blocked
 *   HALF_OPEN - Testing if service recovered
 *
 * Math:
 *   - Failure rate = failures / (successes + failures) over sliding window
 *   - Opens when failure rate > threshold (default 50%)
 *   - Half-opens after cooldown period
 *   - Closes after N successful probes
 */

export type CircuitState = "closed" | "open" | "half_open";

export type CircuitBreakerOptions = {
  /** Failure rate threshold to open circuit (0-1) */
  failureThreshold?: number;
  /** Minimum requests before evaluating failure rate */
  minimumRequests?: number;
  /** Time window for tracking failures (ms) */
  windowMs?: number;
  /** Cooldown before half-open (ms) */
  cooldownMs?: number;
  /** Successful probes needed to close */
  successThreshold?: number;
  /** Log function */
  log?: (msg: string) => void;
};

type RequestRecord = {
  timestamp: number;
  success: boolean;
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private records: RequestRecord[] = [];
  private lastFailure = 0;
  private halfOpenSuccesses = 0;

  private failureThreshold: number;
  private minimumRequests: number;
  private windowMs: number;
  private cooldownMs: number;
  private successThreshold: number;
  private log: (msg: string) => void;

  constructor(
    private readonly id: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 0.5;
    this.minimumRequests = options.minimumRequests ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.successThreshold = options.successThreshold ?? 3;
    this.log = options.log ?? (() => {});
  }

  /**
   * Check if request is allowed.
   */
  canExecute(): boolean {
    this.pruneOldRecords();

    switch (this.state) {
      case "closed":
        return true;

      case "open":
        // Check if cooldown has passed
        if (Date.now() - this.lastFailure >= this.cooldownMs) {
          this.transitionTo("half_open");
          return true;
        }
        return false;

      case "half_open":
        // Allow limited requests to probe
        return true;
    }
  }

  /**
   * Record a successful request.
   */
  recordSuccess(): void {
    this.records.push({ timestamp: Date.now(), success: true });

    if (this.state === "half_open") {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.successThreshold) {
        this.transitionTo("closed");
      }
    }
  }

  /**
   * Record a failed request.
   */
  recordFailure(): void {
    this.records.push({ timestamp: Date.now(), success: false });
    this.lastFailure = Date.now();

    if (this.state === "half_open") {
      // Immediate open on failure during probe
      this.transitionTo("open");
      return;
    }

    if (this.state === "closed") {
      this.evaluateState();
    }
  }

  /**
   * Get current state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure rate in current window.
   */
  getFailureRate(): number {
    this.pruneOldRecords();
    if (this.records.length === 0) return 0;

    const failures = this.records.filter((r) => !r.success).length;
    return failures / this.records.length;
  }

  /**
   * Get stats.
   */
  getStats(): {
    state: CircuitState;
    failureRate: number;
    totalRequests: number;
    failures: number;
    successes: number;
  } {
    this.pruneOldRecords();
    const failures = this.records.filter((r) => !r.success).length;
    const successes = this.records.filter((r) => r.success).length;

    return {
      state: this.state,
      failureRate: this.getFailureRate(),
      totalRequests: this.records.length,
      failures,
      successes,
    };
  }

  /**
   * Force reset to closed state.
   */
  reset(): void {
    this.records = [];
    this.halfOpenSuccesses = 0;
    this.transitionTo("closed");
  }

  /**
   * Evaluate if state should change.
   */
  private evaluateState(): void {
    if (this.records.length < this.minimumRequests) return;

    const failureRate = this.getFailureRate();
    if (failureRate >= this.failureThreshold) {
      this.transitionTo("open");
    }
  }

  /**
   * Transition to a new state.
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    if (newState === "half_open") {
      this.halfOpenSuccesses = 0;
    }

    if (newState === "closed") {
      this.records = [];
    }

    this.log(`[circuit:${this.id}] ${oldState} → ${newState}`);
  }

  /**
   * Remove records outside the time window.
   */
  private pruneOldRecords(): void {
    const cutoff = Date.now() - this.windowMs;
    this.records = this.records.filter((r) => r.timestamp >= cutoff);
  }
}

/**
 * Circuit Breaker Registry - Manages breakers for multiple workers.
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = options;
  }

  /**
   * Get or create a breaker for a worker.
   */
  get(workerId: string): CircuitBreaker {
    let breaker = this.breakers.get(workerId);
    if (!breaker) {
      breaker = new CircuitBreaker(workerId, this.options);
      this.breakers.set(workerId, breaker);
    }
    return breaker;
  }

  /**
   * Check if a worker is available (circuit not open).
   */
  isAvailable(workerId: string): boolean {
    return this.get(workerId).canExecute();
  }

  /**
   * Record success for a worker.
   */
  recordSuccess(workerId: string): void {
    this.get(workerId).recordSuccess();
  }

  /**
   * Record failure for a worker.
   */
  recordFailure(workerId: string): void {
    this.get(workerId).recordFailure();
  }

  /**
   * Get all breaker stats.
   */
  getAllStats(): Record<string, ReturnType<CircuitBreaker["getStats"]>> {
    const stats: Record<string, ReturnType<CircuitBreaker["getStats"]>> = {};
    for (const [id, breaker] of this.breakers) {
      stats[id] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Get workers with open circuits.
   */
  getOpenCircuits(): string[] {
    return Array.from(this.breakers.entries())
      .filter(([_, b]) => b.getState() === "open")
      .map(([id]) => id);
  }

  /**
   * Reset a specific breaker.
   */
  reset(workerId: string): void {
    this.get(workerId).reset();
  }

  /**
   * Reset all breakers.
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}
