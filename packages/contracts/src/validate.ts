/**
 * Structural validators for protocol v2 payloads. Each returns a list of
 * field errors; an empty list means the value is structurally valid.
 * Business rules (contract legality) are checked separately.
 */

import type { JsonValue } from "./canonical.js";
import { LIMITS } from "./limits.js";
import { SCHEMAS } from "./types.js";

export interface FieldError {
  path: string;
  code: "required" | "type" | "format" | "range" | "enum" | "length" | "business";
  message: string;
}

type Obj = { [key: string]: JsonValue };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isArr(v: JsonValue | undefined): v is JsonValue[] {
  return Array.isArray(v);
}

function req(errs: FieldError[], o: Obj, key: string, path: string): JsonValue | undefined {
  const v = o[key];
  if (v === undefined) {
    errs.push({ path: `${path}.${key}`, code: "required", message: "missing field" });
  }
  return v;
}

function str(errs: FieldError[], o: Obj, key: string, path: string, maxBytes: number = LIMITS.maxStringBytes): string | undefined {
  const v = req(errs, o, key, path);
  if (v === undefined) return undefined;
  if (typeof v !== "string") {
    errs.push({ path: `${path}.${key}`, code: "type", message: "expected string" });
    return undefined;
  }
  if (new TextEncoder().encode(v).length > maxBytes) {
    errs.push({ path: `${path}.${key}`, code: "length", message: `exceeds ${maxBytes} bytes` });
    return undefined;
  }
  return v;
}

function uuid(errs: FieldError[], o: Obj, key: string, path: string): string | undefined {
  const v = str(errs, o, key, path, 64);
  if (v === undefined) return undefined;
  if (!UUID_RE.test(v)) {
    errs.push({ path: `${path}.${key}`, code: "format", message: "expected UUID" });
    return undefined;
  }
  return v;
}

function uuidOrNull(errs: FieldError[], o: Obj, key: string, path: string): string | null | undefined {
  const v = req(errs, o, key, path);
  if (v === null) return null;
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !UUID_RE.test(v)) {
    errs.push({ path: `${path}.${key}`, code: "format", message: "expected UUID or null" });
    return undefined;
  }
  return v;
}

function int(errs: FieldError[], o: Obj, key: string, path: string, min?: number, max?: number): number | undefined {
  const v = req(errs, o, key, path);
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isSafeInteger(v)) {
    errs.push({ path: `${path}.${key}`, code: "type", message: "expected safe integer" });
    return undefined;
  }
  if (min !== undefined && v < min) {
    errs.push({ path: `${path}.${key}`, code: "range", message: `below minimum ${min}` });
    return undefined;
  }
  if (max !== undefined && v > max) {
    errs.push({ path: `${path}.${key}`, code: "range", message: `above maximum ${max}` });
    return undefined;
  }
  return v;
}

function intOrNull(errs: FieldError[], o: Obj, key: string, path: string, min?: number, max?: number): number | null | undefined {
  const v = req(errs, o, key, path);
  if (v === null) return null;
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isSafeInteger(v)) {
    errs.push({ path: `${path}.${key}`, code: "type", message: "expected safe integer or null" });
    return undefined;
  }
  if (min !== undefined && v < min) errs.push({ path: `${path}.${key}`, code: "range", message: `below minimum ${min}` });
  if (max !== undefined && v > max) errs.push({ path: `${path}.${key}`, code: "range", message: `above maximum ${max}` });
  return v;
}

function bool(errs: FieldError[], o: Obj, key: string, path: string): boolean | undefined {
  const v = req(errs, o, key, path);
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") {
    errs.push({ path: `${path}.${key}`, code: "type", message: "expected boolean" });
    return undefined;
  }
  return v;
}

function enumStr(errs: FieldError[], o: Obj, key: string, path: string, allowed: readonly string[], nullable = false): string | null | undefined {
  const v = req(errs, o, key, path);
  if (v === undefined) return undefined;
  if (v === null && nullable) return null;
  if (typeof v !== "string" || !allowed.includes(v)) {
    errs.push({ path: `${path}.${key}`, code: "enum", message: `expected one of ${allowed.join(",")}` });
    return undefined;
  }
  return v;
}

