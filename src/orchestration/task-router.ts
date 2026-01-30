/**
 * Task Router - Routes tasks to workers based on configurable strategies.
 * Supports round-robin, least-loaded, capability-matching, and random routing.
 */

import type { Task, WorkerInfo, RoutingStrategy, TaskAssignment } from "./types.js";
import type { WorkerRegistry } from "./worker-registry.js";

export type TaskRouterOptions = {
  /** Default routing strategy */
  strategy?: RoutingStrategy;
  /** Log function */
  log?: (msg: string) => void;
};

export class TaskRouter {
  private strategy: RoutingStrategy;
  private roundRobinIndex = 0;
  private log: (msg: string) => void;

  constructor(options: TaskRouterOptions = {}) {
    this.strategy = options.strategy ?? "least-loaded";
    this.log = options.log ?? (() => {});
  }

  /**
   * Set the routing strategy.
   */
  setStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy;
    this.log(`[router] strategy set to: ${strategy}`);
  }

  /**
   * Route a task to an appropriate worker.
   */
  route(task: Task, registry: WorkerRegistry): TaskAssignment | null {
    const workers = this.getEligibleWorkers(task, registry);

    if (workers.length === 0) {
      this.log(`[router] no eligible workers for task ${task.id} (type: ${task.type})`);
      return null;
    }

    const worker = this.selectWorker(workers, task);
    if (!worker) {
      return null;
    }

    this.log(`[router] task ${task.id} routed to worker ${worker.id} (strategy: ${this.strategy})`);
    return { task, workerId: worker.id };
  }

  /**
   * Get workers eligible for a task.
   */
  private getEligibleWorkers(task: Task, registry: WorkerRegistry): WorkerInfo[] {
    let workers = registry.getAvailable();

    // Filter by capability if task type requires it
    if (task.type) {
      const capableWorkers = workers.filter(
        (w) => w.capabilities.length === 0 || w.capabilities.includes(task.type),
      );
      if (capableWorkers.length > 0) {
        workers = capableWorkers;
      }
    }

    return workers;
  }

  /**
   * Select a worker based on the current strategy.
   */
  private selectWorker(workers: WorkerInfo[], task: Task): WorkerInfo | null {
    if (workers.length === 0) return null;

    switch (this.strategy) {
      case "round-robin":
        return this.selectRoundRobin(workers);
      case "least-loaded":
        return this.selectLeastLoaded(workers);
      case "capability-match":
        return this.selectByCapability(workers, task);
      case "random":
        return this.selectRandom(workers);
      default:
        return this.selectLeastLoaded(workers);
    }
  }

  /**
   * Round-robin selection.
   */
  private selectRoundRobin(workers: WorkerInfo[]): WorkerInfo {
    const worker = workers[this.roundRobinIndex % workers.length]!;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % workers.length;
    return worker;
  }

  /**
   * Select the worker with the least current load.
   */
  private selectLeastLoaded(workers: WorkerInfo[]): WorkerInfo {
    return workers.reduce((best, worker) => {
      const bestRatio = best.currentLoad / best.maxLoad;
      const workerRatio = worker.currentLoad / worker.maxLoad;
      return workerRatio < bestRatio ? worker : best;
    });
  }

  /**
   * Select by capability match score.
   */
  private selectByCapability(workers: WorkerInfo[], task: Task): WorkerInfo {
    // Prefer workers that explicitly list the task type as a capability
    const exactMatch = workers.filter((w) => w.capabilities.includes(task.type));
    if (exactMatch.length > 0) {
      return this.selectLeastLoaded(exactMatch);
    }

    // Fall back to least loaded
    return this.selectLeastLoaded(workers);
  }

  /**
   * Random selection.
   */
  private selectRandom(workers: WorkerInfo[]): WorkerInfo {
    const index = Math.floor(Math.random() * workers.length);
    return workers[index]!;
  }
}
