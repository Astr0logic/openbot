/**
 * MCP Connection Pool - Manages persistent MCP connections across sessions.
 * Provides connection reuse, health checking, and automatic reconnection.
 */

import { McpClientManager } from "./client.js";
import type { McpServerConfig } from "./types.js";

export type PooledConnection = {
  manager: McpClientManager;
  config: McpServerConfig;
  lastUsed: number;
  refCount: number;
  healthy: boolean;
};

export type ConnectionPoolOptions = {
  /** Maximum idle time before disconnecting (ms) */
  maxIdleMs?: number;
  /** Health check interval (ms) */
  healthCheckIntervalMs?: number;
  /** Maximum connections to pool */
  maxConnections?: number;
  /** Log function */
  log?: (msg: string) => void;
};

const DEFAULT_MAX_IDLE_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_CONNECTIONS = 50;

/**
 * Global MCP connection pool for reusing connections across sessions.
 */
export class McpConnectionPool {
  private connections = new Map<string, PooledConnection>();
  private options: Required<ConnectionPoolOptions>;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: ConnectionPoolOptions = {}) {
    this.options = {
      maxIdleMs: options.maxIdleMs ?? DEFAULT_MAX_IDLE_MS,
      healthCheckIntervalMs: options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS,
      maxConnections: options.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
      log: options.log ?? (() => {}),
    };

    this.startBackgroundTasks();
  }

  private startBackgroundTasks(): void {
    // Periodic health check
    this.healthCheckTimer = setInterval(() => {
      void this.checkHealth();
    }, this.options.healthCheckIntervalMs);

    // Periodic cleanup of idle connections
    this.cleanupTimer = setInterval(() => {
      void this.cleanupIdle();
    }, this.options.maxIdleMs / 2);
  }

  /**
   * Get or create a connection to an MCP server.
   */
  async acquire(config: McpServerConfig): Promise<McpClientManager> {
    const key = this.configKey(config);

    // Check for existing connection
    const existing = this.connections.get(key);
    if (existing && existing.healthy) {
      existing.refCount++;
      existing.lastUsed = Date.now();
      this.options.log(`[mcp-pool] reusing connection: ${config.name}`);
      return existing.manager;
    }

    // Remove unhealthy connection if exists
    if (existing && !existing.healthy) {
      await this.removeConnection(key);
    }

    // Check pool capacity
    if (this.connections.size >= this.options.maxConnections) {
      await this.evictLeastRecentlyUsed();
    }

    // Create new connection
    this.options.log(`[mcp-pool] creating connection: ${config.name}`);
    const manager = new McpClientManager({ log: this.options.log });
    await manager.connect(config);

    const pooled: PooledConnection = {
      manager,
      config,
      lastUsed: Date.now(),
      refCount: 1,
      healthy: true,
    };

    this.connections.set(key, pooled);
    return manager;
  }

  /**
   * Release a connection back to the pool.
   */
  release(config: McpServerConfig): void {
    const key = this.configKey(config);
    const pooled = this.connections.get(key);
    if (pooled) {
      pooled.refCount = Math.max(0, pooled.refCount - 1);
      pooled.lastUsed = Date.now();
    }
  }

  /**
   * Get pool statistics.
   */
  stats(): {
    total: number;
    healthy: number;
    active: number;
    idle: number;
  } {
    let healthy = 0;
    let active = 0;
    let idle = 0;

    for (const conn of this.connections.values()) {
      if (conn.healthy) healthy++;
      if (conn.refCount > 0) active++;
      else idle++;
    }

    return {
      total: this.connections.size,
      healthy,
      active,
      idle,
    };
  }

  /**
   * Check health of all connections.
   */
  private async checkHealth(): Promise<void> {
    for (const [_key, pooled] of this.connections.entries()) {
      try {
        // Simple health check: try to list tools
        const tools = pooled.manager.getAllTools();
        pooled.healthy = tools !== undefined;
      } catch {
        this.options.log(`[mcp-pool] unhealthy: ${pooled.config.name}`);
        pooled.healthy = false;
      }
    }
  }

  /**
   * Clean up idle connections.
   */
  private async cleanupIdle(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [key, pooled] of this.connections.entries()) {
      if (pooled.refCount === 0 && now - pooled.lastUsed > this.options.maxIdleMs) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      this.options.log(`[mcp-pool] removing idle: ${this.connections.get(key)?.config.name}`);
      await this.removeConnection(key);
    }
  }

  /**
   * Evict least recently used connection.
   */
  private async evictLeastRecentlyUsed(): Promise<void> {
    let oldest: { key: string; lastUsed: number } | null = null;

    for (const [key, pooled] of this.connections.entries()) {
      // Only evict idle connections
      if (pooled.refCount === 0) {
        if (!oldest || pooled.lastUsed < oldest.lastUsed) {
          oldest = { key, lastUsed: pooled.lastUsed };
        }
      }
    }

    if (oldest) {
      this.options.log(`[mcp-pool] evicting LRU: ${this.connections.get(oldest.key)?.config.name}`);
      await this.removeConnection(oldest.key);
    }
  }

  /**
   * Remove a connection from the pool.
   */
  private async removeConnection(key: string): Promise<void> {
    const pooled = this.connections.get(key);
    if (pooled) {
      try {
        await pooled.manager.disconnectAll();
      } catch {
        // Ignore disconnect errors
      }
      this.connections.delete(key);
    }
  }

  /**
   * Generate a unique key for a config.
   */
  private configKey(config: McpServerConfig): string {
    if (config.transport === "stdio") {
      return `stdio:${config.command}:${(config.args ?? []).join(",")}`;
    }
    return `${config.transport}:${config.url}`;
  }

  /**
   * Shutdown the pool and close all connections.
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const key of this.connections.keys()) {
      await this.removeConnection(key);
    }
  }
}

// Global singleton pool
let globalPool: McpConnectionPool | null = null;

/**
 * Get the global MCP connection pool.
 */
export function getGlobalMcpPool(options?: ConnectionPoolOptions): McpConnectionPool {
  if (!globalPool) {
    globalPool = new McpConnectionPool(options);
  }
  return globalPool;
}

/**
 * Shutdown the global pool.
 */
export async function shutdownGlobalMcpPool(): Promise<void> {
  if (globalPool) {
    await globalPool.shutdown();
    globalPool = null;
  }
}