function schemaTag(errs: FieldError[], o: Obj, expected: string, path: string): void {
  const v = req(errs, o, "schema", path);
  if (v !== undefined && v !== expected) {
    errs.push({ path: `${path}.schema`, code: "enum", message: `expected ${expected}` });
  }
}

// ---------------------------------------------------------------------------

const FINISH_REASONS = ["surrender", "bounds", "death", "timeout", "disconnect", "interrupted", "unknown"] as const;
const COVERAGE_STATUS = ["observable", "corroborated", "attested", "unavailable"] as const;
const LADDERS = ["open", "mirror"] as const;
const RECEIPT_STATUSES = ["accepted", "duplicate", "rejected", "awaiting_peer", "corroborated", "disputed", "rating_pending"] as const;

export function validateContract(v: unknown): FieldError[] {
  const errs: FieldError[] = [];
  const p = "contract";
  if (!isObj(v)) return [{ path: p, code: "type", message: "expected object" }];
  schemaTag(errs, v, SCHEMAS.matchContract, p);
  uuid(errs, v, "sessionId", p);
  uuid(errs, v, "seasonId", p);
  uuid(errs, v, "poolId", p);
  uuid(errs, v, "rulesetVersionId", p);
  uuidOrNull(errs, v, "tournamentMatchId", p);
  const ladder = enumStr(errs, v, "ladder", p, LADDERS, true);
  const rated = bool(errs, v, "ratedIntent", p);
  const bestOf = int(errs, v, "bestOf", p);
  if (bestOf !== undefined && ![1, 3, 5].includes(bestOf)) {
    errs.push({ path: `${p}.bestOf`, code: "enum", message: "expected 1, 3 or 5" });
  }
  int(errs, v, "levelMin", p, 1, 80);
  int(errs, v, "levelMax", p, 1, 80);
  int(errs, v, "createdAtMs", p, 0);
  int(errs, v, "acceptByMs", p, 0);
  str(errs, v, "configVersion", p, 64);

  const venue = req(errs, v, "venue", p);
  if (venue !== undefined) {
    if (!isObj(venue)) errs.push({ path: `${p}.venue`, code: "type", message: "expected object" });
    else {
      enumStr(errs, venue, "kind", `${p}.venue`, ["anywhere", "map", "area"]);
      intOrNull(errs, venue, "mapId", `${p}.venue`, 0);
      intOrNull(errs, venue, "areaId", `${p}.venue`, 0);
    }
  }

  const parts = req(errs, v, "participants", p);
  if (parts !== undefined) {
    if (!isArr(parts) || parts.length !== 2) {
      errs.push({ path: `${p}.participants`, code: "length", message: "ordinary duel requires exactly two participants" });
    } else {
      const ids: string[] = [];
      const sides: number[] = [];
      parts.forEach((pp, i) => {
        const ppPath = `${p}.participants[${i}]`;
        if (!isObj(pp)) {
          errs.push({ path: ppPath, code: "type", message: "expected object" });
          return;
        }
        const cid = uuid(errs, pp, "characterId", ppPath);
        const side = int(errs, pp, "side", ppPath);
        if (side !== undefined && side !== 1 && side !== 2) {
          errs.push({ path: `${ppPath}.side`, code: "enum", message: "expected 1 or 2" });
        }
        if (cid) ids.push(cid);
        if (side !== undefined) sides.push(side);
      });
      if (ids.length === 2 && ids[0] === ids[1]) {
        errs.push({ path: `${p}.participants`, code: "business", message: "participants must be distinct characters" });
      }
      if (sides.length === 2 && sides[0] === sides[1]) {
        errs.push({ path: `${p}.participants`, code: "business", message: "participants must have distinct sides" });
      }
    }
  }

  // custom rules => unrated; rated requires a ladder
  if (rated === true && ladder === null) {
    errs.push({ path: `${p}.ratedIntent`, code: "business", message: "rated contract requires a ladder" });
  }
  const lm = v["levelMin"];
  const lx = v["levelMax"];
  if (typeof lm === "number" && typeof lx === "number" && lm > lx) {
    errs.push({ path: `${p}.levelMin`, code: "range", message: "levelMin exceeds levelMax" });
  }
  const ca = v["createdAtMs"];
  const ab = v["acceptByMs"];
  if (typeof ca === "number" && typeof ab === "number" && ab <= ca) {
    errs.push({ path: `${p}.acceptByMs`, code: "range", message: "acceptByMs must be after createdAtMs" });
  }
  return errs;
}

