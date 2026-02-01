import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

type JellyfishEnvelope =
  | {
      ok: true;
      status: "ok" | "needs_approval" | "cancelled";
      output: unknown[];
      requiresApproval: null | {
        type: "approval_request";
        prompt: string;
        items: unknown[];
        resumeToken?: string;
      };
    }
  | {
      ok: false;
      error: { type?: string; message: string };
    };

function resolveExecutablePath(jellyfishPathRaw: string | undefined) {
  const jellyfishPath = jellyfishPathRaw?.trim() || "jellyfish";

  // SECURITY:
  // Never allow arbitrary executables (e.g. /bin/bash). If the caller overrides
  // the path, it must still be the jellyfish binary (by name) and be absolute.
  if (jellyfishPath !== "jellyfish") {
    if (!path.isAbsolute(jellyfishPath)) {
      throw new Error("jellyfishPath must be an absolute path (or omit to use PATH)");
    }
    const base = path.basename(jellyfishPath).toLowerCase();
    const allowed =
      process.platform === "win32" ? ["jellyfish.exe", "jellyfish.cmd", "jellyfish.bat"] : ["jellyfish"];
    if (!allowed.includes(base)) {
      throw new Error("jellyfishPath must point to the jellyfish executable");
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(jellyfishPath);
    } catch {
      throw new Error("jellyfishPath must exist");
    }
    if (!stat.isFile()) {
      throw new Error("jellyfishPath must point to a file");
    }
    if (process.platform !== "win32") {
      try {
        fs.accessSync(jellyfishPath, fs.constants.X_OK);
      } catch {
        throw new Error("jellyfishPath must be executable");
      }
    }
  }

  return jellyfishPath;
}

function normalizeForCwdSandbox(p: string): string {
  const normalized = path.normalize(p);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function resolveCwd(cwdRaw: unknown): string {
  if (typeof cwdRaw !== "string" || !cwdRaw.trim()) {
    return process.cwd();
  }
  const cwd = cwdRaw.trim();
  if (path.isAbsolute(cwd)) {
    throw new Error("cwd must be a relative path");
  }
  const base = process.cwd();
  const resolved = path.resolve(base, cwd);

  const rel = path.relative(normalizeForCwdSandbox(base), normalizeForCwdSandbox(resolved));
  if (rel === "" || rel === ".") {
    return resolved;
  }
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("cwd must stay within the gateway working directory");
  }
  return resolved;
}

function isWindowsSpawnErrorThatCanUseShell(err: unknown) {
  if (!err || typeof err !== "object") {
    return false;
  }
  const code = (err as { code?: unknown }).code;

  // On Windows, spawning scripts discovered on PATH (e.g. jellyfish.cmd) can fail
  // with EINVAL, and PATH discovery itself can fail with ENOENT when the binary
  // is only available via PATHEXT/script wrappers.
  return code === "EINVAL" || code === "ENOENT";
}

async function runJellyfishSubprocessOnce(
  params: {
    execPath: string;
    argv: string[];
    cwd: string;
    timeoutMs: number;
    maxStdoutBytes: number;
  },
  useShell: boolean,
) {
  const { execPath, argv, cwd } = params;
  const timeoutMs = Math.max(200, params.timeoutMs);
  const maxStdoutBytes = Math.max(1024, params.maxStdoutBytes);

  const env = { ...process.env, JELLYFISH_MODE: "tool" } as Record<string, string | undefined>;
  const nodeOptions = env.NODE_OPTIONS ?? "";
  if (nodeOptions.includes("--inspect")) {
    delete env.NODE_OPTIONS;
  }

  return await new Promise<{ stdout: string }>((resolve, reject) => {
    const child = spawn(execPath, argv, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env,
      shell: useShell,
      windowsHide: useShell ? true : undefined,
    });

    let stdout = "";
    let stdoutBytes = 0;
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk) => {
      const str = String(chunk);
      stdoutBytes += Buffer.byteLength(str, "utf8");
      if (stdoutBytes > maxStdoutBytes) {
        try {
          child.kill("SIGKILL");
        } finally {
          reject(new Error("jellyfish output exceeded maxStdoutBytes"));
        }
        return;
      }
      stdout += str;
    });

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } finally {
        reject(new Error("jellyfish subprocess timed out"));
      }
    }, timeoutMs);

    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`jellyfish failed (${code ?? "?"}): ${stderr.trim() || stdout.trim()}`));
        return;
      }
      resolve({ stdout });
    });
  });
}

