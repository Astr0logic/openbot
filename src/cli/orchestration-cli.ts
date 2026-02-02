/**
 * Orchestration CLI - Commands for multi-instance coordination.
 *
 * Commands:
 *   openbot orchestration supervisor - Start supervisor orchestrator
 *   openbot orchestration status     - Show orchestrator status
 *   openbot orchestration workers    - List registered workers
 *   openbot orchestration worker     - Register as a worker
 */

import type { Command } from "commander";

export function registerOrchestrationCli(program: Command): void {
  const orch = program.command("orchestration").description("Multi-instance orchestration tools");

  // Aliases
  orch.alias("orch");

  // openbot orchestration supervisor
  orch
    .command("supervisor")
    .description("Start supervisor orchestrator to manage worker instances")
    .option("--port <port>", "HTTP port for worker communication", "18800")
    .option(
      "--strategy <strategy>",
      "Routing strategy (round-robin, least-loaded, capability-match, random)",
      "least-loaded",
    )
    .option("--heartbeat <ms>", "Heartbeat interval in milliseconds", "30000")
    .option("-v, --verbose", "Verbose output")
    .action(async (options) => {
      const { Orchestrator, OrchestratorHttpServer } = await import("../orchestration/index.js");

      const log = options.verbose ? (msg: string) => console.log(msg) : () => {};

      const orchestrator = new Orchestrator(
        {
          routingStrategy: options.strategy,
          heartbeatIntervalMs: parseInt(options.heartbeat, 10),
          log,
        },
        {
          onTaskAssigned: (task, workerId) => {
            console.log(`[task] ${task.id} → ${workerId}`);
          },
          onTaskCompleted: (result) => {
            console.log(`[task] ${result.taskId} ✓ (${result.durationMs}ms)`);
          },
          onTaskFailed: (task, error) => {
            console.error(`[task] ${task.id} ✗ ${error}`);
          },
          onWorkerOnline: (worker) => {
            console.log(`[worker] ${worker.id} online (${worker.name})`);
          },
          onWorkerOffline: (worker) => {
            console.log(`[worker] ${worker.id} offline`);
          },
        },
      );

      orchestrator.start();

      const port = parseInt(options.port, 10);
      const httpServer = new OrchestratorHttpServer({
        orchestrator,
        port,
        log,
      });

      await httpServer.start();

      console.log(`\nSupervisor running (strategy: ${options.strategy})`);
      console.log(`API: http://localhost:${port}`);
      console.log("\nEndpoints:");
      console.log("  POST /workers/register  - Register worker");
      console.log("  POST /workers/heartbeat - Worker heartbeat");
      console.log("  GET  /workers           - List workers");
      console.log("  POST /tasks             - Submit task");
      console.log("  GET  /tasks/:id         - Task status");
      console.log("  GET  /status            - Orchestrator stats");
      console.log("\nPress Ctrl+C to stop\n");

      // Handle shutdown
      process.on("SIGINT", async () => {
        console.log("\nShutting down...");
        await httpServer.stop();
        orchestrator.stop();
        process.exit(0);
      });

      // Keep running
      await new Promise(() => {});
    });

  // openbot orchestration status
  orch
    .command("status")
    .description("Show orchestrator status")
    .option("--url <url>", "Supervisor URL", "http://localhost:18800")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const res = await fetch(`${options.url}/status`);
        const stats = await res.json();

        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log("Orchestrator Status");
          console.log("===================\n");

          console.log("Workers:");
          console.log(`  Total:     ${stats.workers?.total ?? 0}`);
          console.log(`  Online:    ${stats.workers?.online ?? 0}`);
          console.log(`  Busy:      ${stats.workers?.busy ?? 0}`);
          console.log(`  Degraded:  ${stats.workers?.degraded ?? 0}`);
          console.log(`  Offline:   ${stats.workers?.offline ?? 0}`);
          console.log(
            `  Capacity:  ${stats.workers?.currentLoad ?? 0}/${stats.workers?.totalCapacity ?? 0}\n`,
          );

          console.log("Tasks:");
          console.log(`  Queued:    ${stats.tasks?.queued ?? 0}`);
          console.log(`  Active:    ${stats.tasks?.active ?? 0}`);
          console.log(`  Completed: ${stats.tasks?.completed ?? 0}`);
          console.log(`  Failed:    ${stats.tasks?.failed ?? 0}`);
        }
      } catch (err) {
        console.error(`Failed to connect to supervisor at ${options.url}`);
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // openbot orchestration workers
  orch
    .command("workers")
    .description("List registered workers")
    .option("--url <url>", "Supervisor URL", "http://localhost:18800")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const res = await fetch(`${options.url}/workers`);
        const data = await res.json();
        const workers = data.workers ?? [];

        if (options.json) {
          console.log(JSON.stringify(workers, null, 2));
        } else {
          if (workers.length === 0) {
            console.log("No workers registered.");
          } else {
            console.log(`Registered Workers (${workers.length}):\n`);
            for (const w of workers) {
              const status = w.status === "online" ? "●" : w.status === "busy" ? "◐" : "○";
              const load = `${w.currentLoad}/${w.maxLoad}`;
              console.log(`  ${status} ${w.id} (${w.name})`);
              console.log(`    Endpoint: ${w.endpoint}`);
              console.log(`    Load: ${load}`);
              console.log(`    Capabilities: ${w.capabilities?.join(", ") || "all"}`);
              console.log();
            }
          }
        }
      } catch (err) {
        console.error(`Failed to connect to supervisor at ${options.url}`);
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // openbot orchestration worker - Register as a worker
  orch
    .command("worker")
    .description("Register this instance as a worker with a supervisor")
    .requiredOption("--supervisor <url>", "Supervisor URL (e.g., http://localhost:18800)")
    .option("--id <id>", "Worker ID", `worker-${process.pid}`)
    .option("--name <name>", "Worker name", `Worker ${process.pid}`)
    .option("--endpoint <url>", "This worker's endpoint URL")
    .option("--capabilities <caps>", "Comma-separated capabilities", "")
    .option("--max-load <n>", "Maximum concurrent tasks", "5")
    .option("--heartbeat <ms>", "Heartbeat interval", "10000")
    .option("-v, --verbose", "Verbose output")
    .action(async (options) => {
      const supervisorUrl = options.supervisor;
      const workerId = options.id;
      const workerName = options.name;
      const endpoint = options.endpoint ?? `http://localhost:${18790 + (process.pid % 100)}`;
      const capabilities = options.capabilities
        ? options.capabilities.split(",").map((c: string) => c.trim())
        : [];
      const maxLoad = parseInt(options.maxLoad, 10);
      const heartbeatMs = parseInt(options.heartbeat, 10);
      const log = options.verbose ? (msg: string) => console.log(msg) : () => {};

      // Register with supervisor
      log(`[worker] registering with ${supervisorUrl}...`);

      try {
        const res = await fetch(`${supervisorUrl}/workers/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: workerId,
            name: workerName,
            endpoint,
            capabilities,
            currentLoad: 0,
            maxLoad,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        console.log(`Worker registered: ${workerId}`);
        console.log(`  Supervisor: ${supervisorUrl}`);
        console.log(`  Endpoint: ${endpoint}`);
        console.log(`  Capabilities: ${capabilities.length ? capabilities.join(", ") : "all"}`);
        console.log(`  Max Load: ${maxLoad}`);
        console.log("\nSending heartbeats... (Ctrl+C to stop)\n");

        let currentLoad = 0;

        // Heartbeat loop
        const heartbeat = async () => {
          try {
            const hbRes = await fetch(`${supervisorUrl}/workers/heartbeat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workerId,
                status: currentLoad >= maxLoad ? "busy" : "online",
                currentLoad,
                maxLoad,
                capabilities,
              }),
            });

            if (hbRes.ok) {
              log(`[heartbeat] ok (load: ${currentLoad}/${maxLoad})`);
            } else {
              log(`[heartbeat] failed: ${hbRes.status}`);
            }
          } catch (err) {
            log(`[heartbeat] error: ${err instanceof Error ? err.message : String(err)}`);
          }
        };

        // Initial heartbeat
        await heartbeat();

        // Start heartbeat timer
        const timer = setInterval(() => void heartbeat(), heartbeatMs);

        // Handle shutdown
        process.on("SIGINT", async () => {
          console.log("\nUnregistering worker...");
          clearInterval(timer);

          try {
            await fetch(`${supervisorUrl}/workers/${workerId}`, { method: "DELETE" });
            console.log("Worker unregistered.");
          } catch {
            // Ignore errors on shutdown
          }

          process.exit(0);
        });

        // Keep running
        await new Promise(() => {});
      } catch (err) {
        console.error(
          `Failed to register with supervisor: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });
}