export function validateReport(v: unknown): FieldError[] {
  const errs: FieldError[] = [];
  const p = "report";
  if (!isObj(v)) return [{ path: p, code: "type", message: "expected object" }];
  schemaTag(errs, v, SCHEMAS.matchReport, p);
  uuid(errs, v, "sessionId", p);
  uuid(errs, v, "originCharacterId", p);
  uuid(errs, v, "installationId", p);
  str(errs, v, "nonce", p, 128);
  str(errs, v, "build", p, 64);
  str(errs, v, "addonVersion", p, 64);
  str(errs, v, "detectorCatalogVersion", p, 64);
  const hash = str(errs, v, "contractHash", p, 64);
  if (hash !== undefined && !SHA256_RE.test(hash)) {
    errs.push({ path: `${p}.contractHash`, code: "format", message: "expected sha256 hex" });
  }
  for (const k of ["proposedAtMs", "acceptedAtMs", "startedAtMs", "finishedAtMs"] as const) {
    intOrNull(errs, v, k, p, 0);
  }
  const games = req(errs, v, "games", p);
  if (games !== undefined) {
    if (!isArr(games)) errs.push({ path: `${p}.games`, code: "type", message: "expected array" });
    else games.forEach((g, i) => {
      const gp = `${p}.games[${i}]`;
      if (!isObj(g)) { errs.push({ path: gp, code: "type", message: "expected object" }); return; }
      int(errs, g, "index", gp, 0, 31);
      intOrNull(errs, g, "observedStartMs", gp, 0);
      intOrNull(errs, g, "observedEndMs", gp, 0);
      const w = req(errs, g, "claimedWinnerCharacterId", gp);
      if (w !== null && w !== undefined && (typeof w !== "string" || !UUID_RE.test(w))) {
        errs.push({ path: `${gp}.claimedWinnerCharacterId`, code: "format", message: "expected UUID or null" });
      }
      enumStr(errs, g, "finishReason", gp, FINISH_REASONS);
      for (const arr of ["facts", "interferenceCandidates", "violationCandidates"] as const) {
        const a = req(errs, g, arr, gp);
        if (a !== undefined && !isArr(a)) errs.push({ path: `${gp}.${arr}`, code: "type", message: "expected array" });
      }
    });
  }
  const cov = req(errs, v, "coverage", p);
  if (cov !== undefined) {
    if (!isArr(cov)) errs.push({ path: `${p}.coverage`, code: "type", message: "expected array" });
    else cov.forEach((c, i) => {
      const cp = `${p}.coverage[${i}]`;
      if (!isObj(c)) { errs.push({ path: cp, code: "type", message: "expected object" }); return; }
      str(errs, c, "ruleId", cp, 128);
      enumStr(errs, c, "status", cp, COVERAGE_STATUS);
      intOrNull(errs, c, "gameIndex", cp, 0, 31);
      intOrNull(errs, c, "intervalStartMs", cp, 0);
      intOrNull(errs, c, "intervalEndMs", cp, 0);
    });
  }
  const att = req(errs, v, "attestations", p);
  if (att !== undefined) {
    if (!isArr(att)) errs.push({ path: `${p}.attestations`, code: "type", message: "expected array" });
    else att.forEach((a, i) => {
      const ap = `${p}.attestations[${i}]`;
      if (!isObj(a)) { errs.push({ path: ap, code: "type", message: "expected object" }); return; }
      for (const k of ["contractHash", "outcomeDigest"] as const) {
        const h = str(errs, a, k, ap, 64);
        if (h !== undefined && !SHA256_RE.test(h)) errs.push({ path: `${ap}.${k}`, code: "format", message: "expected sha256 hex" });
      }
      uuid(errs, a, "signerCharacterId", ap);
    });
  }
  const pd = req(errs, v, "peerDigests", p);
  if (pd !== undefined) {
    if (!isArr(pd)) errs.push({ path: `${p}.peerDigests`, code: "type", message: "expected array" });
    else pd.forEach((d, i) => {
      if (typeof d !== "string" || !SHA256_RE.test(d)) {
        errs.push({ path: `${p}.peerDigests[${i}]`, code: "format", message: "expected sha256 hex" });
      }
    });
  }
  return errs;
}

