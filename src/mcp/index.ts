/**
 * MCP (Model Context Protocol) integration for openbot.
 *
 * This module provides:
 * - McpClientManager: Connect to external MCP servers (stdio, SSE)
 * - Tool adapters: Convert MCP tools to openbot AgentTool format
 * - Resource access: Read resources from MCP servers
 *
 * Usage:
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
 *
 *   const tools = createAllMcpToolAdapters(manager);
 */

export { McpClientManager } from "./client.js";
export {
  createMcpToolAdapter,
  createAllMcpToolAdapters,
  createMcpResourceTool,
  createMcpListTool,
} from "./tool-adapter.js";
export { acpMcpServerToConfig, acpMcpServersToConfigs } from "./acp-adapter.js";
export type {
  McpServerConfig,
  McpClientState,
  McpToolInfo,
  McpResourceInfo,
  McpCallToolResult,
  McpManagerOptions,
  McpTransportType,
} from "./types.js";
