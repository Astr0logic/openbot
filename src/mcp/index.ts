/**
 * MCP (Model Context Protocol) integration for openbot.
 *
 * This module provides:
 * - McpClientManager: Connect to external MCP servers (stdio, SSE, HTTP)
 * - McpServer: Expose openbot tools as MCP endpoints
 * - Tool adapters: Convert MCP tools to/from openbot AgentTool format
 * - Resource access: Read resources from MCP servers
 *
 * Client Usage:
 *   import { McpClientManager, createAllMcpToolAdapters } from "./mcp/index.js";
 *
 *   const manager = new McpClientManager({ log: console.log });
 *   await manager.connect({
 *     id: "my-server",
 *     name: "My MCP Server",
 *     transport: "stdio",
 *     command: "npx",
 *     args: ["-y", "@modelcontextprotocol/server-filesystem"],
 *   });
 *   const tools = createAllMcpToolAdapters(manager);
 *
 * Server Usage:
 *   import { startMcpServerStdio } from "./mcp/index.js";
 *
 *   await startMcpServerStdio({ tools: myTools, name: "openbot" });
 */

// Client
export { McpClientManager } from "./client.js";
export {
  createMcpToolAdapter,
  createAllMcpToolAdapters,
  createMcpResourceTool,
  createMcpListTool,
} from "./tool-adapter.js";
export { acpMcpServerToConfig, acpMcpServersToConfigs } from "./acp-adapter.js";

// Server
export {
  createMcpServer,
  startMcpServerStdio,
  createMcpServerRunner,
  type McpServerOptions,
} from "./server.js";

// Audit Logging
export {
  McpAuditLogger,
  createDefaultAuditLogger,
  type AuditLogEntry,
  type AuditLoggerOptions,
} from "./audit-log.js";

// Connection Pool
export {
  McpConnectionPool,
  getGlobalMcpPool,
  shutdownGlobalMcpPool,
  type PooledConnection,
  type ConnectionPoolOptions,
} from "./connection-pool.js";

// Types
export type {
  McpServerConfig,
  McpClientState,
  McpToolInfo,
  McpResourceInfo,
  McpCallToolResult,
  McpManagerOptions,
  McpTransportType,
} from "./types.js";