export function validateSyncEnvelope(v: unknown): FieldError[] {
  const errs: FieldError[] = [];
  const p = "envelope";
  if (!isObj(v)) return [{ path: p, code: "type", message: "expected object" }];
  schemaTag(errs, v, SCHEMAS.syncEnvelope, p);
  uuid(errs, v, "installationId", p);
  str(errs, v, "build", p, 64);
  str(errs, v, "addonVersion", p, 64);
  int(errs, v, "exportedAtMs", p, 0);
  const reports = req(errs, v, "reports", p);
  if (reports !== undefined) {
    if (!isArr(reports)) errs.push({ path: `${p}.reports`, code: "type", message: "expected array" });
    else {
      if (reports.length > LIMITS.maxReports) {
        errs.push({ path: `${p}.reports`, code: "length", message: `exceeds ${LIMITS.maxReports} reports` });
      }
      reports.forEach((r, i) => {
        for (const e of validateReport(r)) errs.push({ ...e, path: `${p}.reports[${i}].${e.path}` });
      });
    }
  }
  return errs;
}

export function validateAddonUpdate(v: unknown): FieldError[] {
  const errs: FieldError[] = [];
  const p = "update";
  if (!isObj(v)) return [{ path: p, code: "type", message: "expected object" }];
  schemaTag(errs, v, SCHEMAS.addonUpdate, p);
  uuid(errs, v, "accountId", p);
  int(errs, v, "snapshotSequence", p, 1, Number.MAX_SAFE_INTEGER);
  int(errs, v, "issuedAtMs", p, 0);
  str(errs, v, "configVersion", p, 64);
  const chars = req(errs, v, "characters", p);
  if (chars !== undefined) {
    if (!isArr(chars)) errs.push({ path: `${p}.characters`, code: "type", message: "expected array" });
    else {
      if (chars.length > LIMITS.maxUpdateCharacters) {
        errs.push({ path: `${p}.characters`, code: "length", message: `exceeds ${LIMITS.maxUpdateCharacters}` });
      }
      let snapCount = 0;
      chars.forEach((c, i) => {
        const cp = `${p}.characters[${i}]`;
        if (!isObj(c)) { errs.push({ path: cp, code: "type", message: "expected object" }); return; }
        uuid(errs, c, "characterId", cp);
        const ladders = req(errs, c, "ladders", cp);
        if (ladders !== undefined) {
          if (!isArr(ladders)) errs.push({ path: `${cp}.ladders`, code: "type", message: "expected array" });
          else ladders.forEach((l, j) => {
            snapCount++;
            const lp = `${cp}.ladders[${j}]`;
            if (!isObj(l)) { errs.push({ path: lp, code: "type", message: "expected object" }); return; }
            uuid(errs, l, "seasonId", lp);
            uuid(errs, l, "poolId", lp);
            uuid(errs, l, "generationId", lp);
            enumStr(errs, l, "ladder", lp, LADDERS);
            int(errs, l, "ratingMilli", lp, 0);
            int(errs, l, "placementSeries", lp, 0);
            int(errs, l, "placementOpponents", lp, 0);
          });
        }
      });
      if (snapCount > LIMITS.maxUpdateLadderSnapshots) {
        errs.push({ path: `${p}.characters`, code: "length", message: `exceeds ${LIMITS.maxUpdateLadderSnapshots} ladder snapshots` });
      }
    }
  }
  const receipts = req(errs, v, "receipts", p);
  if (receipts !== undefined) {
    if (!isArr(receipts)) errs.push({ path: `${p}.receipts`, code: "type", message: "expected array" });
    else {
      if (receipts.length > LIMITS.maxUpdateReceipts) {
        errs.push({ path: `${p}.receipts`, code: "length", message: `exceeds ${LIMITS.maxUpdateReceipts} receipts` });
      }
      receipts.forEach((r, i) => {
        const rp = `${p}.receipts[${i}]`;
        if (!isObj(r)) { errs.push({ path: rp, code: "type", message: "expected object" }); return; }
        uuid(errs, r, "installationId", rp);
        uuid(errs, r, "receiptId", rp);
        str(errs, r, "nonce", rp, 128);
        const d = str(errs, r, "bodyDigest", rp, 64);
        if (d !== undefined && !SHA256_RE.test(d)) errs.push({ path: `${rp}.bodyDigest`, code: "format", message: "expected sha256 hex" });
        enumStr(errs, r, "status", rp, RECEIPT_STATUSES);
      });
    }
  }
  // optional: published rulesets (docs/08) — absent is fine, present must validate
  const rulesets = v.rulesets;
  if (rulesets !== undefined && rulesets !== null) {
    if (!isArr(rulesets)) errs.push({ path: `${p}.rulesets`, code: "type", message: "expected array" });
    else {
      if (rulesets.length > LIMITS.maxUpdateRulesets) {
        errs.push({ path: `${p}.rulesets`, code: "length", message: `exceeds ${LIMITS.maxUpdateRulesets} rulesets` });
      }
      rulesets.forEach((rs, i) => validateRuleset(rs, `${p}.rulesets[${i}]`, errs));
    }
  }
  return errs;
}

