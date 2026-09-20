/**
 * cli.ts — `acl-companion` command line (docs/27 early scope).
 *
 *   acl-companion setup <wow-install-dir>   choose + allowlist install
 *   acl-companion pair                      browser pairing -> OS credential
 *   acl-companion run                       watch + upload (foreground)
 *   acl-companion run --with-wow            sync only while WoW runs (keeps
 *                                           watching across relaunches)
 *   acl-companion run --with-wow --once     exit when the game does
 *   acl-companion play [-- game args]       launch WoW; companion lives while it does
 *   acl-companion install [--autostart]     create a 'Play WoW + ACL' shortcut
 *   acl-companion uninstall                 remove the shortcut + autostart entry
 *   acl-companion status                    one-shot status snapshot
 *   acl-companion revoke                    revoke credential + clear spool acks
 *   acl-companion pause | resume
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { CompanionService, type CompanionConfig } from "./service.js";
import { Spool } from "./spool.js";
import { FileCredentialStore } from "./credentials.js";
import { UploaderClient } from "./client.js";
import { pair } from "./pairing.js";
import { validateInstallDir } from "./paths.js";
import { findWowExe, launchGame, processProbe, runWithWow } from "./lifecycle.js";
import { install as installLauncher, uninstall as uninstallLauncher } from "./install.js";
import { basename } from "node:path";

const DATA_DIR =
  process.env.ACL_COMPANION_DIR ??
  join(homedir(), ".acl-companion");
const CONFIG_PATH = join(DATA_DIR, "config.json");

interface StoredConfig extends CompanionConfig {
  installationId: string;
}

function loadConfig(): StoredConfig | null {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as StoredConfig;
  } catch {
    return null;
  }
}

function saveConfig(c: StoredConfig): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));
}

function makeService(cfg: StoredConfig): CompanionService {
  return new CompanionService(
    cfg,
    new Spool(DATA_DIR),
    new FileCredentialStore(DATA_DIR),
    new UploaderClient(cfg.serverUrl),
    (s) => {
      console.log(
        `[${new Date().toISOString()}] ${s.state}` +
          ` watching=${s.watching.length}` +
          ` spool=${JSON.stringify(s.spool)}` +
          (s.lastError ? ` "${s.lastError}"` : ""),
      );
    },
  );
}

async function main(argv: string[]): Promise<void> {
  const cmd = argv[2];
  const cfg = loadConfig();

  switch (cmd) {
    case "setup": {
      const dir = argv[3];
      if (!dir) {
        console.error("usage: acl-companion setup <wow-install-dir>");
        process.exit(2);
      }
      const abs = validateInstallDir(dir);
      saveConfig({
        installDir: abs,
        serverUrl: argv[4] ?? "https://api.azerothcombatleague.example",
        installationId: cfg?.installationId ?? randomUUID(),
      });
      console.log(`install dir set: ${abs}`);
      console.log("next: acl-companion pair");
      break;
    }
    case "pair": {
      if (!cfg) { console.error("run `setup` first"); process.exit(2); }
      const client = new UploaderClient(cfg.serverUrl);
      const res = await pair(client, new FileCredentialStore(DATA_DIR),
        cfg.installationId,
        (code, url) => {
          console.log(`pairing code: ${code}`);
          console.log(`open: ${url}`);
        });
      console.log(`paired to account ${res.accountId}`);
      break;
    }
    case "run": {
      if (!cfg) { console.error("run `setup` first"); process.exit(2); }
      const svc = makeService(cfg);
      const withWow = argv.includes("--with-wow");
      if (!withWow) {
        svc.start();
        console.log("companion running — Ctrl+C to stop");
        process.on("SIGINT", () => { svc.stop(); process.exit(0); });
        break;
      }
      const exe = findWowExe(cfg.installDir);
      if (!exe) {
        console.error(`no WoW executable found in ${cfg.installDir}`);
        process.exit(2);
      }
      const once = argv.includes("--once");
      let stopping = false;
      process.on("SIGINT", () => { stopping = true; });
      console.log(`watching for ${basename(exe)} — Ctrl+C to stop` +
        (once ? " (exits with the game)" : ""));
      await runWithWow({
        isRunning: processProbe(basename(exe)),
        pollMs: 3000,
        persistent: !once,
        shouldStop: () => stopping,
        onUp: () => { console.log("game detected — sync active"); svc.start(); },
        onDown: async () => {
          console.log("game closed — final sweep + drain");
          // SavedVariables flush on exit lands after the last poll —
          // give it a beat, then read every file unconditionally
          await new Promise((r) => setTimeout(r, 1500));
          await svc.sweepNow();
          await svc.flushQueue();
          svc.stop();
          if (!once) console.log("watching for relaunch…");
        },
      });
      console.log("companion exiting");
      break;
    }
    case "play": {
      if (!cfg) { console.error("run `setup` first"); process.exit(2); }
      const exe = findWowExe(cfg.installDir);
      if (!exe) {
        console.error(`no WoW executable found in ${cfg.installDir}`);
        process.exit(2);
      }
      const svc = makeService(cfg);
      svc.start();
      console.log(`launching ${basename(exe)} — sync active, exits with the game`);
      const code = await launchGame({ exePath: exe, args: argv.slice(3) });
      console.log("game closed — final sweep + drain");
      await new Promise((r) => setTimeout(r, 1500));
      await svc.sweepNow();
      await svc.flushQueue();
      svc.stop();
      process.exit(code ?? 0);
    }
    case "install": {
      if (!cfg) { console.error("run `setup` first"); process.exit(2); }
      const res = installLauncher({ autostart: argv.includes("--autostart") });
      for (const p of res.created) console.log(`created: ${p}`);
      for (const n of res.notes) console.log(`note: ${n}`);
      break;
    }
    case "uninstall": {
      for (const p of uninstallLauncher()) console.log(`removed: ${p}`);
      break;
    }
    case "status": {
      if (!cfg) { console.error("run `setup` first"); process.exit(2); }
      const svc = makeService(cfg);
      console.log(JSON.stringify(svc.status(), null, 2));
      break;
    }
    case "pause": case "resume": {
      if (!cfg) { console.error("run `setup` first"); process.exit(2); }
      cfg.paused = cmd === "pause";
      saveConfig(cfg);
      console.log(cmd === "pause" ? "paused" : "resumed");
      break;
    }
    case "revoke": {
      if (!cfg) { console.error("run `setup` first"); process.exit(2); }
      const creds = new FileCredentialStore(DATA_DIR);
      const cred = await creds.get();
      if (cred) {
        try { await new UploaderClient(cfg.serverUrl).revoke(cred.token); } catch { /* offline revoke */ }
        await creds.clear();
      }
      console.log("credential revoked");
      break;
    }
    default:
      console.log(
        "acl-companion — setup <dir> | pair | install [--autostart] | play | run [--with-wow] | status | pause | resume | revoke",
      );
  }
}

if (existsSync(CONFIG_PATH) || process.argv.length > 2) {
  main(process.argv).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
