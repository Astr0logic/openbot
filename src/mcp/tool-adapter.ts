/**
 * Adapts MCP tools to openbot's AgentTool interface.
 * Converts JSON Schema from MCP to TypeBox and wraps tool calls.
 */

import { Type, type TObject, type TProperties } from "@sinclair/typebox";

import type { AnyAgentTool } from "../agents/tools/common.js";
import type { McpClientManager } from "./client.js";
import type { McpToolInfo } from "./types.js";

/**
 * Convert a JSON Schema property to TypeBox.
 * Handles common types; falls back to Type.Unknown for complex schemas.
 */
function jsonSchemaPropertyToTypebox(
  propName: string,
  propSchema: Record<string, unknown>,
  required: boolean,
): TProperties[string] {
  const description = propSchema.description as string | undefined;
  const baseOpts = description ? { description } : {};

  let baseType: TProperties[string];

  switch (propSchema.type) {
    case "string":
      if (propSchema.enum && Array.isArray(propSchema.enum)) {
        baseType = Type.Union(
          (propSchema.enum as string[]).map((v) => Type.Literal(v)),
          baseOpts,
        );
      } else {
        baseType = Type.String(baseOpts);
      }
      break;
    case "number":
    case "integer":
      baseType = Type.Number(baseOpts);
      break;
    case "boolean":
      baseType = Type.Boolean(baseOpts);
      break;
    case "array":
      if (propSchema.items && typeof propSchema.items === "object") {
        const itemType = jsonSchemaPropertyToTypebox(
          `${propName}Item`,
          propSchema.items as Record<string, unknown>,
          true,
        );
        baseType = Type.Array(itemType, baseOpts);
      } else {
        baseType = Type.Array(Type.Unknown(), baseOpts);
      }
      break;
    case "object":
      if (propSchema.properties && typeof propSchema.properties === "object") {
        const props = propSchema.properties as Record<string, Record<string, unknown>>;
        const requiredProps = (propSchema.required as string[]) ?? [];
        const nestedProps: TProperties = {};
        for (const [key, value] of Object.entries(props)) {
          nestedProps[key] = jsonSchemaPropertyToTypebox(key, value, requiredProps.includes(key));
        }
        baseType = Type.Object(nestedProps, baseOpts);
      } else {
        baseType = Type.Record(Type.String(), Type.Unknown(), baseOpts);
      }
      break;
    default:
      baseType = Type.Unknown(baseOpts);
  }

  return required ? baseType : Type.Optional(baseType);
}

/**
 * Convert an MCP tool's JSON Schema to TypeBox TObject.
 */
function mcpSchemaToTypebox(inputSchema: Record<string, unknown>): TObject {
  if (inputSchema.type !== "object" || !inputSchema.properties) {
    return Type.Object({});
  }

  const properties = inputSchema.properties as Record<string, Record<string, unknown>>;
  const required = (inputSchema.required as string[]) ?? [];

  const typeboxProps: TProperties = {};
  for (const [propName, propSchema] of Object.entries(properties)) {
    typeboxProps[propName] = jsonSchemaPropertyToTypebox(
      propName,
      propSchema,
      required.includes(propName),
    );
  }

  return Type.Object(typeboxProps);
}

/**
 * Format MCP tool result content into a string for the agent.
 */
function formatMcpResult(
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>,
): string {
  const parts: string[] = [];

  for (const item of content) {
    if (item.type === "text" && item.text) {
      parts.push(item.text);
    } else if (item.type === "image" && item.data) {
      parts.push(`[Image: ${item.mimeType ?? "image/png"}]`);
    } else if (item.type === "resource") {
      parts.push(`[Resource]`);
    }
  }

  return parts.join("\n\n") || "(no content)";
}

/**
 * Create an openbot AgentTool from an MCP tool.
 */
export function createMcpToolAdapter(
  mcpManager: McpClientManager,
  toolInfo: McpToolInfo,
): AnyAgentTool {
  const parameters = mcpSchemaToTypebox(toolInfo.inputSchema);
  // Prefix MCP tool names to avoid collisions with built-in tools
  const toolName = `mcp_${toolInfo.serverId}_${toolInfo.name}`;

  return {
    name: toolName,
    label: `${toolInfo.serverName}: ${toolInfo.name}`,
    description: toolInfo.description ?? `MCP tool '${toolInfo.name}' from ${toolInfo.serverName}`,
    parameters,
    execute: async (_toolCallId, args) => {
      const result = await mcpManager.callTool(
        toolInfo.serverId,
        toolInfo.name,
        args as Record<string, unknown>,
      );

      const text = formatMcpResult(result.content);

      if (result.isError || !result.success) {
        return {
          content: [{ type: "text" as const, text: `Error: ${text}` }],
          details: { error: true, raw: result.content },
        };
      }

      return {
        content: [{ type: "text" as const, text }],
        details: { raw: result.content },
      };
    },
  };
}

/**
 * Create AgentTools for all tools from all connected MCP servers.
 */
export function createAllMcpToolAdapters(mcpManager: McpClientManager): AnyAgentTool[] {
  const tools = mcpManager.getAllTools();
  return tools.map((toolInfo) => createMcpToolAdapter(mcpManager, toolInfo));
}

/**
 * Create a resource reading tool for MCP resources.
 */
export function createMcpResourceTool(mcpManager: McpClientManager): AnyAgentTool {
  return {
    name: "mcp_read_resource",
    label: "MCP Read Resource",
    description: "Read a resource from an MCP server by URI.",
    parameters: Type.Object({
      serverId: Type.String({ description: "The MCP server ID" }),
      uri: Type.String({ description: "The resource URI to read" }),
    }),
    execute: async (_toolCallId, args) => {
      const { serverId, uri } = args as { serverId: string; uri: string };
      const result = await mcpManager.readResource(serverId, uri);

      if (!result.success) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${result.error ?? "Failed to read resource"}` },
          ],
          details: { error: true, serverId, uri },
        };
      }

      return {
        content: [{ type: "text" as const, text: result.content ?? "(empty)" }],
        details: { serverId, uri },
      };
    },
  };
}

/**
 * Create a tool to list available MCP tools and resources.
 */
export function createMcpListTool(mcpManager: McpClientManager): AnyAgentTool {
  return {
    name: "mcp_list",
    label: "MCP List",
    description: "List available MCP servers, tools, and resources.",
    parameters: Type.Object({}),
    execute: async () => {
      const serverIds = mcpManager.getConnectedServerIds();
      const lines: string[] = [];
      const summary: { servers: number; tools: number; resources: number } = {
        servers: 0,
        tools: 0,
        resources: 0,
      };

      for (const serverId of serverIds) {
        const state = mcpManager.getServerState(serverId);
        if (!state) continue;

        summary.servers++;
        lines.push(`## ${state.config.name} (${serverId})`);
        lines.push("");

        if (state.tools.length > 0) {
          summary.tools += state.tools.length;
          lines.push("### Tools:");
          for (const tool of state.tools) {
            lines.push(`- **${tool.name}**: ${tool.description ?? "(no description)"}`);
          }
          lines.push("");
        }

        if (state.resources.length > 0) {
          summary.resources += state.resources.length;
          lines.push("### Resources:");
          for (const resource of state.resources) {
            lines.push(`- **${resource.uri}**: ${resource.description ?? resource.name}`);
          }
          lines.push("");
        }
      }

      if (lines.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No MCP servers connected." }],
          details: summary,
        };
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: summary,
      };
    },
  };
}