const RULE_ACTIONS = ["allow", "deny", "limit"] as const;
const RULE_PHASES = ["preparation", "ready", "active", "between_games", "series_end"] as const;
const RULE_SANCTIONS = ["game_loss", "void_game", "none"] as const;

function idList(errs: FieldError[], o: Obj, key: string, path: string): void {
  const v = o[key]; // optional — absence is not an error
  if (v === undefined || v === null) return;
  if (!isArr(v)) { errs.push({ path: `${path}.${key}`, code: "type", message: "expected array" }); return; }
  if (v.length > LIMITS.maxRuleIds) {
    errs.push({ path: `${path}.${key}`, code: "length", message: `exceeds ${LIMITS.maxRuleIds} ids` });
  }
  v.forEach((x, i) => {
    if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 0) {
      errs.push({ path: `${path}.${key}[${i}]`, code: "type", message: "expected non-negative int" });
    }
  });
}

function validateRuleset(rs: JsonValue, p: string, errs: FieldError[]): void {
  if (!isObj(rs)) { errs.push({ path: p, code: "type", message: "expected object" }); return; }
  uuid(errs, rs, "rulesetId", p);
  uuid(errs, rs, "versionId", p);
  int(errs, rs, "version", p, 1);
  str(errs, rs, "name", p, 64);
  str(errs, rs, "description", p, 512);
  bool(errs, rs, "standard", p);
  const rules = req(errs, rs, "rules", p);
  if (rules !== undefined) {
    if (!isArr(rules)) errs.push({ path: `${p}.rules`, code: "type", message: "expected array" });
    else {
      if (rules.length > LIMITS.maxRulesetRules) {
        errs.push({ path: `${p}.rules`, code: "length", message: `exceeds ${LIMITS.maxRulesetRules} rules` });
      }
      rules.forEach((r, i) => {
        const rp = `${p}.rules[${i}]`;
        if (!isObj(r)) { errs.push({ path: rp, code: "type", message: "expected object" }); return; }
        str(errs, r, "ruleId", rp, 96);
        str(errs, r, "category", rp, 48);
        enumStr(errs, r, "action", rp, RULE_ACTIONS);
        enumStr(errs, r, "phase", rp, RULE_PHASES);
        enumStr(errs, r, "sanction", rp, RULE_SANCTIONS);
        idList(errs, r, "itemIds", rp);
        idList(errs, r, "effectIds", rp);
        // optional fields — only validated when present
        const cl = r.countLimit;
        if (cl !== undefined && (typeof cl !== "number" || !Number.isSafeInteger(cl) || cl < 0 || cl > 99)) {
          errs.push({ path: `${rp}.countLimit`, code: "range", message: "expected int 0-99" });
        }
        const det = r.detectorId;
        if (det !== undefined && (typeof det !== "string"
            || new TextEncoder().encode(det).length > 64)) {
          errs.push({ path: `${rp}.detectorId`, code: "type", message: "expected short string" });
        }
      });
    }
  }
}
