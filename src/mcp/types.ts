/**
 * MCP (Model Context Protocol) integration types for openbot.
 * Supports connecting to external MCP servers and exposing openbot tools as MCP endpoints.
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export type McpTransportType = "stdio" | "sse" | "http";

export type McpServerConfig = {
  /** Unique identifier for this MCP server */
  id: string;
  /** Human-readable name */
  name: string;
  /** Transport type */
  transport: McpTransportType;
  /** For stdio: command to run */
  command?: string;
  /** For stdio: command arguments */
  args?: string[];
  /** For stdio: environment variables */
  env?: Record<string, string>;
  /** For SSE/HTTP: server URL */
  url?: string;
  /** Optional API key for authentication */
  apiKey?: string;
  /** Whether this server is enabled */
  enabled?: boolean;
};

export type McpClientState = {
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  connected: boolean;
  tools: McpToolInfo[];
  resources: McpResourceInfo[];
  lastError?: string;
};

export type McpToolInfo = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  serverName: string;
};

export type McpResourceInfo = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverId: string;
};

export type McpCallToolResult = {
  success: boolean;
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
};

export type McpManagerOptions = {
  /** Log function for debug output */
  log?: (msg: string) => void;
  /** Timeout for tool calls in milliseconds */
  toolTimeoutMs?: number;
};
