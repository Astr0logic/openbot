/**
 * HTTP Server for Orchestrator - Exposes REST API for worker communication.
 *
 * Endpoints:
 *   POST /workers/register    - Register a worker
 *   POST /workers/heartbeat   - Worker heartbeat
 *   DELETE /workers/:id       - Unregister a worker
 *   GET /workers              - List workers
 *   POST /tasks               - Submit a task
 *   GET /tasks/:id            - Get task status
 *   POST /tasks/:id/result    - Report task result
 *   GET /status               - Get orchestrator status
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Orchestrator } from "./orchestrator.js";
import type { HeartbeatPayload, TaskResult, WorkerInfo } from "./types.js";

export type OrchestratorHttpServerOptions = {
  orchestrator: Orchestrator;
  port: number;
  host?: string;
  log?: (msg: string) => void;
};

export class OrchestratorHttpServer {
  private orchestrator: Orchestrator;
  private port: number;
  private host: string;
  private log: (msg: string) => void;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(options: OrchestratorHttpServerOptions) {
    this.orchestrator = options.orchestrator;
    this.port = options.port;
    this.host = options.host ?? "0.0.0.0";
    this.log = options.log ?? (() => {});
  }

  /**
   * Start the HTTP server.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.on("error", reject);

      this.server.listen(this.port, this.host, () => {
        this.log(`[http] orchestrator API listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server.
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.log("[http] orchestrator API stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP request.
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const method = req.method ?? "GET";
    const path = url.pathname;

    this.log(`[http] ${method} ${path}`);

    try {
      // Route matching
      if (method === "POST" && path === "/workers/register") {
        await this.handleWorkerRegister(req, res);
      } else if (method === "POST" && path === "/workers/heartbeat") {
        await this.handleWorkerHeartbeat(req, res);
      } else if (method === "DELETE" && path.startsWith("/workers/")) {
        const workerId = path.slice("/workers/".length);
        await this.handleWorkerUnregister(req, res, workerId);
      } else if (method === "GET" && path === "/workers") {
        await this.handleWorkersList(req, res);
      } else if (method === "POST" && path === "/tasks") {
        await this.handleTaskSubmit(req, res);
      } else if (method === "GET" && path.startsWith("/tasks/") && !path.includes("/result")) {
        const taskId = path.slice("/tasks/".length);
        await this.handleTaskStatus(req, res, taskId);
      } else if (method === "POST" && path.match(/^\/tasks\/[^/]+\/result$/)) {
        const taskId = path.split("/")[2] ?? "";
        await this.handleTaskResult(req, res, taskId);
      } else if (method === "GET" && path === "/status") {
        await this.handleStatus(req, res);
      } else if (method === "GET" && path === "/health") {
        this.sendJson(res, 200, { status: "ok" });
      } else {
        this.sendJson(res, 404, { error: "Not found" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(`[http] error: ${message}`);
      this.sendJson(res, 500, { error: message });
    }
  }

  /**
   * POST /workers/register - Register a new worker.
   */
  private async handleWorkerRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody<Omit<WorkerInfo, "lastHeartbeat" | "status">>(req);

    if (!body.id || !body.name || !body.endpoint) {
      this.sendJson(res, 400, { error: "Missing required fields: id, name, endpoint" });
      return;
    }

    const worker = this.orchestrator.registerWorker({
      id: body.id,
      name: body.name,
      endpoint: body.endpoint,
      capabilities: body.capabilities ?? [],
      currentLoad: body.currentLoad ?? 0,
      maxLoad: body.maxLoad ?? 10,
      metadata: body.metadata,
    });

    this.sendJson(res, 200, { success: true, worker });
  }

  /**
   * POST /workers/heartbeat - Worker heartbeat.
   */
  private async handleWorkerHeartbeat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody<HeartbeatPayload>(req);

    if (!body.workerId) {
      this.sendJson(res, 400, { error: "Missing required field: workerId" });
      return;
    }

    const worker = this.orchestrator.heartbeat(body);

    if (!worker) {
      this.sendJson(res, 404, { error: "Worker not found" });
      return;
    }

    // Return any pending tasks assigned to this worker
    const registry = this.orchestrator.getRegistry();
    const workerInfo = registry.get(body.workerId);

    this.sendJson(res, 200, { success: true, worker: workerInfo });
  }

  /**
   * DELETE /workers/:id - Unregister a worker.
   */
  private async handleWorkerUnregister(
    _req: IncomingMessage,
    res: ServerResponse,
    workerId: string,
  ): Promise<void> {
    const success = this.orchestrator.unregisterWorker(workerId);
    this.sendJson(res, 200, { success });
  }

  /**
   * GET /workers - List all workers.
   */
  private async handleWorkersList(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const workers = this.orchestrator.getRegistry().getAll();
    this.sendJson(res, 200, { workers });
  }

  /**
   * POST /tasks - Submit a new task.
   */
  private async handleTaskSubmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody<{
      type: string;
      payload: unknown;
      priority?: string;
      timeoutMs?: number;
      maxRetries?: number;
    }>(req);

    if (!body.type) {
      this.sendJson(res, 400, { error: "Missing required field: type" });
      return;
    }

    try {
      const task = this.orchestrator.submitTask({
        type: body.type,
        payload: body.payload,
        priority: (body.priority as "low" | "normal" | "high" | "critical") ?? "normal",
        timeoutMs: body.timeoutMs,
        maxRetries: body.maxRetries,
      });

      this.sendJson(res, 200, { success: true, task });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendJson(res, 400, { error: message });
    }
  }

  /**
   * GET /tasks/:id - Get task status.
   */
  private async handleTaskStatus(
    _req: IncomingMessage,
    res: ServerResponse,
    taskId: string,
  ): Promise<void> {
    const task = this.orchestrator.getTask(taskId);
    const result = this.orchestrator.getTaskResult(taskId);

    if (!task && !result) {
      this.sendJson(res, 404, { error: "Task not found" });
      return;
    }

    this.sendJson(res, 200, { task, result });
  }

  /**
   * POST /tasks/:id/result - Report task result.
   */
  private async handleTaskResult(
    req: IncomingMessage,
    res: ServerResponse,
    taskId: string,
  ): Promise<void> {
    const body = await this.readBody<{
      workerId: string;
      success: boolean;
      result?: unknown;
      error?: string;
      durationMs: number;
    }>(req);

    if (!body.workerId || body.success === undefined || body.durationMs === undefined) {
      this.sendJson(res, 400, {
        error: "Missing required fields: workerId, success, durationMs",
      });
      return;
    }

    const taskResult: TaskResult = {
      taskId,
      workerId: body.workerId,
      success: body.success,
      result: body.result,
      error: body.error,
      durationMs: body.durationMs,
    };

    this.orchestrator.reportTaskResult(taskResult);
    this.sendJson(res, 200, { success: true });
  }

  /**
   * GET /status - Get orchestrator status.
   */
  private async handleStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const stats = this.orchestrator.stats();
    this.sendJson(res, 200, stats);
  }

  /**
   * Read and parse JSON body.
   */
  private readBody<T>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve(body ? JSON.parse(body) : {});
        } catch {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }

  /**
   * Send JSON response.
   */
  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
}
