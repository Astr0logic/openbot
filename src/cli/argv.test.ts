import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "openbot", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "openbot", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "openbot", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "openbot", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "openbot", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "openbot", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "openbot", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "openbot"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "openbot", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "openbot", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "openbot", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "openbot", "status", "--timeout=2500"], "--timeout")).toBe("2500");
    expect(getFlagValue(["node", "openbot", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "openbot", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "openbot", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "openbot", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "openbot", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "openbot", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "openbot", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "openbot", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "openbot", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "openbot", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["node", "openbot", "status"],
    });
    expect(nodeArgv).toEqual(["node", "openbot", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["node-22", "openbot", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "openbot", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["node-22.2.0.exe", "openbot", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "openbot", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["node-22.2", "openbot", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "openbot", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["node-22.2.exe", "openbot", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "openbot", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["/usr/bin/node-22.2.0", "openbot", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "openbot", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["nodejs", "openbot", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "openbot", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["node-dev", "openbot", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "openbot", "node-dev", "openbot", "status"]);

    const directArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["openbot", "status"],
    });
    expect(directArgv).toEqual(["node", "openbot", "status"]);

    const bunArgv = buildParseArgv({
      programName: "openbot",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "openbot",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "openbot", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "openbot", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "openbot", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "openbot", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "openbot", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "openbot", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "openbot", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "openbot", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
