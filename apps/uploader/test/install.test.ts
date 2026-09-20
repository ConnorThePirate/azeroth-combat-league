import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, launcherCommand, uninstall } from "../src/install.js";

const fakeLauncher = { command: "/opt/acl/acl-companion", args: [], display: "acl-companion" };

function fakeHome(withDesktop = true) {
  const home = mkdtempSync(join(tmpdir(), "acl-home-"));
  if (withDesktop) mkdirSync(join(home, "Desktop"));
  return home;
}

describe("install (linux)", () => {
  it("creates app-menu + desktop launchers", () => {
    const home = fakeHome();
    const res = install({ launcher: fakeLauncher, platform: "linux", home });
    const appEntry = join(home, ".local/share/applications/acl-play.desktop");
    const deskEntry = join(home, "Desktop/Play WoW + ACL.desktop");
    expect(res.created).toContain(appEntry);
    expect(res.created).toContain(deskEntry);
    const body = readFileSync(appEntry, "utf8");
    expect(body).toContain('Exec="/opt/acl/acl-companion" play');
    expect(body).toContain("Name=Play WoW + ACL");
    // desktop copy is executable
    expect(statSync(deskEntry).mode & 0o111).toBeTruthy();
  });

  it("skips the desktop copy when no Desktop dir exists", () => {
    const home = fakeHome(false);
    const res = install({ launcher: fakeLauncher, platform: "linux", home });
    expect(res.created.some((p) => p.includes("Desktop"))).toBe(false);
  });

  it("--autostart writes an autostart entry running --with-wow", () => {
    const home = fakeHome();
    const res = install({ launcher: fakeLauncher, platform: "linux", home, autostart: true });
    const auto = join(home, ".config/autostart/acl-companion.desktop");
    expect(res.created).toContain(auto);
    expect(readFileSync(auto, "utf8"))
      .toContain('Exec="/opt/acl/acl-companion" run --with-wow');
  });

  it("uninstall removes everything install created", () => {
    const home = fakeHome();
    install({ launcher: fakeLauncher, platform: "linux", home, autostart: true });
    const removed = uninstall({ platform: "linux", home });
    expect(removed.length).toBe(3);
    expect(existsSync(join(home, ".local/share/applications/acl-play.desktop"))).toBe(false);
    expect(existsSync(join(home, "Desktop/Play WoW + ACL.desktop"))).toBe(false);
    expect(existsSync(join(home, ".config/autostart/acl-companion.desktop"))).toBe(false);
    // second uninstall is a no-op, not an error
    expect(uninstall({ platform: "linux", home })).toEqual([]);
  });
});

describe("install (darwin)", () => {
  it("writes an executable .command on the desktop", () => {
    const home = fakeHome();
    const res = install({ launcher: fakeLauncher, platform: "darwin", home });
    const cmd = join(home, "Desktop/Play WoW + ACL.command");
    expect(res.created).toContain(cmd);
    expect(readFileSync(cmd, "utf8")).toContain('" play');
  });
});

describe("install (unsupported platform)", () => {
  it("notes the manual fallback instead of failing", () => {
    const home = fakeHome();
    const res = install({ launcher: fakeLauncher, platform: "freebsd" as NodeJS.Platform, home });
    expect(res.created).toEqual([]);
    expect(res.notes[0]).toContain("freebsd");
  });
});

describe("launcherCommand", () => {
  it("uses node + script path for a built JS entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "acl-lc-"));
    const js = join(dir, "cli.js");
    writeFileSync(js, "");
    const l = launcherCommand(js);
    expect(l.command).toBe(process.execPath);
    expect(l.args[0]).toBe(js);
  });

  it("prefers the built dist sibling for a .ts entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "acl-lc-"));
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "src", "cli.ts"), "");
    writeFileSync(join(dir, "dist", "cli.js"), "");
    const l = launcherCommand(join(dir, "src", "cli.ts"));
    expect(l.command).toBe(process.execPath);
    expect(l.args[0]).toBe(join(dir, "dist", "cli.js"));
  });

  it("falls back to npx tsx for a .ts entry with no build", () => {
    const l = launcherCommand(__filename); // this test file exists, no dist twin
    expect(l.command).toBe("npx");
    expect(l.args).toEqual(["tsx", __filename]);
  });

  it("uses the binary itself when there is no script arg", () => {
    const l = launcherCommand("/packaged/acl-companion"); // no file → binary form
    expect(l.command).toBe(process.execPath);
    expect(l.args).toEqual([]);
  });
});
