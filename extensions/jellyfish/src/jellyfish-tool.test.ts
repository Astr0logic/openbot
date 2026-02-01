import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "../../../src/plugins/types.js";
import { createJellyfishTool } from "./jellyfish-tool.js";

async function writeFakeJellyfishScript(scriptBody: string, prefix = "openclaw-jellyfish-plugin-") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const isWindows = process.platform === "win32";

  if (isWindows) {
    const scriptPath = path.join(dir, "jellyfish.js");
    const cmdPath = path.join(dir, "jellyfish.cmd");
    await fs.writeFile(scriptPath, scriptBody, { encoding: "utf8" });
    const cmd = `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`;
    await fs.writeFile(cmdPath, cmd, { encoding: "utf8" });
    return { dir, binPath: cmdPath };
  }

  const binPath = path.join(dir, "jellyfish");
  const file = `#!/usr/bin/env node\n${scriptBody}\n`;
  await fs.writeFile(binPath, file, { encoding: "utf8", mode: 0o755 });
  return { dir, binPath };
}

async function writeFakeJellyfish(params: { payload: unknown }) {
  const scriptBody =
    `const payload = ${JSON.stringify(params.payload)};\n` +
    `process.stdout.write(JSON.stringify(payload));\n`;
  return await writeFakeJellyfishScript(scriptBody);
}

function fakeApi(overrides: Partial<OpenClawPluginApi> = {}): OpenClawPluginApi {
  return {
    id: "jellyfish",
    name: "jellyfish",
    source: "test",
    config: {} as any,
    pluginConfig: {},
    runtime: { version: "test" } as any,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool() {},
    registerHttpHandler() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerService() {},
    registerProvider() {},
    registerHook() {},
    registerHttpRoute() {},
    registerCommand() {},
    on() {},
    resolvePath: (p) => p,
    ...overrides,
  };
}

function fakeCtx(overrides: Partial<OpenClawPluginToolContext> = {}): OpenClawPluginToolContext {
  return {
    config: {} as any,
    workspaceDir: "/tmp",
    agentDir: "/tmp",
    agentId: "main",
    sessionKey: "main",
    messageChannel: undefined,
    agentAccountId: undefined,
    sandboxed: false,
    ...overrides,
  };
}

describe("jellyfish plugin tool", () => {
  it("runs jellyfish and returns parsed envelope in details", async () => {
    const fake = await writeFakeJellyfish({
      payload: { ok: true, status: "ok", output: [{ hello: "world" }], requiresApproval: null },
    });

    const originalPath = process.env.PATH;
    process.env.PATH = `${fake.dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createJellyfishTool(fakeApi());
      const res = await tool.execute("call1", {
        action: "run",
        pipeline: "noop",
        timeoutMs: 1000,
      });

      expect(res.details).toMatchObject({ ok: true, status: "ok" });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("tolerates noisy stdout before the JSON envelope", async () => {
    const payload = { ok: true, status: "ok", output: [], requiresApproval: null };
    const { dir } = await writeFakeJellyfishScript(
      `const payload = ${JSON.stringify(payload)};\n` +
        `console.log("noise before json");\n` +
        `process.stdout.write(JSON.stringify(payload));\n`,
      "openclaw-jellyfish-plugin-noisy-",
    );

    const originalPath = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createJellyfishTool(fakeApi());
      const res = await tool.execute("call-noisy", {
        action: "run",
        pipeline: "noop",
        timeoutMs: 1000,
      });

      expect(res.details).toMatchObject({ ok: true, status: "ok" });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("requires absolute jellyfishPath when provided (even though it is ignored)", async () => {
    const fake = await writeFakeJellyfish({
      payload: { ok: true, status: "ok", output: [{ hello: "world" }], requiresApproval: null },
    });

    const originalPath = process.env.PATH;
    process.env.PATH = `${fake.dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createJellyfishTool(fakeApi());
      await expect(
        tool.execute("call2", {
          action: "run",
          pipeline: "noop",
          jellyfishPath: "./jellyfish",
        }),
      ).rejects.toThrow(/absolute path/);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("rejects jellyfishPath (deprecated) when invalid", async () => {
    const fake = await writeFakeJellyfish({
      payload: { ok: true, status: "ok", output: [{ hello: "world" }], requiresApproval: null },
    });

    const originalPath = process.env.PATH;
    process.env.PATH = `${fake.dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createJellyfishTool(fakeApi());
      await expect(
        tool.execute("call2b", {
          action: "run",
          pipeline: "noop",
          jellyfishPath: "/bin/bash",
        }),
      ).rejects.toThrow(/jellyfish executable/);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("rejects absolute cwd", async () => {
    const tool = createJellyfishTool(fakeApi());
    await expect(
      tool.execute("call2c", {
        action: "run",
        pipeline: "noop",
        cwd: "/tmp",
      }),
    ).rejects.toThrow(/cwd must be a relative path/);
  });

  it("rejects cwd that escapes the gateway working directory", async () => {
    const tool = createJellyfishTool(fakeApi());
    await expect(
      tool.execute("call2d", {
        action: "run",
        pipeline: "noop",
        cwd: "../../etc",
      }),
    ).rejects.toThrow(/must stay within/);
  });

  it("uses pluginConfig.jellyfishPath when provided", async () => {
    const fake = await writeFakeJellyfish({
      payload: { ok: true, status: "ok", output: [{ hello: "world" }], requiresApproval: null },
    });

    // Ensure `jellyfish` is NOT discoverable via PATH, while still allowing our
    // fake jellyfish (a Node script with `#!/usr/bin/env node`) to run.
    const originalPath = process.env.PATH;
    process.env.PATH = path.dirname(process.execPath);

    try {
      const tool = createJellyfishTool(fakeApi({ pluginConfig: { jellyfishPath: fake.binPath } }));
      const res = await tool.execute("call-plugin-config", {
        action: "run",
        pipeline: "noop",
        timeoutMs: 1000,
      });

      expect(res.details).toMatchObject({ ok: true, status: "ok" });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("rejects invalid JSON from jellyfish", async () => {
    const { dir } = await writeFakeJellyfishScript(
      `process.stdout.write("nope");\n`,
      "openclaw-jellyfish-plugin-bad-",
    );

    const originalPath = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createJellyfishTool(fakeApi());
      await expect(
        tool.execute("call3", {
          action: "run",
          pipeline: "noop",
        }),
      ).rejects.toThrow(/invalid JSON/);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("can be gated off in sandboxed contexts", async () => {
    const api = fakeApi();
    const factoryTool = (ctx: OpenClawPluginToolContext) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createJellyfishTool(api);
    };

    expect(factoryTool(fakeCtx({ sandboxed: true }))).toBeNull();
    expect(factoryTool(fakeCtx({ sandboxed: false }))?.name).toBe("jellyfish");
  });
});
