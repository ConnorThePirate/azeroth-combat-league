import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { findWowExe, launchGame, runWithWow } from "../src/lifecycle.js";

describe("findWowExe", () => {
  it("finds common client exe names", () => {
    const dir = mkdtempSync(join(tmpdir(), "acl-life-"));
    writeFileSync(join(dir, "Wow.exe"), "");
    writeFileSync(join(dir, "readme.txt"), "");
    expect(findWowExe(dir)).toBe(join(dir, "Wow.exe"));
  });

  it("returns null when no exe exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "acl-life-"));
    mkdirSync(join(dir, "Interface"));
    expect(findWowExe(dir)).toBeNull();
    expect(findWowExe("/nonexistent-dir")).toBeNull();
  });
});

describe("runWithWow", () => {
  it("starts on game-up, drains and exits on game-down", async () => {
    // probe sequence: down, down, up, up, down
    const states = [false, false, true, true, false];
    const calls: string[] = [];
    await runWithWow({
      isRunning: () => states.shift() ?? false,
      pollMs: 1,
      onUp: () => { calls.push("up"); },
      onDown: () => { calls.push("down"); },
    });
    expect(calls).toEqual(["up", "down"]);
  });

  it("starts immediately when the game is already running", async () => {
    const states = [true, true, false];
    const calls: string[] = [];
    await runWithWow({
      isRunning: () => states.shift() ?? false,
      pollMs: 1,
      onUp: () => { calls.push("up"); },
      onDown: () => { calls.push("down"); },
    });
    expect(calls).toEqual(["up", "down"]);
  });

  it("persistent mode keeps watching across relaunches", async () => {
    // down, up, down, up, up, then stop mid-session
    const states = [false, true, false, true, true];
    const calls: string[] = [];
    let polls = 0;
    const result = await runWithWow({
      isRunning: () => states.shift() ?? true,
      pollMs: 1,
      persistent: true,
      shouldStop: () => ++polls > 6,   // stop while game is up
      onUp: () => { calls.push("up"); },
      onDown: () => { calls.push("down"); },
    });
    // two full sessions + final drain on stop while up
    expect(calls).toEqual(["up", "down", "up", "down"]);
    expect(result).toBe("stopped");
  });

  it("persistent mode drains on stop even mid-session", async () => {
    const states = [true, true]; // game stays up
    const calls: string[] = [];
    let polls = 0;
    const result = await runWithWow({
      isRunning: () => states.shift() ?? true,
      pollMs: 1,
      persistent: true,
      shouldStop: () => ++polls > 2,
      onUp: () => { calls.push("up"); },
      onDown: () => { calls.push("down"); },
    });
    expect(calls).toEqual(["up", "down"]); // final drain on stop
    expect(result).toBe("stopped");
  });
});

describe("launchGame", () => {
  it("resolves with the child's exit code", async () => {
    const code = await launchGame({
      exePath: "Wow.exe",
      spawnFn: () => {
        const fake = new EventEmitter() as ChildProcess;
        setTimeout(() => fake.emit("exit", 0), 1);
        return fake;
      },
    });
    expect(code).toBe(0);
  });

  it("rejects when the spawn fails", async () => {
    await expect(launchGame({
      exePath: "Wow.exe",
      spawnFn: () => {
        const fake = new EventEmitter() as ChildProcess;
        setTimeout(() => fake.emit("error", new Error("ENOENT")), 1);
        return fake;
      },
    })).rejects.toThrow("ENOENT");
  });
});
