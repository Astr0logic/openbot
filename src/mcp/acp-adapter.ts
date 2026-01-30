/**
 * Adapter for ACP (Agent Client Protocol) MCP server definitions.
 * Converts ACP's McpServer format to openbot's McpServerConfig.
 */

import type { McpServer } from "@agentclientprotocol/sdk";
import type { McpServerConfig, McpTransportType } from "./types.js";

/**
 * Convert an ACP McpServer to openbot's McpServerConfig.
 */
export function acpMcpServerToConfig(server: McpServer, index: number): McpServerConfig {
  const baseId = `acp-mcp-${index}`;

  if ("type" in server) {
    if (server.type === "http") {
      const headers: Record<string, string> = {};
      for (const header of server.headers ?? []) {
        headers[header.name] = header.value;
      }
      return {
        id: baseId,
        name: server.name,
        transport: "http" as McpTransportType,
        url: server.url,
        apiKey: headers["Authorization"]?.replace(/^Bearer\s+/i, ""),
        enabled: true,
      };
    }

    if (server.type === "sse") {
      const headers: Record<string, string> = {};
      for (const header of server.headers ?? []) {
        headers[header.name] = header.value;
      }
      return {
        id: baseId,
        name: server.name,
        transport: "sse" as McpTransportType,
        url: server.url,
        apiKey: headers["Authorization"]?.replace(/^Bearer\s+/i, ""),
        enabled: true,
      };
    }
  }

  // Stdio transport (default for McpServerStdio)
  const stdioServer = server as {
    name: string;
    command: string;
    args?: Array<string>;
    env?: Array<{ name: string; value: string }>;
  };

  const env: Record<string, string> = {};
  for (const envVar of stdioServer.env ?? []) {
    env[envVar.name] = envVar.value;
  }

  return {
    id: baseId,
    name: stdioServer.name,
    transport: "stdio" as McpTransportType,
    command: stdioServer.command,
    args: stdioServer.args ?? [],
    env,
    enabled: true,
  };
}

/**
 * Convert an array of ACP McpServer definitions to openbot's McpServerConfig array.
 */
export function acpMcpServersToConfigs(servers: McpServer[]): McpServerConfig[] {
  return servers.map((server, index) => acpMcpServerToConfig(server, index));
}
