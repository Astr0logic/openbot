# 🪼 OpenBot by Jellyfish Research Labs

> Bioluminescent intelligence, infinite reach.

This is the **JRL fork** of OpenClaw, rebranded and extended with distributed systems capabilities.

---

## Quick Start

```bash
# Install
pnpm install

# Run CLI
pnpm openbot --help

# Run gateway
pnpm openbot gateway run --port 18789
```

---

## What's Changed from Upstream

### Branding
| Component | Upstream | JRL Fork |
|-----------|----------|----------|
| CLI Name | `openclaw` | `openbot` (aliases: `jrl`, `jellyfish`) |
| ASCII Art | 🦞 Lobster | 🪼 Jellyfish |
| Color Palette | Orange/Red (#FF5A2D) | Cyan/Purple (#00D4FF) |
| Taglines | Claw puns | Swarm/distributed/research themes |

**Files Modified:**
- `src/cli/banner.ts` - Jellyfish ASCII art
- `src/cli/cli-name.ts` - CLI name + aliases
- `src/cli/tagline.ts` - 70+ JRL-themed taglines
- `src/terminal/palette.ts` - Bioluminescent color scheme

### MCP Integration (New Feature)

Full Model Context Protocol support for tool interoperability.

```
src/mcp/
├── client.ts         # Connect to external MCP servers (stdio/SSE/HTTP)
├── server.ts         # Expose openbot tools via MCP protocol
├── tool-adapter.ts   # Convert MCP tools ↔ openbot AgentTool format
├── acp-adapter.ts    # ACP protocol MCP server conversion
├── audit-log.ts      # Security audit logging (JSONL)
├── connection-pool.ts # Persistent connection pooling with LRU eviction
├── types.ts          # Type definitions
└── index.ts          # Unified exports
```

**Capabilities:**
- ✅ **MCP Client** - Connect to any MCP server
- ✅ **MCP Server** - Expose openbot tools to other MCP clients
- ✅ **Tool Wiring** - MCP tools available during agent execution
- ✅ **Audit Logging** - JSONL logs with auto-redaction
- ✅ **Connection Pooling** - Reuse connections with health checks

**Usage:**
```typescript
// Connect to external MCP server
import { McpClientManager, createAllMcpToolAdapters } from "./mcp/index.js";

const manager = new McpClientManager({ log: console.log });
await manager.connect({
  id: "filesystem",
  name: "Filesystem MCP",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem"],
});
const tools = createAllMcpToolAdapters(manager);

// Expose openbot tools via MCP
import { startMcpServerStdio } from "./mcp/index.js";
await startMcpServerStdio({ tools: myTools, name: "openbot" });

// Security audit logging
import { createDefaultAuditLogger } from "./mcp/index.js";
const logger = createDefaultAuditLogger();
logger.logRequest({ toolName: "read_file", args: { path: "/tmp/x" }, requestId: "abc" });
```

### Orchestration Layer (New Feature)

Multi-instance coordination for distributed openbot deployments.

```
src/orchestration/
├── orchestrator.ts    # Central coordinator for task management
├── worker-registry.ts # Track worker instances and health
├── task-router.ts     # Route tasks via configurable strategies
├── types.ts           # Type definitions
└── index.ts           # Unified exports
```

**Capabilities:**
- ✅ **Worker Registry** - Register/unregister worker instances
- ✅ **Health Monitoring** - Heartbeat-based health checks
- ✅ **Task Queue** - Priority-based task queuing
- ✅ **Routing Strategies** - Round-robin, least-loaded, capability-match, random
- ✅ **Task Lifecycle** - Timeouts, retries, completion tracking

**CLI Commands:**
```bash
# Start supervisor orchestrator
openbot orchestration supervisor --port 18800 --strategy least-loaded

# Check status
openbot orchestration status

# List workers
openbot orchestration workers
```

**Usage:**
```typescript
import { Orchestrator } from "./orchestration/index.js";

const orchestrator = new Orchestrator({
  routingStrategy: "least-loaded",
  heartbeatIntervalMs: 30_000,
  defaultTaskTimeoutMs: 60_000,
});

orchestrator.start();

// Register a worker
orchestrator.registerWorker({
  id: "worker-1",
  name: "Worker 1",
  endpoint: "http://localhost:18790",
  capabilities: ["chat", "code"],
  currentLoad: 0,
  maxLoad: 10,
});

// Submit a task
const task = orchestrator.submitTask({
  type: "chat",
  payload: { message: "Hello" },
  priority: "normal",
});
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     OPENBOT GATEWAY                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Channels  │  │    Agent    │  │    MCP Integration  │  │
│  │  (WhatsApp, │  │  Execution  │  │  ┌───────────────┐  │  │
│  │  Telegram,  │  │             │  │  │  MCP Client   │  │  │
│  │  Discord,   │  │  Pi Agent   │  │  │  (connect to  │  │  │
│  │  Signal,    │  │  + Tools    │  │  │  external)    │  │  │
│  │  etc.)      │  │             │  │  ├───────────────┤  │  │
│  └─────────────┘  └─────────────┘  │  │  MCP Server   │  │  │
│                                     │  │  (expose our  │  │  │
│  ┌─────────────┐  ┌─────────────┐  │  │  tools)       │  │  │
│  │   Config    │  │   Session   │  │  ├───────────────┤  │  │
│  │   System    │  │   Manager   │  │  │  Audit Log    │  │  │
│  │             │  │             │  │  │  (JSONL)      │  │  │
│  └─────────────┘  └─────────────┘  │  └───────────────┘  │  │
└─────────────────────────────────────────────────────────────┘
```

---

## TODO: Future Features

### High Priority

- [x] **Orchestration Layer** - Supervisor openbot managing fleet of worker instances
  - ✅ Multi-instance coordination
  - ✅ Task routing and load balancing
  - ✅ Health monitoring
  - [ ] Consensus protocols (future)

- [ ] **BitChat BLE Channel** - Mesh networking via Bluetooth Low Energy
  - Offline-first messaging
  - Peer discovery
  - Encrypted mesh routing

- [ ] **Signal Channel Hardening** - Enhanced E2E encryption
  - Already exists in `extensions/signal/`
  - Needs security audit

### Performance Optimizations

- [x] **MCP Connection Pooling** - Persistent connections with health checks
- [ ] **Tool Schema Caching** - Cache schemas with TTL
- [ ] **Audit Log Batching** - Buffer writes, flush periodically
- [x] **Session Lookup Index** - O(1) lookup by sessionKey

### Security Enhancements

- [ ] **Tool Allowlists** - Restrict MCP tools per session
- [ ] **Rate Limiting** - Throttle tool calls
- [ ] **Audit Log Rotation** - Auto-rotate by size/date
- [ ] **Encrypted Audit Logs** - Encrypt at rest
- [ ] **MCP Auth Profiles** - OAuth/API key rotation

### Developer Experience

- [x] **`openbot mcp serve`** - CLI command to start MCP server
- [x] **`openbot mcp connect`** - CLI to test MCP connections
- [x] **`openbot mcp list`** - List connected servers and tools
- [x] **`openbot mcp audit`** - View MCP audit logs
- [ ] **MCP Config in config.json5** - Persistent MCP server configs
- [ ] **Hot Reload** - Reconnect on config change

### Advanced Features

- [ ] **MCP Resource Providers** - Expose sessions/memory via MCP
- [ ] **Cross-Instance Tool Routing** - Call tools on remote openbots
- [ ] **Tool Sandboxing** - Run MCP tools in containers
- [ ] **Streaming Results** - Stream large tool outputs

---

## Commit History (JRL Changes)

```
ca1b0c2 feat(mcp): add security audit logging for MCP API calls
b30bb49 feat(mcp): add MCP server to expose openbot tools
74864c0 feat(mcp): wire MCP tools into agent execution
0304517 feat: add MCP (Model Context Protocol) client integration
9664c70 rebrand: use 'openbot' as CLI name
93e54f6 rebrand: Jellyfish Research Labs (JRL) branding
```

---

## Key Files for Agents

When continuing development, focus on:

| Area | Files |
|------|-------|
| **MCP Core** | `src/mcp/*.ts` |
| **Orchestration** | `src/orchestration/*.ts` |
| **Tool Injection** | `src/agents/pi-embedded-runner/run/attempt.ts:238-248` |
| **Session MCP** | `src/acp/session.ts`, `src/acp/translator.ts` |
| **CLI Commands** | `src/cli/mcp-cli.ts`, `src/cli/orchestration-cli.ts` |
| **Branding** | `src/cli/banner.ts`, `src/terminal/palette.ts` |
| **Channel Plugins** | `extensions/*/`, `src/channels/plugins/` |

---

## Development

```bash
# Install deps
pnpm install

# Lint
pnpm lint

# Build
pnpm build

# Test
pnpm test

# Dev mode
pnpm dev
```

---

## License

MIT - Forked from [OpenClaw](https://github.com/openclaw/openclaw)

---

*Jellyfish Research Labs - Drift deep, think deeper.* 🪼
