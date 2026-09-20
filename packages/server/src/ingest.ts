/**
 * Report ingestion + reconciliation (docs/06,07,15).
 *
 * Rules that matter:
 * - dedupe on (origin account, installation, nonce); same nonce with a
 *   different digest rejects rather than silently updating
 * - contract hash never replaces session identity; conflicting hashes for
 *   the same session are quarantined together
 * - a report only counts as an independent origin when the submitting
 *   credential belongs to the contract participant's account — an uploader
 *   carrying a peer's body does NOT authenticate that peer (docs/27)
 * - no one-sided report ever produces a ranked win
 */

import {
  hashCanonical, validateContract, validateReport,
  type MatchContract, type MatchReport, type SyncEnvelope,
} from "@acl/contracts";
import type { ContractRow, MatchRow, ReportRow, Store } from "./store.js";

export type ItemStatus =
  | "accepted" | "duplicate" | "rejected"
  | "awaiting_peer" | "corroborated" | "disputed" | "rating_pending";

export interface IngestItem {
  nonce: string;
  status: ItemStatus;
  matchId?: string;
  reasonCodes: string[];
}

export interface IngestResult {
  requestId: string;
  receiptId: string;
  items: IngestItem[];
  serverTime: number;
  configVersion: string;
}

export interface AuthContext {
  /** The authenticated account submitting this batch. */
  accountId: string;
  /** Installation the credential is bound to (helper) or null for app session. */
  installationId: string | null;
  authMethod: "app_session" | "helper" | "peer_signature";
}

interface ReconcileOutcome {
  evidence: MatchRow["evidence"];
  rating: MatchRow["rating"];
  seriesWinnerCharacterId: string | null;
}

/** A corroborated report pair agrees on every game's winner. */
function outcomesAgree(a: MatchReport, b: MatchReport): boolean {
  const winnerOf = (r: MatchReport) =>
    r.games.map((g) => g.claimedWinnerCharacterId ?? "?").join("|");
  return winnerOf(a) === winnerOf(b);
}

function seriesWinner(contract: MatchContract, report: MatchReport): string | null {
  const winsNeeded = Math.ceil(contract.bestOf / 2);
  const tally = new Map<string, number>();
  for (const g of report.games) {
    if (g.claimedWinnerCharacterId) {
      tally.set(g.claimedWinnerCharacterId, (tally.get(g.claimedWinnerCharacterId) ?? 0) + 1);
    }
  }
  for (const [cid, n] of tally) {
    if (n >= winsNeeded) return cid;
  }
  return null;
}

/** Recompute evidence + rating state from all reports on file. */
export async function reconcileMatch(store: Store, matchId: string): Promise<ReconcileOutcome | null> {
  const match = await store.getMatch(matchId);
  const contractRow = await store.getContract(matchId);
  if (!match || !contractRow) return null;
  const contract = contractRow.canonical as MatchContract;
  const reports = await store.reportsForMatch(matchId);
  const participants = await store.participantsOf(matchId);
  const participantAccounts = new Set(participants.map((p) => p.accountIdAtMatch));

  // Independent origins: a report counts only if its authenticated origin
  // account is itself a contract participant.
  const independent = reports.filter((r) => participantAccounts.has(r.originAccountId));
  const originsByAccount = new Map<string, ReportRow>();
  for (const r of independent) {
    if (!originsByAccount.has(r.originAccountId)) originsByAccount.set(r.originAccountId, r);
  }

  let evidence: MatchRow["evidence"] = "awaiting";
  if (originsByAccount.size >= 2) {
    const [ra, rb] = [...originsByAccount.values()];
    const a = ra!.body as MatchReport;
    const b = rb!.body as MatchReport;
    evidence = outcomesAgree(a, b) ? "corroborated" : "disputed";
  } else if (independent.length === 1) {
    // carried peer digests upgrade to peer_supported but never corroborate
    const r = independent[0]!.body as MatchReport;
    evidence = r.peerDigests.length > 0 ? "peer_supported" : "awaiting";
  }

  // rating eligibility: corroborated + rated + distinct accounts + verified tiers
  let rating: MatchRow["rating"] = "ineligible";
  if (evidence === "corroborated" && contract.ratedIntent && contract.ladder !== null) {
    const accounts = participants.map((p) => p.accountIdAtMatch);
    const distinctAccounts = new Set(accounts).size === accounts.length;
    let tiersOk = distinctAccounts;
    for (const p of participants) {
      const c = await store.getCharacter(p.characterId);
      if (!c || c.verificationTier === "claimed") tiersOk = false;
    }
    rating = tiersOk ? "pending" : "ineligible";
  }
  if (evidence === "disputed") rating = "held";

  // materialize agreed game rows once evidence corroborates them
  if (evidence === "corroborated") {
    const agreed = independent[0]!.body as MatchReport;
    await store.setMatchGames(matchId, agreed.games.map((g) => ({
      matchId,
      gameIndex: g.index,
      winnerCharacterId: g.claimedWinnerCharacterId,
      finishReason: g.finishReason,
    })));
  }

  const winner = independent.length > 0
    ? seriesWinner(contract, independent[0]!.body as MatchReport)
    : null;

  const lifecycle: MatchRow["lifecycle"] =
    match.lifecycle === "finished" || match.lifecycle === "void"
      ? match.lifecycle
      : reports.some((r) => (r.body as MatchReport).finishedAtMs !== null) ? "finished" : match.lifecycle;

  await store.setMatchState(matchId, { evidence, rating, lifecycle });
  return { evidence, rating, seriesWinnerCharacterId: winner };
}

