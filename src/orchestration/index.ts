/**
 * Orchestration module for multi-instance openbot coordination.
 *
 * Provides:
 * - Orchestrator: Central coordinator for managing worker instances
 * - WorkerRegistry: Tracks registered workers and their health
 * - TaskRouter: Routes tasks to workers based on configurable strategies
 *
 * Usage:
 *   import { Orchestrator } from "./orchestration/index.js";
 *
 *   const orchestrator = new Orchestrator({
 *     routingStrategy: "least-loaded",
 *     heartbeatIntervalMs: 30_000,
 *   });
 *
 *   orchestrator.start();
 *
 *   // Register workers
 *   orchestrator.registerWorker({
 *     id: "worker-1",
 *     name: "Worker 1",
 *     endpoint: "http://localhost:18790",
 *     capabilities: ["chat", "code"],
 *     currentLoad: 0,
 *     maxLoad: 10,
 *   });
 *
 *   // Submit tasks
 *   const task = orchestrator.submitTask({
 *     type: "chat",
 *     payload: { message: "Hello" },
 *     priority: "normal",
 *   });
 */

// Main orchestrator
export { Orchestrator, type TaskSubmission, type OrchestratorEvents } from "./orchestrator.js";

// Worker management
export { WorkerRegistry, type WorkerRegistryOptions } from "./worker-registry.js";

// Task routing
export { TaskRouter, type TaskRouterOptions } from "./task-router.js";

// HTTP API
export { OrchestratorHttpServer, type OrchestratorHttpServerOptions } from "./http-server.js";

// Types
export type {
  WorkerStatus,
  WorkerInfo,
  TaskPriority,
  TaskStatus,
  Task,
  TaskResult,
  RoutingStrategy,
  OrchestratorConfig,
  HeartbeatPayload,
  TaskAssignment,
} from "./types.js";
