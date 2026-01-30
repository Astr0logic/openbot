import { randomUUID } from "node:crypto";

import type { McpClientManager } from "../mcp/client.js";
import type { AcpSession } from "./types.js";

export type AcpSessionStore = {
  createSession: (params: { sessionKey: string; cwd: string; sessionId?: string }) => AcpSession;
  getSession: (sessionId: string) => AcpSession | undefined;
  getSessionByRunId: (runId: string) => AcpSession | undefined;
  setActiveRun: (sessionId: string, runId: string, abortController: AbortController) => void;
  clearActiveRun: (sessionId: string) => void;
  cancelActiveRun: (sessionId: string) => boolean;
  setMcpManager: (sessionId: string, mcpManager: McpClientManager) => void;
  getMcpManager: (sessionId: string) => McpClientManager | null;
  clearAllSessionsForTest: () => void;
};

export function createInMemorySessionStore(): AcpSessionStore {
  const sessions = new Map<string, AcpSession>();
  const runIdToSessionId = new Map<string, string>();

  const createSession: AcpSessionStore["createSession"] = (params) => {
    const sessionId = params.sessionId ?? randomUUID();
    const session: AcpSession = {
      sessionId,
      sessionKey: params.sessionKey,
      cwd: params.cwd,
      createdAt: Date.now(),
      abortController: null,
      activeRunId: null,
      mcpManager: null,
    };
    sessions.set(sessionId, session);
    return session;
  };

  const getSession: AcpSessionStore["getSession"] = (sessionId) => sessions.get(sessionId);

  const getSessionByRunId: AcpSessionStore["getSessionByRunId"] = (runId) => {
    const sessionId = runIdToSessionId.get(runId);
    return sessionId ? sessions.get(sessionId) : undefined;
  };

  const setActiveRun: AcpSessionStore["setActiveRun"] = (sessionId, runId, abortController) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.activeRunId = runId;
    session.abortController = abortController;
    runIdToSessionId.set(runId, sessionId);
  };

  const clearActiveRun: AcpSessionStore["clearActiveRun"] = (sessionId) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.activeRunId) runIdToSessionId.delete(session.activeRunId);
    session.activeRunId = null;
    session.abortController = null;
  };

  const cancelActiveRun: AcpSessionStore["cancelActiveRun"] = (sessionId) => {
    const session = sessions.get(sessionId);
    if (!session?.abortController) return false;
    session.abortController.abort();
    if (session.activeRunId) runIdToSessionId.delete(session.activeRunId);
    session.abortController = null;
    session.activeRunId = null;
    return true;
  };

  const setMcpManager: AcpSessionStore["setMcpManager"] = (sessionId, mcpManager) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.mcpManager = mcpManager;
  };

  const getMcpManager: AcpSessionStore["getMcpManager"] = (sessionId) => {
    const session = sessions.get(sessionId);
    return session?.mcpManager ?? null;
  };

  const clearAllSessionsForTest: AcpSessionStore["clearAllSessionsForTest"] = () => {
    for (const session of sessions.values()) {
      session.abortController?.abort();
      void session.mcpManager?.disconnectAll();
    }
    sessions.clear();
    runIdToSessionId.clear();
  };

  return {
    createSession,
    getSession,
    getSessionByRunId,
    setActiveRun,
    clearActiveRun,
    cancelActiveRun,
    setMcpManager,
    getMcpManager,
    clearAllSessionsForTest,
  };
}

export const defaultAcpSessionStore = createInMemorySessionStore();
