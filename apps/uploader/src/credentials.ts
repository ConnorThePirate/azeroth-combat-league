/**
 * credentials.ts — scoped reporting credential storage (docs/27).
 *
 * The credential is account-bound and scoped to: submit reports + read own
 * upload receipts/status. No moderation, rules, claims, or identity rights.
 *
 * `CredentialStore` is an interface so a production Windows build can back
 * it with DPAPI (e.g. keytar/Electron safeStorage). The file fallback used
 * in dev writes mode-0600 under the user data dir and never logs the value.
 */
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";

export interface ReportingCredential {
  token: string;        // opaque bearer token, never logged
  accountId: string;
  issuedAtMs: number;
  expiresAtMs?: number;
}

export interface CredentialStore {
  get(): Promise<ReportingCredential | null>;
  set(c: ReportingCredential): Promise<void>;
  clear(): Promise<void>;
}

const FILE = "credential.json";

export class FileCredentialStore implements CredentialStore {
  private path: string;
  constructor(userDataDir: string) {
    mkdirSync(userDataDir, { recursive: true });
    this.path = join(userDataDir, FILE);
  }
  async get(): Promise<ReportingCredential | null> {
    try {
      const c = JSON.parse(readFileSync(this.path, "utf8")) as ReportingCredential;
      if (c.expiresAtMs && c.expiresAtMs < Date.now()) return null;
      return c;
    } catch {
      return null;
    }
  }
  async set(c: ReportingCredential): Promise<void> {
    writeFileSync(this.path, JSON.stringify(c), { mode: 0o600 });
    try { chmodSync(this.path, 0o600); } catch { /* windows fs */ }
  }
  async clear(): Promise<void> {
    try { unlinkSync(this.path); } catch { /* already gone */ }
  }
}
