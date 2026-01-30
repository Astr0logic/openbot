import type { SessionId } from "@agentclientprotocol/sdk";
<<<<<<< HEAD
=======

import type { McpClientManager } from "../mcp/client.js";
>>>>>>> 03045174c (feat: add MCP (Model Context Protocol) client integration)
import { VERSION } from "../version.js";

export type AcpSession = {
  sessionId: SessionId;
  sessionKey: string;
  cwd: string;
  createdAt: number;
  abortController: AbortController | null;
  activeRunId: string | null;
  /** MCP client manager for this session's MCP servers */
  mcpManager: McpClientManager | null;
};

export type AcpServerOptions = {
  gatewayUrl?: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  defaultSessionKey?: string;
  defaultSessionLabel?: string;
  requireExistingSession?: boolean;
  resetSession?: boolean;
  prefixCwd?: boolean;
  verbose?: boolean;
};

export const ACP_AGENT_INFO = {
  name: "openclaw-acp",
  title: "OpenClaw ACP Gateway",
  version: VERSION,
};
