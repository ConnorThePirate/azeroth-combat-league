/**
 * install.ts — make the companion zero-effort for players (docs/27 UX).
 *
 * `acl-companion install` creates a "Play WoW + ACL" launcher on the
 * desktop/app menu: one click launches the game and the sync together.
 * `--autostart` additionally registers `run --with-wow` at login so the
 * player can keep launching WoW from ANY shortcut and it still works.
 *
 * Everything written lives in well-known per-user locations and is fully
 * removed by `uninstall`. Paths/platform are injectable for tests.
 */
import { existsSync, mkdirSync, writeFileSync, unlinkSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { join, resolve, basename } from "node:path";

export interface InstallResult {
  created: string[];
  notes: string[];
}

export interface Launcher {
  command: string;
  args: string[];
  /** human-readable "cmd args" for messages */
  display: string;
}

/**
 * How the companion was invoked — the shortcut must reproduce a command
 * that actually runs:
 *   - built JS entry (dist/cli.js, pkg bin) → `node <script>`
 *   - .ts source entry with a built sibling → `node <dist/cli.js>`
 *   - .ts source only (dev checkout)        → `npx tsx <script>`
 *   - no script arg (packaged binary)       → the binary itself
 */
export function launcherCommand(argv1 = process.argv[1]): Launcher {
  const script = argv1 && existsSync(argv1) ? resolve(argv1) : null;
  if (script && /\.(js|cjs|mjs)$/.test(script)) {
    return { command: process.execPath, args: [script],
      display: `${basename(process.execPath)} ${script}` };
  }
  if (script && /\.ts$/.test(script)) {
    const built = script.replace(/(?:^|\/)src\//, "/dist/").replace(/\.ts$/, ".js");
    if (existsSync(built)) {
      return { command: process.execPath, args: [built],
        display: `${basename(process.execPath)} ${built}` };
    }
    return { command: "npx", args: ["tsx", script],
      display: `npx tsx ${script}` };
  }
  return { command: process.execPath, args: [], display: basename(process.execPath) };
}

const esc = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
const cmdline = (l: Launcher, extra: string[]) =>
  [esc(l.command), ...l.args.map(esc), ...extra].join(" ");

// -- Linux: XDG .desktop files -------------------------------------------------

function desktopEntry(exec: string): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Play WoW + ACL",
    "Comment=Launches WoW with Azeroth Combat League sync",
    `Exec=${exec}`,
    "Terminal=false",
    "Categories=Game;",
    "StartupNotify=false",
    "",
  ].join("\n");
}

function autostartEntry(exec: string): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=ACL Companion",
    `Exec=${exec}`,
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

export interface InstallPaths {
  desktop?: string;        // ~/Desktop
  applications?: string;   // ~/.local/share/applications
  autostartDir?: string;   // ~/.config/autostart
  launchAgents?: string;   // ~/Library/LaunchAgents
}

function defaultPaths(home: string, plat: NodeJS.Platform): Required<InstallPaths> {
  return {
    desktop: join(home, "Desktop"),
    applications: join(home, ".local", "share", "applications"),
    autostartDir: join(home, ".config", "autostart"),
    launchAgents: join(home, "Library", "LaunchAgents"),
  };
}

// -- Windows helpers (real powershell, only run on win32) ----------------------

function windowsShortcut(l: Launcher): string {
  const ps = [
    `$ws = New-Object -ComObject WScript.Shell`,
    `$desktop = [Environment]::GetFolderPath('Desktop')`,
    `$s = $ws.CreateShortcut("$desktop\\Play WoW + ACL.lnk")`,
    `$s.TargetPath = ${esc(l.command)}`,
    `$s.Arguments = '${[...l.args.map(esc), "play"].join(" ")}'`,
    `$s.WorkingDirectory = ${esc(join(l.command, ".."))}`,
    `$s.Save()`,
  ].join("; ");
  execFileSync("powershell", ["-NoProfile", "-Command", ps], { timeout: 15000 });
  return "Desktop\\Play WoW + ACL.lnk";
}

function windowsAutostart(l: Launcher, remove: boolean): void {
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  if (remove) {
    execFileSync("reg", ["delete", key, "/v", "ACLCompanion", "/f"], { timeout: 10000 });
    return;
  }
  execFileSync("reg", ["add", key, "/v", "ACLCompanion", "/t", "REG_SZ",
    "/d", cmdline(l, ["run", "--with-wow"]), "/f"], { timeout: 10000 });
}

// -- Main entry ----------------------------------------------------------------

