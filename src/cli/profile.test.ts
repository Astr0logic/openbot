import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "openbot",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "openbot", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "openbot", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "openbot", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "openbot", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "openbot", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "openbot", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "openbot", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "openbot", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join("/home/peter", ".openbot-dev");
    expect(env.OPENBOT_PROFILE).toBe("dev");
    expect(env.OPENBOT_STATE_DIR).toBe(expectedStateDir);
    expect(env.OPENBOT_CONFIG_PATH).toBe(path.join(expectedStateDir, "openbot.json"));
    expect(env.OPENBOT_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      OPENBOT_STATE_DIR: "/custom",
      OPENBOT_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.OPENBOT_STATE_DIR).toBe("/custom");
    expect(env.OPENBOT_GATEWAY_PORT).toBe("19099");
    expect(env.OPENBOT_CONFIG_PATH).toBe(path.join("/custom", "openbot.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("openbot doctor --fix", {})).toBe("openbot doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("openbot doctor --fix", { OPENBOT_PROFILE: "default" })).toBe(
      "openbot doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("openbot doctor --fix", { OPENBOT_PROFILE: "Default" })).toBe(
      "openbot doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("openbot doctor --fix", { OPENBOT_PROFILE: "bad profile" })).toBe(
      "openbot doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("openbot --profile work doctor --fix", { OPENBOT_PROFILE: "work" }),
    ).toBe("openbot --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("openbot --dev doctor", { OPENBOT_PROFILE: "dev" })).toBe(
      "openbot --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("openbot doctor --fix", { OPENBOT_PROFILE: "work" })).toBe(
      "openbot --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("openbot doctor --fix", { OPENBOT_PROFILE: "  jbopenbot  " })).toBe(
      "openbot --profile jbopenbot doctor --fix",
    );
  });

  it("handles command with no args after openbot", () => {
    expect(formatCliCommand("openbot", { OPENBOT_PROFILE: "test" })).toBe("openbot --profile test");
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm openbot doctor", { OPENBOT_PROFILE: "work" })).toBe(
      "pnpm openbot --profile work doctor",
    );
  });
});
