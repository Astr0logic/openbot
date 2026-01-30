/**
 * Worker Registry - Tracks all registered openbot worker instances.
 * Handles registration, heartbeats, and health monitoring.
 */

import type { WorkerInfo, WorkerStatus, HeartbeatPayload } from "./types.js";

export type WorkerRegistryOptions = {
  /** Heartbeat interval in ms */
  heartbeatIntervalMs?: number;
  /** Worker offline after this many missed heartbeats */
  missedHeartbeatsThreshold?: number;
  /** Log function */
  log?: (msg: string) => void;
};

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_MISSED_HEARTBEATS_THRESHOLD = 3;

export class WorkerRegistry {
  private workers = new Map<string, WorkerInfo>();
  private options: Required<WorkerRegistryOptions>;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: WorkerRegistryOptions = {}) {
    this.options = {
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      missedHeartbeatsThreshold:
        options.missedHeartbeatsThreshold ?? DEFAULT_MISSED_HEARTBEATS_THRESHOLD,
      log: options.log ?? (() => {}),
    };
  }

  /**
   * Start background health checking.
   */
  start(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(() => {
      this.checkWorkerHealth();
    }, this.options.heartbeatIntervalMs);

    this.options.log("[orchestrator] worker registry started");
  }

  /**
   * Stop background health checking.
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.options.log("[orchestrator] worker registry stopped");
  }

  /**
   * Register a new worker.
   */
  register(worker: Omit<WorkerInfo, "lastHeartbeat" | "status">): WorkerInfo {
    const existing = this.workers.get(worker.id);
    if (existing) {
      this.options.log(`[orchestrator] worker ${worker.id} re-registered`);
      return this.updateWorker(worker.id, {
        ...worker,
        status: "online",
        lastHeartbeat: Date.now(),
      });
    }

    const newWorker: WorkerInfo = {
      ...worker,
      status: "online",
      lastHeartbeat: Date.now(),
    };

    this.workers.set(worker.id, newWorker);
    this.options.log(`[orchestrator] worker registered: ${worker.id} (${worker.name})`);
    return newWorker;
  }

  /**
   * Unregister a worker.
   */
  unregister(workerId: string): boolean {
    const existed = this.workers.delete(workerId);
    if (existed) {
      this.options.log(`[orchestrator] worker unregistered: ${workerId}`);
    }
    return existed;
  }

  /**
   * Process a heartbeat from a worker.
   */
  heartbeat(payload: HeartbeatPayload): WorkerInfo | undefined {
    const worker = this.workers.get(payload.workerId);
    if (!worker) {
      this.options.log(`[orchestrator] heartbeat from unknown worker: ${payload.workerId}`);
      return undefined;
    }

    return this.updateWorker(payload.workerId, {
      status: payload.status,
      currentLoad: payload.currentLoad,
      maxLoad: payload.maxLoad,
      capabilities: payload.capabilities,
      lastHeartbeat: Date.now(),
    });
  }

  /**
   * Update worker info.
   */
  private updateWorker(workerId: string, updates: Partial<WorkerInfo>): WorkerInfo {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker not found: ${workerId}`);
    }

    const updated: WorkerInfo = { ...worker, ...updates };
    this.workers.set(workerId, updated);
    return updated;
  }

  /**
   * Check health of all workers and mark stale ones as offline.
   */
  private checkWorkerHealth(): void {
    const now = Date.now();
    const maxAge = this.options.heartbeatIntervalMs * this.options.missedHeartbeatsThreshold;

    for (const [workerId, worker] of this.workers.entries()) {
      if (worker.status === "offline") continue;

      const age = now - worker.lastHeartbeat;
      if (age > maxAge) {
        this.options.log(
          `[orchestrator] worker ${workerId} marked offline (no heartbeat for ${Math.round(age / 1000)}s)`,
        );
        this.updateWorker(workerId, { status: "offline" });
      }
    }
  }

  /**
   * Get a worker by ID.
   */
  get(workerId: string): WorkerInfo | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Get all workers.
   */
  getAll(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get workers with a specific status.
   */
  getByStatus(status: WorkerStatus): WorkerInfo[] {
    return this.getAll().filter((w) => w.status === status);
  }

  /**
   * Get online workers that have capacity.
   */
  getAvailable(): WorkerInfo[] {
    return this.getAll().filter(
      (w) => (w.status === "online" || w.status === "busy") && w.currentLoad < w.maxLoad,
    );
  }

  /**
   * Get workers with a specific capability.
   */
  getByCapability(capability: string): WorkerInfo[] {
    return this.getAll().filter(
      (w) => w.capabilities.includes(capability) && w.status === "online",
    );
  }

  /**
   * Get registry statistics.
   */
  stats(): {
    total: number;
    online: number;
    busy: number;
    degraded: number;
    offline: number;
    totalCapacity: number;
    currentLoad: number;
  } {
    const workers = this.getAll();
    return {
      total: workers.length,
      online: workers.filter((w) => w.status === "online").length,
      busy: workers.filter((w) => w.status === "busy").length,
      degraded: workers.filter((w) => w.status === "degraded").length,
      offline: workers.filter((w) => w.status === "offline").length,
      totalCapacity: workers.reduce((sum, w) => sum + w.maxLoad, 0),
      currentLoad: workers.reduce((sum, w) => sum + w.currentLoad, 0),
    };
  }
}
