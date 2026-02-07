/**
 * Health Score - Calculates a composite health score for workers.
 *
 * Score components:
 *   - Load ratio (0-1): currentLoad / maxLoad
 *   - Success rate (0-1): successes / total in window
 *   - Latency score (0-1): 1 - (avgLatency / maxLatency)
 *   - Availability (0-1): uptime / totalTime
 *
 * Final score = weighted average, 0 = unhealthy, 1 = perfect
 *
 * Math:
 *   score = (w1 * loadScore + w2 * successRate + w3 * latencyScore + w4 * availability) / (w1 + w2 + w3 + w4)
 */

export type HealthWeights = {
  load: number;
  success: number;
  latency: number;
  availability: number;
};

export type LatencyRecord = {
  timestamp: number;
  durationMs: number;
};

export type HealthMetrics = {
  currentLoad: number;
  maxLoad: number;
  successes: number;
  failures: number;
  latencies: LatencyRecord[];
  uptimeMs: number;
  totalMs: number;
};

export type HealthScoreOptions = {
  /** Weights for score components */
  weights?: Partial<HealthWeights>;
  /** Max latency before score hits 0 (ms) */
  maxLatencyMs?: number;
  /** Time window for latency samples (ms) */
  latencyWindowMs?: number;
  /** Minimum samples before latency affects score */
  minLatencySamples?: number;
};

const DEFAULT_WEIGHTS: HealthWeights = {
  load: 0.3,
  success: 0.35,
  latency: 0.2,
  availability: 0.15,
};

const DEFAULT_MAX_LATENCY = 10_000;
const DEFAULT_LATENCY_WINDOW = 300_000; // 5 min
const DEFAULT_MIN_SAMPLES = 3;

export class HealthScorer {
  private weights: HealthWeights;
  private maxLatencyMs: number;
  private latencyWindowMs: number;
  private minLatencySamples: number;

  constructor(options: HealthScoreOptions = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    this.maxLatencyMs = options.maxLatencyMs ?? DEFAULT_MAX_LATENCY;
    this.latencyWindowMs = options.latencyWindowMs ?? DEFAULT_LATENCY_WINDOW;
    this.minLatencySamples = options.minLatencySamples ?? DEFAULT_MIN_SAMPLES;
  }

