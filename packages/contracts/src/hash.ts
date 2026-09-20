import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { canonicalBytes } from "./canonical.js";
import type { JsonValue } from "./canonical.js";

/** SHA-256 of raw bytes, lowercase hex. */
export function sha256Hex(data: Uint8Array): string {
  return bytesToHex(sha256(data));
}

/** SHA-256 of the canonical bytes of a JSON value. */
export function hashCanonical(value: JsonValue): string {
  return sha256Hex(canonicalBytes(value));
}

export { hexToBytes };
