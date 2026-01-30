/**
 * MCP Server - exposes openbot tools as MCP endpoints.
 * Allows external MCP clients to call openbot's tools.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import type { AnyAgentTool } from "../agents/tools/common.js";

export type McpServerOptions = {
  /** Tools to expose via MCP */
  tools: AnyAgentTool[];
  /** Server name */
  name?: string;
  /** Server version */
  version?: string;
  /** Log function */
  log?: (msg: string) => void;
};

/**
 * Convert openbot tool to MCP tool definition.
 */
function toolToMcpDefinition(tool: AnyAgentTool) {
  return {
    name: tool.name,
    description: tool.description ?? `Tool: ${tool.name}`,
    inputSchema: tool.parameters ?? { type: "object", properties: {} },
  };
}

/**
 * Create and start an MCP server that exposes openbot tools.
 */
export async function createMcpServer(options: McpServerOptions): Promise<Server> {
  const { tools, name = "openbot", version = "1.0.0", log = () => {} } = options;

  const server = new Server({ name, version }, { capabilities: { tools: {}, resources: {} } });

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log(`[mcp-server] listing ${tools.length} tools`);
    return {
      tools: tools.map(toolToMcpDefinition),
    };
  });

  // Handle tool call request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;
    log(`[mcp-server] calling tool: ${toolName}`);

    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Tool not found: ${toolName}` }],
        isError: true,
      };
    }

    try {
      const toolCallId = `mcp-${Date.now()}`;
      const result = await tool.execute(toolCallId, args ?? {});

      // Format result for MCP
      if (typeof result === "string") {
        return { content: [{ type: "text", text: result }] };
      }

      if (result && typeof result === "object") {
        if ("content" in result) {
          const content = result.content;
          if (typeof content === "string") {
            return {
              content: [{ type: "text", text: content }],
              isError: "isError" in result ? Boolean(result.isError) : false,
            };
          }
          if (Array.isArray(content)) {
            return {
              content: content.map((c) => {
                if (typeof c === "string") return { type: "text", text: c };
                if (c && typeof c === "object" && "type" in c) return c;
                return { type: "text", text: JSON.stringify(c) };
              }),
              isError: "isError" in result ? Boolean(result.isError) : false,
            };
          }
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      return { content: [{ type: "text", text: String(result) }] };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log(`[mcp-server] tool error: ${errorMessage}`);
      return {
        content: [{ type: "text", text: `Tool error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Handle list resources (empty for now, can be extended)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: [] };
  });

  // Handle read resource (not implemented)
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return {
      contents: [
        {
          uri: request.params.uri,
          text: `Resource not found: ${request.params.uri}`,
          mimeType: "text/plain",
        },
      ],
    };
  });

  return server;
}

/**
 * Start an MCP server using stdio transport (for subprocess communication).
 */
export async function startMcpServerStdio(options: McpServerOptions): Promise<void> {
  const server = await createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  options.log?.(`[mcp-server] started via stdio`);
}

/**
 * Create an MCP server runner that can be used as a CLI command.
 */
export function createMcpServerRunner(getTools: () => AnyAgentTool[] | Promise<AnyAgentTool[]>) {
  return async (options?: { name?: string; version?: string; verbose?: boolean }) => {
    const log = options?.verbose ? (msg: string) => console.error(msg) : () => {};
    const tools = await getTools();
    log(`[mcp-server] loaded ${tools.length} tools`);
    await startMcpServerStdio({
      tools,
      name: options?.name ?? "openbot",
      version: options?.version ?? "1.0.0",
      log,
    });
  };
}
