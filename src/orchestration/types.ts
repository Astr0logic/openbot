/**
 * Orchestration types for multi-instance openbot coordination.
 */

export type WorkerStatus = "online" | "busy" | "degraded" | "offline";

export type WorkerInfo = {
  id: string;
  name: string;
  endpoint: string;
  status: WorkerStatus;
  lastHeartbeat: number;
  capabilities: string[];
  currentLoad: number;
  maxLoad: number;
  metadata?: Record<string, unknown>;
};

export type TaskPriority = "low" | "normal" | "high" | "critical";

export type TaskStatus = "pending" | "assigned" | "running" | "completed" | "failed" | "timeout";

export type Task = {
  id: string;
  type: string;
  payload: unknown;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  assignedTo?: string;
  assignedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
  retries: number;
  maxRetries: number;
  timeoutMs: number;
};

export type TaskResult = {
  taskId: string;
  workerId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
};

export type RoutingStrategy = "round-robin" | "least-loaded" | "capability-match" | "random";

export type OrchestratorConfig = {
  /** Routing strategy for task assignment */
  routingStrategy: RoutingStrategy;
  /** Heartbeat interval in ms */
  heartbeatIntervalMs: number;
  /** Worker considered offline after this many missed heartbeats */
  missedHeartbeatsThreshold: number;
  /** Default task timeout in ms */
  defaultTaskTimeoutMs: number;
  /** Max retries for failed tasks */
  defaultMaxRetries: number;
  /** Max pending tasks in queue */
  maxQueueSize: number;
  /** Log function */
  log?: (msg: string) => void;
};

export type HeartbeatPayload = {
  workerId: string;
  status: WorkerStatus;
  currentLoad: number;
  maxLoad: number;
  capabilities: string[];
};

export type TaskAssignment = {
  task: Task;
  workerId: string;
};
