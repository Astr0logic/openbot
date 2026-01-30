/**
 * Orchestration CLI - Commands for multi-instance coordination.
 *
 * Commands:
 *   openbot orchestration supervisor - Start supervisor orchestrator
 *   openbot orchestration status     - Show orchestrator status
 *   openbot orchestration workers    - List registered workers
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
      const { Orchestrator } = await import("../orchestration/index.js");

      const log = options.verbose ? (msg: string) => console.log(msg) : () => {};

      const orchestrator = new Orchestrator(
        {
          routingStrategy: options.strategy,
          heartbeatIntervalMs: parseInt(options.heartbeat, 10),
          log,
        },
        {
          onTaskAssigned: (task, workerId) => {
            console.log(`[task] ${task.id} assigned to ${workerId}`);
          },
          onTaskCompleted: (result) => {
            console.log(`[task] ${result.taskId} completed (${result.durationMs}ms)`);
          },
          onTaskFailed: (task, error) => {
            console.error(`[task] ${task.id} failed: ${error}`);
          },
          onWorkerOnline: (worker) => {
            console.log(`[worker] ${worker.id} online`);
          },
          onWorkerOffline: (worker) => {
            console.log(`[worker] ${worker.id} offline`);
          },
        },
      );

      orchestrator.start();

      console.log(`Supervisor started (strategy: ${options.strategy})`);
      console.log(`Listening for workers on port ${options.port}`);
      console.log("Press Ctrl+C to stop\n");

      // Keep running
      await new Promise(() => {});
    });

  // openbot orchestration status
  orch
    .command("status")
    .description("Show orchestrator status")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      // TODO: Connect to running orchestrator via HTTP
      // For now, just show a placeholder
      const stats = {
        workers: {
          total: 0,
          online: 0,
          busy: 0,
          degraded: 0,
          offline: 0,
          totalCapacity: 0,
          currentLoad: 0,
        },
        tasks: {
          queued: 0,
          active: 0,
          completed: 0,
          failed: 0,
        },
      };

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log("Orchestrator Status");
        console.log("===================\n");

        console.log("Workers:");
        console.log(`  Total:     ${stats.workers.total}`);
        console.log(`  Online:    ${stats.workers.online}`);
        console.log(`  Busy:      ${stats.workers.busy}`);
        console.log(`  Degraded:  ${stats.workers.degraded}`);
        console.log(`  Offline:   ${stats.workers.offline}`);
        console.log(`  Capacity:  ${stats.workers.currentLoad}/${stats.workers.totalCapacity}\n`);

        console.log("Tasks:");
        console.log(`  Queued:    ${stats.tasks.queued}`);
        console.log(`  Active:    ${stats.tasks.active}`);
        console.log(`  Completed: ${stats.tasks.completed}`);
        console.log(`  Failed:    ${stats.tasks.failed}`);
      }
    });

  // openbot orchestration workers
  orch
    .command("workers")
    .description("List registered workers")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      // TODO: Connect to running orchestrator via HTTP
      const workers: unknown[] = [];

      if (options.json) {
        console.log(JSON.stringify(workers, null, 2));
      } else {
        if (workers.length === 0) {
          console.log("No workers registered.");
        } else {
          console.log("Registered Workers:");
          // TODO: Format worker list
        }
      }
    });
}
