/**
 * MCP CLI - Commands for MCP server and client operations.
 *
 * Commands:
 *   openbot mcp serve   - Start MCP server to expose openbot tools
 *   openbot mcp list    - List available MCP tools
 *   openbot mcp connect - Test connection to an MCP server
 */

import type { Command } from "commander";

export function registerMcpCli(program: Command): void {
  const mcp = program.command("mcp").description("MCP (Model Context Protocol) tools");

  // openbot mcp serve
  mcp
    .command("serve")
    .description("Start MCP server to expose openbot tools via stdio")
    .option("--name <name>", "Server name", "openbot")
    .option("--version <version>", "Server version", "1.0.0")
    .option("-v, --verbose", "Verbose output")
    .action(async (options) => {
      const { startMcpServerStdio } = await import("../mcp/server.js");
      const { createOpenClawTools } = await import("../agents/pi-tools.js");
      const { loadConfig } = await import("../config/config.js");

      const log = options.verbose ? (msg: string) => console.error(msg) : () => {};

      log("[mcp] loading tools...");

      const config = loadConfig();
      const tools = createOpenClawTools({ config });

      log(`[mcp] loaded ${tools.length} tools`);
      log("[mcp] starting MCP server on stdio...");

      await startMcpServerStdio({
        tools,
        name: options.name,
        version: options.version,
        log,
      });
    });

  // openbot mcp list
  mcp
    .command("list")
    .description("List available openbot tools that can be exposed via MCP")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const { createOpenClawTools } = await import("../agents/pi-tools.js");
      const { loadConfig } = await import("../config/config.js");

      const config = loadConfig();
      const tools = createOpenClawTools({ config });

      if (options.json) {
        const toolList = tools.map((t) => ({
          name: t.name,
          label: t.label,
          description: t.description,
        }));
        console.log(JSON.stringify(toolList, null, 2));
      } else {
        console.log(`Available tools (${tools.length}):\n`);
        for (const tool of tools) {
          console.log(`  ${tool.name}`);
          if (tool.description) {
            console.log(
              `    ${tool.description.slice(0, 80)}${tool.description.length > 80 ? "..." : ""}`,
            );
          }
          console.log();
        }
      }
    });

  // openbot mcp connect
  mcp
    .command("connect")
    .description("Test connection to an MCP server")
    .requiredOption("--command <cmd>", "Command to run MCP server")
    .option("--args <args>", "Comma-separated arguments", "")
    .option("--name <name>", "Server name", "test-server")
    .option("-v, --verbose", "Verbose output")
    .action(async (options) => {
      const { McpClientManager } = await import("../mcp/client.js");

      const log = options.verbose ? (msg: string) => console.error(msg) : () => {};

      const args = options.args ? options.args.split(",").map((a: string) => a.trim()) : [];

      console.log(`Connecting to MCP server: ${options.command} ${args.join(" ")}`);

      const manager = new McpClientManager({ log });

      try {
        const state = await manager.connect({
          id: "test",
          name: options.name,
          transport: "stdio",
          command: options.command,
          args,
        });

        console.log(`\nConnected to ${state.config.name}`);
        console.log(`\nTools (${state.tools.length}):`);
        for (const tool of state.tools) {
          console.log(`  - ${tool.name}: ${tool.description ?? "(no description)"}`);
        }

        console.log(`\nResources (${state.resources.length}):`);
        for (const resource of state.resources) {
          console.log(`  - ${resource.uri}: ${resource.description ?? resource.name}`);
        }

        await manager.disconnect("test");
        console.log("\nDisconnected.");
      } catch (err) {
        console.error(`\nFailed to connect: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // openbot mcp audit
  mcp
    .command("audit")
    .description("View MCP audit logs")
    .option("--path <path>", "Path to audit log file")
    .option("--tail <n>", "Show last N entries", "20")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const readline = await import("node:readline");

      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ".";
      const logPath = options.path ?? path.join(homeDir, ".openbot", "audit", "mcp-audit.jsonl");

      if (!fs.existsSync(logPath)) {
        console.log(`No audit log found at: ${logPath}`);
        return;
      }

      const tailCount = parseInt(options.tail, 10) || 20;
      const lines: string[] = [];

      const fileStream = fs.createReadStream(logPath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        lines.push(line);
        if (lines.length > tailCount) {
          lines.shift();
        }
      }

      if (options.json) {
        const entries = lines.map((line) => JSON.parse(line));
        console.log(JSON.stringify(entries, null, 2));
      } else {
        console.log(`Last ${lines.length} audit entries from: ${logPath}\n`);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const time = entry.timestamp?.slice(11, 19) ?? "??:??:??";
            const type = entry.type?.padEnd(8) ?? "unknown";
            const tool = entry.toolName ?? "?";
            const dir = entry.direction === "inbound" ? "→" : "←";
            console.log(`[${time}] ${type} ${dir} ${tool}`);
          } catch {
            console.log(line);
          }
        }
      }
    });
}
