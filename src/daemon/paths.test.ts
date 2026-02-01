import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".openbot"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", OPENBOT_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".openbot-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", OPENBOT_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".openbot"));
  });

  it("uses OPENBOT_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", OPENBOT_STATE_DIR: "/var/lib/openbot" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/openbot"));
  });

  it("expands ~ in OPENBOT_STATE_DIR", () => {
    const env = { HOME: "/Users/test", OPENBOT_STATE_DIR: "~/openbot-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/openbot-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { OPENBOT_STATE_DIR: "C:\\State\\openbot" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\openbot");
  });
});
