/**
 * Orchestrator - Central coordinator for multi-instance openbot deployments.
 * Manages workers, routes tasks, and handles task lifecycle.
 */

import { randomUUID } from "node:crypto";
import type {
  Task,
  TaskResult,
  TaskPriority,
  TaskStatus,
  OrchestratorConfig,
  HeartbeatPayload,
  WorkerInfo,
} from "./types.js";
import { TaskRouter } from "./task-router.js";
import { WorkerRegistry } from "./worker-registry.js";

export type TaskSubmission = {
  type: string;
  payload: unknown;
  priority?: TaskPriority;
  timeoutMs?: number;
  maxRetries?: number;
};

export type OrchestratorEvents = {
  onTaskAssigned?: (task: Task, workerId: string) => void;
  onTaskCompleted?: (result: TaskResult) => void;
  onTaskFailed?: (task: Task, error: string) => void;
  onWorkerOnline?: (worker: WorkerInfo) => void;
  onWorkerOffline?: (worker: WorkerInfo) => void;
};

const DEFAULT_CONFIG: OrchestratorConfig = {
  routingStrategy: "least-loaded",
  heartbeatIntervalMs: 30_000,
  missedHeartbeatsThreshold: 3,
  defaultTaskTimeoutMs: 60_000,
  defaultMaxRetries: 2,
  maxQueueSize: 1000,
};

export class Orchestrator {
  private config: OrchestratorConfig;
  private registry: WorkerRegistry;
  private router: TaskRouter;
  private taskQueue: Task[] = [];
  private activeTasks = new Map<string, Task>();
  private taskResults = new Map<string, TaskResult>();
  private events: OrchestratorEvents;
  private processingTimer: ReturnType<typeof setInterval> | null = null;
  private log: (msg: string) => void;

  constructor(config: Partial<OrchestratorConfig> = {}, events: OrchestratorEvents = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.log = this.config.log ?? (() => {});
    this.events = events;

    this.registry = new WorkerRegistry({
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
      missedHeartbeatsThreshold: this.config.missedHeartbeatsThreshold,
      log: this.log,
    });

    this.router = new TaskRouter({
      strategy: this.config.routingStrategy,
      log: this.log,
    });
  }

  /**
   * Start the orchestrator.
   */
  start(): void {
    this.registry.start();

    // Process queue periodically
    this.processingTimer = setInterval(() => {
      void this.processQueue();
    }, 1000);

    this.log("[orchestrator] started");
  }

  /**
   * Stop the orchestrator.
   */
  stop(): void {
    this.registry.stop();

    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    this.log("[orchestrator] stopped");
  }

  /**
   * Register a worker.
   */
  registerWorker(worker: Omit<WorkerInfo, "lastHeartbeat" | "status">): WorkerInfo {
    const registered = this.registry.register(worker);
    this.events.onWorkerOnline?.(registered);
    return registered;
  }

  /**
   * Unregister a worker.
   */
  unregisterWorker(workerId: string): boolean {
    const worker = this.registry.get(workerId);
    const result = this.registry.unregister(workerId);
    if (result && worker) {
      this.events.onWorkerOffline?.(worker);
    }
    return result;
  }

  /**
   * Process a worker heartbeat.
   */
  heartbeat(payload: HeartbeatPayload): WorkerInfo | undefined {
    return this.registry.heartbeat(payload);
  }

  /**
   * Submit a task to the queue.
   */
  submitTask(submission: TaskSubmission): Task {
    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error("Task queue is full");
    }

    const task: Task = {
      id: randomUUID(),
      type: submission.type,
      payload: submission.payload,
      priority: submission.priority ?? "normal",
      status: "pending",
      createdAt: Date.now(),
      retries: 0,
      maxRetries: submission.maxRetries ?? this.config.defaultMaxRetries,
      timeoutMs: submission.timeoutMs ?? this.config.defaultTaskTimeoutMs,
    };

    this.insertByPriority(task);
    this.log(
      `[orchestrator] task submitted: ${task.id} (type: ${task.type}, priority: ${task.priority})`,
    );

