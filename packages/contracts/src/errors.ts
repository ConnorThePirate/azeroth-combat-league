/**
 * Structured protocol errors. `code` values are stable and machine-readable;
 * reason codes used by the ingest API live in docs/15.
 */

export type EnvelopeErrorCode =
  | "bad_tag"
  | "malformed_envelope"
  | "bad_crc"
  | "compressed_too_large"
  | "decoded_too_large"
  | "decompression_failed"
  | "too_deep"
  | "string_too_long"
  | "duplicate_key"
  | "invalid_json"
  | "non_canonical"
  | "too_many_reports"
  | "unsupported_schema"
  | "invalid_field"
  | "account_mismatch"
  | "stale_sequence";

export class ProtocolError extends Error {
  readonly code: EnvelopeErrorCode;
  constructor(code: EnvelopeErrorCode, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

/** Server reason codes (docs/15) re-exported for shared use. */
export const REASON_CODES = [
  "hash_mismatch",
  "duplicate_origin_nonce",
  "outcome_conflict",
  "coverage_unknown",
  "identity_unverified",
  "pair_zero_weight",
  "wrong_bracket",
  "expired_config",
  "unsupported_build",
  "missing_peer",
  "referee_ruling",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
