/**
 * pairing.ts — browser device-flow pairing (docs/27).
 *
 * The companion requests a user code, opens the verify URL in the browser,
 * and polls until the account owner approves. The resulting credential is
 * scoped to report submission + own receipts only.
 */
import { exec } from "node:child_process";
import type { UploaderClient } from "./client.js";
import type { CredentialStore } from "./credentials.js";

export function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => { /* best effort — CLI also prints the URL */ });
}

export interface PairResult {
  accountId: string;
}

/**
 * Run the pairing flow. Returns after approval or throws on expiry/denial.
 */
export async function pair(
  client: UploaderClient,
  creds: CredentialStore,
  installationId: string,
  onCode: (userCode: string, verifyUrl: string) => void,
  timeoutMs = 10 * 60_000,
): Promise<PairResult> {
  const start = await client.pairStart(installationId);
  onCode(start.userCode, start.verifyUrl);
  openBrowser(start.verifyUrl);

  const deadline = Math.min(Date.now() + timeoutMs, start.expiresAtMs);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, Math.max(1000, start.pollIntervalMs)));
    const res = await client.pairPoll(start.deviceCode);
    if (res.status === "approved") {
      await creds.set({
        token: res.token,
        accountId: res.accountId,
        issuedAtMs: Date.now(),
        ...(res.expiresAtMs !== undefined ? { expiresAtMs: res.expiresAtMs } : {}),
      });
      return { accountId: res.accountId };
    }
  }
  throw new Error("pairing expired — run `acl-companion pair` again");
}
