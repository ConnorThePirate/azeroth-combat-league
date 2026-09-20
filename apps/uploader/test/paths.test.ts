import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateInstallDir, listSavedVariables, allowlistCheck,
  isInside, PathError,
} from "../src/paths.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "aclu-"));
  mkdirSync(join(root, "WTF", "Account", "CONNOR", "SavedVariables"), { recursive: true });
  writeFileSync(
    join(root, "WTF", "Account", "CONNOR", "SavedVariables", "AzerothCombatLeague.lua"),
    "AzerothCombatLeagueDB = {}",
  );
  writeFileSync(
    join(root, "WTF", "Account", "CONNOR", "SavedVariables", "OtherAddon.lua"),
    "OtherDB = {}",
  );
  mkdirSync(join(root, "WTF", "Account", "CONNOR2"), { recursive: true });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("paths", () => {
  it("accepts a dir with WTF/", () => {
    expect(validateInstallDir(root)).toBe(root);
  });

  it("rejects a non-install dir", () => {
    const bad = mkdtempSync(join(tmpdir(), "aclu-bad-"));
    expect(() => validateInstallDir(bad)).toThrow(PathError);
    rmSync(bad, { recursive: true, force: true });
  });

  it("lists only the addon SavedVariables file", () => {
    const files = listSavedVariables(root);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toContain("AzerothCombatLeague.lua");
    expect(files[0]!.accountLabel).toBe("CONNOR");
  });

  it("allowlists the addon file and rejects everything else", () => {
    const good = join(root, "WTF", "Account", "CONNOR", "SavedVariables", "AzerothCombatLeague.lua");
    expect(allowlistCheck(root, good)).toBe(good);
    const other = join(root, "WTF", "Account", "CONNOR", "SavedVariables", "OtherAddon.lua");
    expect(() => allowlistCheck(root, other)).toThrow(/not an allowlisted/);
    const outside = join(tmpdir(), "whatever.txt");
    writeFileSync(outside, "x");
    expect(() => allowlistCheck(root, outside)).toThrow(/outside/);
    rmSync(outside);
  });

  it("rejects symlinks escaping the root", () => {
    const outside = join(tmpdir(), `aclu-escape-${Date.now()}.lua`);
    writeFileSync(outside, "AzerothCombatLeagueDB = {}");
    const link = join(root, "WTF", "Account", "CONNOR", "SavedVariables", "Link.lua");
    try {
      symlinkSync(outside, link);
      expect(() => allowlistCheck(root, link)).toThrow();
    } finally {
      rmSync(link, { force: true });
      rmSync(outside, { force: true });
    }
  });

  it("isInside works", () => {
    expect(isInside(root, join(root, "a", "b"))).toBe(true);
    expect(isInside(root, join(root, "..", "b"))).toBe(false);
  });
});
