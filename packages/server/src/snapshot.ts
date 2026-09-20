/**
 * WFU1 addon-update snapshot builder (docs/06,27).
 *
 * Produces the bounded website->addon bundle: per-character last-known
 * ladder snapshots + report receipts. Display-only data — it never carries
 * secrets, never authorizes anything, and a stale bundle must leave addon
 * state intact (the addon enforces account-scoped monotonic sequence).
 */

import type { AddonUpdate, LadderSnapshot, PublishedRuleset, UpdateCharacter, UpdateReceipt } from "@acl/contracts";
import { LIMITS } from "@acl/contracts";
import type { Store } from "./store.js";

export interface SnapshotSource {
  /** Latest published generation id per season. */
  generationForSeason(seasonId: string): Promise<string | null>;
  /** Current ladder snapshots for the account's characters. */
  ladderRows(accountId: string): Promise<
    { characterId: string; seasonId: string; poolId: string; ladder: "open" | "mirror";
      ratingMilli: number; positiveSeries: number; distinctOpponents: number }[]
  >;
  /** Processing statuses for the account's submitted reports, oldest first. */
  receipts(accountId: string, cursor?: string): Promise<UpdateReceipt[]>;
  /** Allocate the next account-scoped snapshot sequence atomically. */
  allocateSequence(accountId: string, idemKey: string): Promise<number>;
  characterIds(accountId: string): Promise<string[]>;
  /** Currently published ruleset versions (docs/08) — data only. */
  rulesets?(): Promise<PublishedRuleset[]>;
}

export async function buildAddonUpdate(
  src: SnapshotSource,
  accountId: string,
  idemKey: string,
  opts: { receiptCursor?: string; nowMs?: number; configVersion?: string } = {},
): Promise<{ bundle: AddonUpdate; hasMoreReceipts: boolean }> {
  const seq = await src.allocateSequence(accountId, idemKey);
  const charIds = await src.characterIds(accountId);
  const rows = await src.ladderRows(accountId);
  const byChar = new Map<string, LadderSnapshot[]>();
  let snapCount = 0;
  for (const r of rows) {
    if (snapCount >= LIMITS.maxUpdateLadderSnapshots) break;
    const genId = await src.generationForSeason(r.seasonId);
    if (!genId) continue;
    const list = byChar.get(r.characterId) ?? [];
    list.push({
      seasonId: r.seasonId, poolId: r.poolId, ladder: r.ladder,
      ratingMilli: r.ratingMilli,
      placementSeries: r.positiveSeries,
      placementOpponents: r.distinctOpponents,
      generationId: genId,
    });
    byChar.set(r.characterId, list);
    snapCount++;
  }
  const characters: UpdateCharacter[] = charIds.slice(0, LIMITS.maxUpdateCharacters)
    .map((characterId) => ({ characterId, ladders: byChar.get(characterId) ?? [] }));

  const allReceipts = await src.receipts(accountId, opts.receiptCursor);
  const receipts = allReceipts.slice(0, LIMITS.maxUpdateReceipts);
  const hasMoreReceipts = allReceipts.length > LIMITS.maxUpdateReceipts;

  const rulesets = (await src.rulesets?.() ?? [])
    .slice(0, LIMITS.maxUpdateRulesets);

  return {
    bundle: {
      schema: "wf.addon-update.v1",
      accountId,
      snapshotSequence: seq,
      issuedAtMs: opts.nowMs ?? Date.now(),
      characters,
      receipts,
      configVersion: opts.configVersion ?? "beta-v2",
      ...(rulesets.length > 0 ? { rulesets } : {}),
    },
    hasMoreReceipts,
  };
}

export type { Store };
