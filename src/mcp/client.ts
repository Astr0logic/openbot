/**
 * MCP Client - connects to external MCP servers and manages their lifecycle.
 * Supports stdio and SSE transports.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

import type {
  McpServerConfig,
  McpClientState,
  McpToolInfo,
  McpResourceInfo,
  McpCallToolResult,
  McpManagerOptions,
} from "./types.js";

const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

export class McpClientManager {
  private clients = new Map<string, McpClientState>();
  private log: (msg: string) => void;
  private toolTimeoutMs: number;

  constructor(options: McpManagerOptions = {}) {
    this.log = options.log ?? (() => {});
    this.toolTimeoutMs = options.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  }

  /**
   * Connect to an MCP server.
   */
  async connect(config: McpServerConfig): Promise<McpClientState> {
    if (this.clients.has(config.id)) {
      const existing = this.clients.get(config.id)!;
      if (existing.connected) {
        return existing;
      }
      await this.disconnect(config.id);
    }

    this.log(`[mcp] connecting to ${config.name} (${config.id})`);

    const client = new Client(
      { name: "openbot", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {} } },
    );

    let transport: StdioClientTransport | SSEClientTransport;

    if (config.transport === "stdio") {
      if (!config.command) {
        throw new Error(`MCP server ${config.id}: stdio transport requires 'command'`);
      }
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env },
      });
    } else if (config.transport === "sse" || config.transport === "http") {
      if (!config.url) {
        throw new Error(`MCP server ${config.id}: ${config.transport} transport requires 'url'`);
      }
      const headers: Record<string, string> = {};
      if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      }
      transport = new SSEClientTransport(new URL(config.url), {
        requestInit: { headers },
      });
    } else {
      const transportType = config.transport as string;
      throw new Error(`MCP server ${config.id}: unsupported transport '${transportType}'`);
    }

    await client.connect(transport);

    const state: McpClientState = {
      config,
      client,
      transport,
      connected: true,
      tools: [],
      resources: [],
    };

    // Discover tools and resources
    try {
      const toolsResult = await client.listTools();
      state.tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        serverId: config.id,
        serverName: config.name,
      }));
      this.log(`[mcp] ${config.name}: discovered ${state.tools.length} tools`);
    } catch (err) {
      this.log(`[mcp] ${config.name}: failed to list tools: ${String(err)}`);
    }

    try {
      const resourcesResult = await client.listResources();
      state.resources = resourcesResult.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        serverId: config.id,
      }));
      this.log(`[mcp] ${config.name}: discovered ${state.resources.length} resources`);
    } catch (err) {
      this.log(`[mcp] ${config.name}: failed to list resources: ${String(err)}`);
    }

    this.clients.set(config.id, state);
    return state;
  }

  /**
   * Disconnect from an MCP server.
   */
  async disconnect(serverId: string): Promise<void> {
    const state = this.clients.get(serverId);
    if (!state) return;

    this.log(`[mcp] disconnecting from ${state.config.name}`);

    try {
      await state.client.close();
    } catch (err) {
      this.log(`[mcp] error closing client ${serverId}: ${String(err)}`);
    }

    state.connected = false;
    this.clients.delete(serverId);
  }

  /**
   * Disconnect from all MCP servers.
   */
  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.clients.keys());
    await Promise.all(ids.map((id) => this.disconnect(id)));
  }

  /**
   * Get all discovered tools from all connected servers.
   */
  getAllTools(): McpToolInfo[] {
    const tools: McpToolInfo[] = [];
    for (const state of this.clients.values()) {
      if (state.connected) {
        tools.push(...state.tools);
      }
    }
    return tools;
  }

  /**
   * Get all discovered resources from all connected servers.
   */
  getAllResources(): McpResourceInfo[] {
    const resources: McpResourceInfo[] = [];
    for (const state of this.clients.values()) {
      if (state.connected) {
        resources.push(...state.resources);
      }
    }
    return resources;
  }

  /**
   * Call a tool on an MCP server.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpCallToolResult> {
    const state = this.clients.get(serverId);
    if (!state || !state.connected) {
      return {
        success: false,
        content: [{ type: "text", text: `MCP server '${serverId}' not connected` }],
        isError: true,
      };
    }

    try {
      const result = await Promise.race([
        state.client.callTool({ name: toolName, arguments: args }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Tool call timeout")), this.toolTimeoutMs),
        ),
      ]);

      return {
        success: !result.isError,
        content: (result.content as McpCallToolResult["content"]) ?? [],
        isError: result.isError,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      state.lastError = errorMessage;
      return {
        success: false,
        content: [{ type: "text", text: `Tool call failed: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * Read a resource from an MCP server.
   */
  async readResource(
    serverId: string,
    uri: string,
  ): Promise<{ success: boolean; content?: string; mimeType?: string; error?: string }> {
    const state = this.clients.get(serverId);
    if (!state || !state.connected) {
      return { success: false, error: `MCP server '${serverId}' not connected` };
    }

    try {
      const result = await state.client.readResource({ uri });
      const content = result.contents[0];
      if (!content) {
        return { success: false, error: "No content returned" };
      }

      if ("text" in content) {
        return { success: true, content: content.text, mimeType: content.mimeType };
      }
      if ("blob" in content) {
        return { success: true, content: content.blob, mimeType: content.mimeType };
      }

      return { success: false, error: "Unknown content type" };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get connected server IDs.
   */
  getConnectedServerIds(): string[] {
    return Array.from(this.clients.entries())
      .filter(([_, state]) => state.connected)
      .map(([id]) => id);
  }

  /**
   * Get server state by ID.
   */
  getServerState(serverId: string): McpClientState | undefined {
    return this.clients.get(serverId);
  }

  /**
   * Find which server provides a tool by name.
   */
  findToolServer(toolName: string): { serverId: string; tool: McpToolInfo } | undefined {
    for (const state of this.clients.values()) {
      if (!state.connected) continue;
      const tool = state.tools.find((t) => t.name === toolName);
      if (tool) {
        return { serverId: state.config.id, tool };
      }
    }
    return undefined;
  }
}