async function runJellyfishSubprocess(params: {
  execPath: string;
  argv: string[];
  cwd: string;
  timeoutMs: number;
  maxStdoutBytes: number;
}) {
  try {
    return await runJellyfishSubprocessOnce(params, false);
  } catch (err) {
    if (process.platform === "win32" && isWindowsSpawnErrorThatCanUseShell(err)) {
      return await runJellyfishSubprocessOnce(params, true);
    }
    throw err;
  }
}

function parseEnvelope(stdout: string): JellyfishEnvelope {
  const trimmed = stdout.trim();

  const tryParse = (input: string) => {
    try {
      return JSON.parse(input) as unknown;
    } catch {
      return undefined;
    }
  };

  let parsed: unknown = tryParse(trimmed);

  // Some environments can leak extra stdout (e.g. warnings/logs) before the
  // final JSON envelope. Be tolerant and parse the last JSON-looking suffix.
  if (parsed === undefined) {
    const suffixMatch = trimmed.match(/({[\s\S]*}|\[[\s\S]*])\s*$/);
    if (suffixMatch?.[1]) {
      parsed = tryParse(suffixMatch[1]);
    }
  }

  if (parsed === undefined) {
    throw new Error("jellyfish returned invalid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("jellyfish returned invalid JSON envelope");
  }

  const ok = (parsed as { ok?: unknown }).ok;
  if (ok === true || ok === false) {
    return parsed as JellyfishEnvelope;
  }

  throw new Error("jellyfish returned invalid JSON envelope");
}

export function createJellyfishTool(api: OpenClawPluginApi) {
  return {
    name: "jellyfish",
    description:
      "Run Jellyfish pipelines as a local-first workflow runtime (typed JSON envelope + resumable approvals).",
    parameters: Type.Object({
      // NOTE: Prefer string enums in tool schemas; some providers reject unions/anyOf.
      action: Type.Unsafe<"run" | "resume">({ type: "string", enum: ["run", "resume"] }),
      pipeline: Type.Optional(Type.String()),
      argsJson: Type.Optional(Type.String()),
      token: Type.Optional(Type.String()),
      approve: Type.Optional(Type.Boolean()),
      // SECURITY: Do not allow the agent to choose an executable path.
      // Host can configure the jellyfish binary via plugin config.
      jellyfishPath: Type.Optional(
        Type.String({ description: "(deprecated) Use plugin config instead." }),
      ),
      cwd: Type.Optional(
        Type.String({
          description:
            "Relative working directory (optional). Must stay within the gateway working directory.",
        }),
      ),
      timeoutMs: Type.Optional(Type.Number()),
      maxStdoutBytes: Type.Optional(Type.Number()),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const action = typeof params.action === "string" ? params.action.trim() : "";
      if (!action) {
        throw new Error("action required");
      }

      // SECURITY: never allow tool callers (agent/user) to select executables.
      // If a host needs to override the binary, it must do so via plugin config.
      // We still validate the parameter shape to prevent reintroducing an RCE footgun.
      if (typeof params.jellyfishPath === "string" && params.jellyfishPath.trim()) {
        resolveExecutablePath(params.jellyfishPath);
      }

      const execPath = resolveExecutablePath(
        typeof api.pluginConfig?.jellyfishPath === "string"
          ? api.pluginConfig.jellyfishPath
          : undefined,
      );
      const cwd = resolveCwd(params.cwd);
      const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 20_000;
      const maxStdoutBytes =
        typeof params.maxStdoutBytes === "number" ? params.maxStdoutBytes : 512_000;

      const argv = (() => {
        if (action === "run") {
          const pipeline = typeof params.pipeline === "string" ? params.pipeline : "";
          if (!pipeline.trim()) {
            throw new Error("pipeline required");
          }
          const argv = ["run", "--mode", "tool", pipeline];
          const argsJson = typeof params.argsJson === "string" ? params.argsJson : "";
          if (argsJson.trim()) {
            argv.push("--args-json", argsJson);
          }
          return argv;
        }
        if (action === "resume") {
          const token = typeof params.token === "string" ? params.token : "";
          if (!token.trim()) {
            throw new Error("token required");
          }
          const approve = params.approve;
          if (typeof approve !== "boolean") {
            throw new Error("approve required");
          }
          return ["resume", "--token", token, "--approve", approve ? "yes" : "no"];
        }
        throw new Error(`Unknown action: ${action}`);
      })();

      if (api.runtime?.version && api.logger?.debug) {
        api.logger.debug(`jellyfish plugin runtime=${api.runtime.version}`);
      }

      const { stdout } = await runJellyfishSubprocess({
        execPath,
        argv,
        cwd,
        timeoutMs,
        maxStdoutBytes,
      });

      const envelope = parseEnvelope(stdout);

      return {
        content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
        details: envelope,
      };
    },
  };
}