export interface InstallOptions {
  autostart?: boolean;
  launcher?: Launcher;
  platform?: NodeJS.Platform;
  home?: string;
  paths?: InstallPaths;
}

/**
 * Create the player-facing launcher (+ optional login autostart).
 * Returns what was created and any honest caveats for the user.
 */
export function install(opts: InstallOptions = {}): InstallResult {
  const l = opts.launcher ?? launcherCommand();
  const plat = opts.platform ?? platform();
  const home = opts.home ?? homedir();
  const paths = { ...defaultPaths(home, plat), ...opts.paths };
  const created: string[] = [];
  const notes: string[] = [];
  const play = cmdline(l, ["play"]);
  const watch = cmdline(l, ["run", "--with-wow"]);

  if (plat === "win32") {
    created.push(windowsShortcut(l));
    if (opts.autostart) {
      windowsAutostart(l, false);
      created.push("HKCU\\…\\Run\\ACLCompanion");
      notes.push("autostart may show a brief console window at login on Windows");
    }
  } else if (plat === "linux") {
    mkdirSync(paths.applications, { recursive: true });
    const entry = join(paths.applications, "acl-play.desktop");
    writeFileSync(entry, desktopEntry(play));
    created.push(entry);
    if (existsSync(paths.desktop)) {
      const desk = join(paths.desktop, "Play WoW + ACL.desktop");
      writeFileSync(desk, desktopEntry(play));
      chmodSync(desk, 0o755);
      created.push(desk);
    }
    if (opts.autostart) {
      mkdirSync(paths.autostartDir, { recursive: true });
      const auto = join(paths.autostartDir, "acl-companion.desktop");
      writeFileSync(auto, autostartEntry(watch));
      created.push(auto);
    }
    notes.push("the desktop shortcut may need 'Allow Launching' on first click (GNOME)");
  } else if (plat === "darwin") {
    mkdirSync(paths.desktop, { recursive: true });
    const cmd = join(paths.desktop, "Play WoW + ACL.command");
    writeFileSync(cmd, `#!/bin/sh\nexec ${play}\n`);
    chmodSync(cmd, 0o755);
    created.push(cmd);
    if (opts.autostart) {
      mkdirSync(paths.launchAgents, { recursive: true });
      const plist = join(paths.launchAgents, "ai.devin.acl-companion.plist");
      writeFileSync(plist, [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<plist version="1.0"><dict>`,
        `  <key>Label</key><string>ai.devin.acl-companion</string>`,
        `  <key>ProgramArguments</key><array>`,
        `    ${[l.command, ...l.args, "run", "--with-wow"].map((a) => `<string>${a}</string>`).join("\n    ")}`,
        `  </array>`,
        `  <key>RunAtLoad</key><true/>`,
        `</dict></plist>`,
        "",
      ].join("\n"));
      created.push(plist);
    }
  } else {
    notes.push(`unsupported platform ${plat} — run 'acl-companion play' manually`);
  }
  if (!opts.autostart) {
    notes.push("use the 'Play WoW + ACL' shortcut to launch; or re-run install --autostart so ANY launcher works");
  }
  return { created, notes };
}

/** Remove everything `install` created. */
export function uninstall(opts: InstallOptions = {}): string[] {
  const plat = opts.platform ?? platform();
  const home = opts.home ?? homedir();
  const paths = { ...defaultPaths(home, plat), ...opts.paths };
  const removed: string[] = [];
  const rm = (p: string) => { try { unlinkSync(p); removed.push(p); } catch { /* absent */ } };

  if (plat === "win32") {
    try {
      execFileSync("powershell", ["-NoProfile", "-Command",
        `Remove-Item "$([Environment]::GetFolderPath('Desktop'))\\Play WoW + ACL.lnk" -Force`],
        { timeout: 15000 });
      removed.push("Desktop\\Play WoW + ACL.lnk");
    } catch { /* absent */ }
    try { windowsAutostart(launcherCommand(), true); removed.push("HKCU\\…\\Run\\ACLCompanion"); } catch { /* absent */ }
  } else if (plat === "linux") {
    rm(join(paths.applications, "acl-play.desktop"));
    rm(join(paths.desktop, "Play WoW + ACL.desktop"));
    rm(join(paths.autostartDir, "acl-companion.desktop"));
  } else if (plat === "darwin") {
    rm(join(paths.desktop, "Play WoW + ACL.command"));
    rm(join(paths.launchAgents, "ai.devin.acl-companion.plist"));
  }
  return removed;
}
