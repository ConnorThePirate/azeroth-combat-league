/**
 * Protocol limits from docs/06_PROTOCOL_AND_SYNC.md and docs/15_API_CONTRACTS.md.
 * Envelope limits apply equally to WFP2 (report export) and WFU1 (addon update).
 */

export const LIMITS = {
  /** Maximum bytes of the decoded canonical JSON payload inside an envelope. */
  decodedBytes: 256 * 1024,
  /** Maximum bytes of the compressed (raw-DEFLATE) section. */
  compressedBytes: 128 * 1024,
  /** Maximum number of match reports in one sync envelope. */
  maxReports: 25,
  /** Maximum JSON nesting depth. */
  maxDepth: 16,
  /** Maximum byte length of a JSON string value, unless explicitly bounded elsewhere. */
  maxStringBytes: 4096,
  /** Receipts per addon-update bundle (docs/06 website-to-addon snapshot). */
  maxUpdateReceipts: 25,
  /** Ladder snapshots per addon-update bundle. */
  maxUpdateLadderSnapshots: 100,
  /** Maximum characters entries in an addon-update bundle. */
  maxUpdateCharacters: 100,
  /** Published rulesets per addon-update bundle (docs/08 community rules). */
  maxUpdateRulesets: 16,
  /** Maximum rule clauses inside one published ruleset. */
  maxRulesetRules: 64,
  /** Item/effect ids a single rule clause may name. */
  maxRuleIds: 32,
} as const;

/** Peer-to-peer transport defaults to prove (docs/06). */
export const TRANSPORT = {
  /** Maximum addon-message frame size including header. */
  frameBytes: 200,
  /** Maximum logical message size. */
  maxMessageBytes: 16 * 1024,
  maxChunks: 256,
  maxConcurrentAssemblies: 4,
  assemblyIdleTimeoutSec: 30,
  assemblyTotalTimeoutSec: 180,
  tokenBucketPerSec: 4,
  tokenBucketBurst: 8,
  /** Missing-frame retry delays (seconds), only outside lockdown. */
  retryDelaysSec: [2, 5, 10] as readonly number[],
} as const;

export const PROTOCOL = {
  /** Addon message prefix registered with the game client. */
  prefix: "WFCPVP2",
  major: 2,
  /** Export envelope tag (player -> website). */
  exportTag: "WFP2",
  /** Addon update envelope tag (website -> addon). */
  updateTag: "WFU1",
} as const;