    return task;
  }

  /**
   * Report task completion.
   */
  reportTaskResult(result: TaskResult): void {
    const task = this.activeTasks.get(result.taskId);
    if (!task) {
      this.log(`[orchestrator] result for unknown task: ${result.taskId}`);
      return;
    }

    this.activeTasks.delete(result.taskId);
    this.taskResults.set(result.taskId, result);

    if (result.success) {
      task.status = "completed";
      task.completedAt = Date.now();
      task.result = result.result;
      this.log(`[orchestrator] task completed: ${task.id} (duration: ${result.durationMs}ms)`);
      this.events.onTaskCompleted?.(result);
    } else {
      if (task.retries < task.maxRetries) {
        // Retry the task
        task.retries++;
        task.status = "pending";
        task.assignedTo = undefined;
        task.assignedAt = undefined;
        this.insertByPriority(task);
        this.log(
          `[orchestrator] task retrying: ${task.id} (attempt ${task.retries + 1}/${task.maxRetries + 1})`,
        );
      } else {
        // Mark as failed
        task.status = "failed";
        task.completedAt = Date.now();
        task.error = result.error;
        this.log(`[orchestrator] task failed: ${task.id} - ${result.error}`);
        this.events.onTaskFailed?.(task, result.error ?? "Unknown error");
      }
    }
  }

  /**
   * Get task by ID.
   */
  getTask(taskId: string): Task | undefined {
    return this.activeTasks.get(taskId) ?? this.taskQueue.find((t) => t.id === taskId);
  }

  /**
   * Get task result.
   */
  getTaskResult(taskId: string): TaskResult | undefined {
    return this.taskResults.get(taskId);
  }

  /**
   * Get orchestrator statistics.
   */
  stats(): {
    workers: ReturnType<WorkerRegistry["stats"]>;
    tasks: {
      queued: number;
      active: number;
      completed: number;
      failed: number;
    };
  } {
    const queuedByStatus = this.taskQueue.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<TaskStatus, number>,
    );

    return {
      workers: this.registry.stats(),
      tasks: {
        queued: this.taskQueue.length,
        active: this.activeTasks.size,
        completed: queuedByStatus.completed ?? 0,
        failed: queuedByStatus.failed ?? 0,
      },
    };
  }

  /**
   * Get worker registry for direct access.
   */
  getRegistry(): WorkerRegistry {
    return this.registry;
  }

  /**
   * Insert task by priority (higher priority first).
   */
  private insertByPriority(task: Task): void {
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const taskPriority = priorityOrder[task.priority];
    let insertIndex = this.taskQueue.length;

    for (let i = 0; i < this.taskQueue.length; i++) {
      const existingTask = this.taskQueue[i];
      if (!existingTask) continue;
      const existingPriority = priorityOrder[existingTask.priority];
      if (taskPriority < existingPriority) {
        insertIndex = i;
        break;
      }
    }

    this.taskQueue.splice(insertIndex, 0, task);
  }

  /**
   * Process pending tasks from the queue.
   */
  private async processQueue(): Promise<void> {
    // Check for timed out tasks
    this.checkTimeouts();

    // Try to assign pending tasks
    const pendingTasks = this.taskQueue.filter((t) => t.status === "pending");

    for (const task of pendingTasks) {
      const assignment = this.router.route(task, this.registry);
      if (assignment) {
        // Remove from queue and add to active
        const index = this.taskQueue.indexOf(task);
        if (index >= 0) {
          this.taskQueue.splice(index, 1);
        }

        task.status = "assigned";
        task.assignedTo = assignment.workerId;
        task.assignedAt = Date.now();

        this.activeTasks.set(task.id, task);
        this.events.onTaskAssigned?.(task, assignment.workerId);
      }
    }
  }

  /**
   * Check for timed out active tasks.
   */
  private checkTimeouts(): void {
    const now = Date.now();

    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.assignedAt && now - task.assignedAt > task.timeoutMs) {
        this.log(`[orchestrator] task timed out: ${taskId}`);

        this.reportTaskResult({
          taskId,
          workerId: task.assignedTo ?? "unknown",
          success: false,
          error: "Task timed out",
          durationMs: now - task.assignedAt,
        });
      }
    }
  }
}
