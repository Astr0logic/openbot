/**
 * MCP Audit Logger - Security audit logging for API requests in/out.
 * Logs all MCP tool calls and results to JSONL format for compliance and debugging.
 */

import fs from "node:fs";
import path from "node:path";

export type AuditLogEntry = {
  timestamp: string;
  type: "request" | "response" | "error";
  direction: "inbound" | "outbound";
  serverId?: string;
  serverName?: string;
  toolName?: string;
  /** Request arguments (sanitized) */
  args?: Record<string, unknown>;
  /** Response content (sanitized) */
  result?: unknown;
  /** Error message if applicable */
  error?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Session identifier */
  sessionId?: string;
  /** Request ID for correlation */
  requestId?: string;
};

export type AuditLoggerOptions = {
  /** Path to the JSONL log file */
  logPath: string;
  /** Whether to redact sensitive fields */
  redactSensitive?: boolean;
  /** Fields to redact (default: password, token, key, secret, auth, credential) */
  redactFields?: string[];
  /** Maximum size of logged values (truncates if exceeded) */
  maxValueLength?: number;
  /** Whether logging is enabled */
  enabled?: boolean;
};

const DEFAULT_REDACT_FIELDS = [
  "password",
  "token",
  "key",
  "secret",
  "auth",
  "credential",
  "api_key",
  "apikey",
  "bearer",
  "authorization",
];

const DEFAULT_MAX_VALUE_LENGTH = 10000;

/**
 * Redact sensitive fields from an object.
 */
function redactObject(
  obj: Record<string, unknown>,
  redactFields: string[],
  maxLength: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lowerFields = redactFields.map((f) => f.toLowerCase());

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Check if field should be redacted
    if (lowerFields.some((f) => lowerKey.includes(f))) {
      result[key] = "[REDACTED]";
      continue;
    }

    // Recursively redact nested objects
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>, redactFields, maxLength);
      continue;
    }

    // Truncate long strings
    if (typeof value === "string" && value.length > maxLength) {
      result[key] = value.slice(0, maxLength) + `... [truncated ${value.length - maxLength} chars]`;
      continue;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (item && typeof item === "object") {
          return redactObject(item as Record<string, unknown>, redactFields, maxLength);
        }
        if (typeof item === "string" && item.length > maxLength) {
          return item.slice(0, maxLength) + `... [truncated]`;
        }
        return item;
      });
      continue;
    }

    result[key] = value;
  }

  return result;
}

/**
 * MCP Audit Logger - writes security audit logs to JSONL file.
 */
export class McpAuditLogger {
  private options: Required<AuditLoggerOptions>;
  private writeStream: fs.WriteStream | null = null;

  constructor(options: AuditLoggerOptions) {
    this.options = {
      logPath: options.logPath,
      redactSensitive: options.redactSensitive ?? true,
      redactFields: options.redactFields ?? DEFAULT_REDACT_FIELDS,
      maxValueLength: options.maxValueLength ?? DEFAULT_MAX_VALUE_LENGTH,
      enabled: options.enabled ?? true,
    };

    if (this.options.enabled) {
      this.ensureLogDir();
    }
  }

  private ensureLogDir(): void {
    const dir = path.dirname(this.options.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private getWriteStream(): fs.WriteStream {
    if (!this.writeStream) {
      this.writeStream = fs.createWriteStream(this.options.logPath, { flags: "a" });
    }
    return this.writeStream;
  }

  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    if (!this.options.redactSensitive) return data;
    return redactObject(data, this.options.redactFields, this.options.maxValueLength);
  }

  /**
   * Log an entry to the audit log.
   */
  log(entry: AuditLogEntry): void {
    if (!this.options.enabled) return;

    const sanitizedEntry: AuditLogEntry = {
      ...entry,
      args: entry.args ? this.sanitize(entry.args) : undefined,
      result:
        entry.result && typeof entry.result === "object"
          ? this.sanitize(entry.result as Record<string, unknown>)
          : entry.result,
    };

    const line = JSON.stringify(sanitizedEntry) + "\n";
    this.getWriteStream().write(line);
  }

  /**
   * Log an inbound tool call request.
   */
  logRequest(params: {
    serverId?: string;
    serverName?: string;
    toolName: string;
    args: Record<string, unknown>;
    sessionId?: string;
    requestId: string;
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: "request",
      direction: "inbound",
      ...params,
    });
  }

  /**
   * Log an outbound tool call response.
   */
  logResponse(params: {
    serverId?: string;
    serverName?: string;
    toolName: string;
    result: unknown;
    durationMs: number;
    sessionId?: string;
    requestId: string;
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: "response",
      direction: "outbound",
      ...params,
    });
  }

  /**
   * Log a tool call error.
   */
  logError(params: {
    serverId?: string;
    serverName?: string;
    toolName: string;
    error: string;
    durationMs?: number;
    sessionId?: string;
    requestId: string;
  }): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: "error",
      direction: "outbound",
      ...params,
    });
  }

  /**
   * Close the audit logger.
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

/**
 * Create an audit logger with default path in ~/.openbot/audit/
 */
export function createDefaultAuditLogger(options?: Partial<AuditLoggerOptions>): McpAuditLogger {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  const defaultPath = path.join(homeDir, ".openbot", "audit", "mcp-audit.jsonl");

  return new McpAuditLogger({
    logPath: options?.logPath ?? defaultPath,
    ...options,
  });
}