  /**
   * Calculate health score from metrics.
   */
  calculate(metrics: HealthMetrics): number {
    const loadScore = this.calculateLoadScore(metrics);
    const successScore = this.calculateSuccessScore(metrics);
    const latencyScore = this.calculateLatencyScore(metrics);
    const availabilityScore = this.calculateAvailabilityScore(metrics);

    const w = this.weights;
    const totalWeight = w.load + w.success + w.latency + w.availability;

    const score =
      (w.load * loadScore +
        w.success * successScore +
        w.latency * latencyScore +
        w.availability * availabilityScore) /
      totalWeight;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate load score (lower load = higher score).
   */
  private calculateLoadScore(metrics: HealthMetrics): number {
    if (metrics.maxLoad === 0) return 1;
    const ratio = metrics.currentLoad / metrics.maxLoad;
    return Math.max(0, 1 - ratio);
  }

  /**
   * Calculate success rate score.
   */
  private calculateSuccessScore(metrics: HealthMetrics): number {
    const total = metrics.successes + metrics.failures;
    if (total === 0) return 1; // No data = assume healthy
    return metrics.successes / total;
  }

  /**
   * Calculate latency score (lower latency = higher score).
   */
  private calculateLatencyScore(metrics: HealthMetrics): number {
    const now = Date.now();
    const cutoff = now - this.latencyWindowMs;

    const recentLatencies = metrics.latencies.filter((l) => l.timestamp >= cutoff);

    if (recentLatencies.length < this.minLatencySamples) {
      return 1; // Not enough data, assume healthy
    }

    const avgLatency =
      recentLatencies.reduce((sum, l) => sum + l.durationMs, 0) / recentLatencies.length;

    // Score decreases linearly with latency
    const score = 1 - avgLatency / this.maxLatencyMs;
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate availability score.
   */
  private calculateAvailabilityScore(metrics: HealthMetrics): number {
    if (metrics.totalMs === 0) return 1;
    return metrics.uptimeMs / metrics.totalMs;
  }

  /**
   * Get breakdown of individual scores.
   */
  breakdown(metrics: HealthMetrics): {
    overall: number;
    load: number;
    success: number;
    latency: number;
    availability: number;
  } {
    return {
      overall: this.calculate(metrics),
      load: this.calculateLoadScore(metrics),
      success: this.calculateSuccessScore(metrics),
      latency: this.calculateLatencyScore(metrics),
      availability: this.calculateAvailabilityScore(metrics),
    };
  }
}

/**
 * Worker Health Tracker - Maintains health metrics for a worker.
 */
export class WorkerHealthTracker {
  private successes = 0;
  private failures = 0;
  private latencies: LatencyRecord[] = [];
  private startTime = Date.now();
  private downtime = 0;
  private lastDownStart: number | null = null;

  constructor(
    private readonly workerId: string,
    private readonly scorer: HealthScorer = new HealthScorer(),
    private readonly latencyWindowMs: number = DEFAULT_LATENCY_WINDOW,
  ) {}

  /**
   * Record a successful task completion.
   */
  recordSuccess(durationMs: number): void {
    this.successes++;
    this.latencies.push({ timestamp: Date.now(), durationMs });
    this.pruneLatencies();
  }

  /**
   * Record a failed task.
   */
  recordFailure(): void {
    this.failures++;
  }

  /**
   * Mark worker as down.
   */
  markDown(): void {
    if (this.lastDownStart === null) {
      this.lastDownStart = Date.now();
    }
  }

  /**
   * Mark worker as up.
   */
  markUp(): void {
    if (this.lastDownStart !== null) {
      this.downtime += Date.now() - this.lastDownStart;
      this.lastDownStart = null;
    }
  }

  /**
   * Get health score.
   */
  getScore(currentLoad: number, maxLoad: number): number {
    return this.scorer.calculate(this.getMetrics(currentLoad, maxLoad));
  }

  /**
   * Get health breakdown.
   */
  getBreakdown(currentLoad: number, maxLoad: number): ReturnType<HealthScorer["breakdown"]> {
    return this.scorer.breakdown(this.getMetrics(currentLoad, maxLoad));
  }

  /**
   * Get raw metrics.
   */
  getMetrics(currentLoad: number, maxLoad: number): HealthMetrics {
    const now = Date.now();
    const totalMs = now - this.startTime;
    const currentDowntime = this.lastDownStart ? now - this.lastDownStart : 0;
    const uptimeMs = totalMs - this.downtime - currentDowntime;

    return {
      currentLoad,
      maxLoad,
      successes: this.successes,
      failures: this.failures,
      latencies: this.latencies,
      uptimeMs,
      totalMs,
    };
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.successes = 0;
    this.failures = 0;
    this.latencies = [];
    this.startTime = Date.now();
    this.downtime = 0;
    this.lastDownStart = null;
  }

  /**
   * Prune old latency records.
   */
  private pruneLatencies(): void {
    const cutoff = Date.now() - this.latencyWindowMs;
    this.latencies = this.latencies.filter((l) => l.timestamp >= cutoff);
  }
}

/**
 * Health Tracker Registry - Manages health trackers for all workers.
 */
export class HealthTrackerRegistry {
  private trackers = new Map<string, WorkerHealthTracker>();
  private scorer: HealthScorer;

  constructor(options: HealthScoreOptions = {}) {
    this.scorer = new HealthScorer(options);
  }

  /**
   * Get or create tracker for a worker.
   */
  get(workerId: string): WorkerHealthTracker {
    let tracker = this.trackers.get(workerId);
    if (!tracker) {
      tracker = new WorkerHealthTracker(workerId, this.scorer);
      this.trackers.set(workerId, tracker);
    }
    return tracker;
  }

  /**
   * Record success for a worker.
   */
  recordSuccess(workerId: string, durationMs: number): void {
    this.get(workerId).recordSuccess(durationMs);
  }

  /**
   * Record failure for a worker.
   */
  recordFailure(workerId: string): void {
    this.get(workerId).recordFailure();
  }

  /**
   * Get scores for all workers.
   */
  getAllScores(loadInfo: Map<string, { current: number; max: number }>): Map<string, number> {
    const scores = new Map<string, number>();
    for (const [id, tracker] of this.trackers) {
      const load = loadInfo.get(id) ?? { current: 0, max: 1 };
      scores.set(id, tracker.getScore(load.current, load.max));
    }
    return scores;
  }

  /**
   * Get the healthiest worker from a list.
   */
  getHealthiest(
    workerIds: string[],
    loadInfo: Map<string, { current: number; max: number }>,
  ): string | null {
    let best: string | null = null;
    let bestScore = -1;

    for (const id of workerIds) {
      const load = loadInfo.get(id) ?? { current: 0, max: 1 };
      const score = this.get(id).getScore(load.current, load.max);
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }

    return best;
  }
}