export interface IngestInput {
  envelope: SyncEnvelope;
  /** Contracts for new sessions, keyed by sessionId. */
  contracts?: Map<string, MatchContract>;
  nowMs?: number;
}

export async function ingestEnvelope(
  store: Store,
  auth: AuthContext,
  input: IngestInput,
): Promise<IngestResult> {
  const now = input.nowMs ?? Date.now();
  const items: IngestItem[] = [];

  for (const raw of input.envelope.reports) {
    const item: IngestItem = { nonce: raw.nonce, status: "rejected", reasonCodes: [] };
    items.push(item);

    const errs = validateReport(raw as never);
    if (errs.length > 0) {
      item.reasonCodes.push("invalid_field" as never);
      continue;
    }
    const report = raw as MatchReport;
    const matchId = report.sessionId;
    const bodyDigest = hashCanonical(report as never);

    // Resolve the contract: new session requires the contract document.
    let contractRow = await store.getContract(matchId);
    if (!contractRow) {
      const doc = input.contracts?.get(matchId);
      if (!doc || validateContract(doc as never).length > 0) {
        item.reasonCodes.push("hash_mismatch");
        continue;
      }
      const docHash = hashCanonical(doc as never);
      if (docHash !== report.contractHash) {
        item.reasonCodes.push("hash_mismatch");
        continue;
      }
      // resolve participant accounts at publication time
      const chars = await Promise.all(doc.participants.map((p) => store.getCharacter(p.characterId)));
      if (chars.some((c) => !c)) {
        item.reasonCodes.push("identity_unverified");
        continue;
      }
      contractRow = {
        id: doc.sessionId, contractHash: docHash, canonical: doc,
        seasonId: doc.seasonId, poolId: doc.poolId,
        rulesetVersionId: doc.rulesetVersionId, ratedIntent: doc.ratedIntent,
        ladder: doc.ladder, bestOf: doc.bestOf,
        levelMin: doc.levelMin, levelMax: doc.levelMax,
      };
      await store.insertContractWithMatch(contractRow, doc.participants.map((p, i) => ({
        matchId: doc.sessionId,
        characterId: p.characterId,
        accountIdAtMatch: chars[i]!.accountId,
        side: p.side,
      })));
    } else if (contractRow.contractHash !== report.contractHash) {
      // conflicting hash for the same session: quarantine together
      item.status = "rejected";
      item.reasonCodes.push("hash_mismatch");
      await store.setMatchState(matchId, { evidence: "disputed" });
      continue;
    }

    // The submitting account must own the report's origin character —
    // carrying a peer's body does not authenticate the peer (docs/27).
    const originChar = await store.getCharacter(report.originCharacterId);
    if (!originChar || originChar.accountId !== auth.accountId) {
      item.reasonCodes.push("identity_unverified");
      continue;
    }
    if (auth.installationId && report.installationId !== auth.installationId) {
      item.reasonCodes.push("identity_unverified");
      continue;
    }

    const inserted = await store.insertReport({
      matchId,
      originCharacterId: report.originCharacterId,
      originAccountId: auth.accountId,
      installationId: report.installationId,
      nonce: report.nonce,
      bodyDigest,
      body: report,
      authMethod: auth.authMethod,
    });
    if (inserted === "duplicate") {
      item.status = "duplicate";
      item.matchId = matchId;
      continue;
    }
    if (inserted === "conflict") {
      item.reasonCodes.push("duplicate_origin_nonce");
      continue;
    }

    await store.assignReceipt(matchId, now);
    const outcome = await reconcileMatch(store, matchId);
    if (outcome) {
      const contract = contractRow;
      if (outcome.rating === "pending" || outcome.evidence === "disputed") {
        await store.bumpInputRevision(contract.seasonId);
      }
      item.status =
        outcome.evidence === "corroborated"
          ? outcome.rating === "pending" ? "rating_pending" : "corroborated"
          : outcome.evidence === "disputed" ? "disputed" : "awaiting_peer";
      item.matchId = matchId;
    } else {
      item.status = "accepted";
      item.matchId = matchId;
    }
  }

  return {
    requestId: crypto.randomUUID(),
    receiptId: crypto.randomUUID(),
    items,
    serverTime: now,
    configVersion: "beta-v2",
  };
}
