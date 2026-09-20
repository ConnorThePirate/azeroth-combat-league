/**
 * Envelope codecs (docs/06):
 *   WFP2:<base64url(raw-DEFLATE(canonical-json))>:<eight-hex-CRC32>  (reports)
 *   WFU1:<base64url(raw-DEFLATE(canonical-json))>:<eight-hex-CRC32>  (addon update)
 *
 * CRC32 is computed over the compressed bytes and detects corruption only —
 * it authenticates nothing. SHA-256 digests inside payloads link content.
 */

import { base64urlDecode, base64urlEncode } from "./base64url.js";
import { canonicalize, parseJson } from "./canonical.js";
import type { JsonValue } from "./canonical.js";
import { crc32Hex } from "./crc32.js";
import { deflateRaw, deflateRawStored, inflateRaw } from "./deflate.js";
import { ProtocolError } from "./errors.js";
import { LIMITS, PROTOCOL } from "./limits.js";

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const textEncoder = new TextEncoder();

export type EnvelopeTag = typeof PROTOCOL.exportTag | typeof PROTOCOL.updateTag;

export interface EncodeOptions {
  /**
   * Emit stored (uncompressed) DEFLATE blocks instead of compressed output.
   * Used for WFU1 bundles so the addon can inflate them without a vendored
   * deflate library, and by the addon itself for WFP2 exports.
   */
  stored?: boolean;
}

function encodePayload(payload: JsonValue, tag: EnvelopeTag, opts: EncodeOptions): string {
  const canonical = canonicalize(payload);
  const plain = textEncoder.encode(canonical);
  if (plain.length > LIMITS.decodedBytes) {
    throw new ProtocolError("decoded_too_large", `payload exceeds ${LIMITS.decodedBytes} bytes`);
  }
  const compressed = opts.stored ? deflateRawStored(plain) : deflateRaw(plain);
  if (compressed.length > LIMITS.compressedBytes) {
    throw new ProtocolError("compressed_too_large", `compressed payload exceeds ${LIMITS.compressedBytes} bytes`);
  }
  return `${tag}:${base64urlEncode(compressed)}:${crc32Hex(compressed)}`;
}

function decodePayload(envelope: string, expectedTag: EnvelopeTag): JsonValue {
  const parts = envelope.trim().split(":");
  if (parts.length !== 3) {
    throw new ProtocolError("malformed_envelope", "expected TAG:payload:crc");
  }
  const [tag, b64, crc] = parts;
  if (tag !== expectedTag) {
    throw new ProtocolError("bad_tag", `expected ${expectedTag} envelope, got ${tag ?? "?"}`);
  }
  // base64url expands ~4/3; reject before decoding when obviously over limit
  if (b64!.length > Math.ceil(LIMITS.compressedBytes / 3) * 4 + 4) {
    throw new ProtocolError("compressed_too_large", "compressed section too large");
  }
  let compressed: Uint8Array;
  try {
    compressed = base64urlDecode(b64!);
  } catch {
    throw new ProtocolError("malformed_envelope", "invalid base64url payload");
  }
  if (compressed.length > LIMITS.compressedBytes) {
    throw new ProtocolError("compressed_too_large", `compressed payload exceeds ${LIMITS.compressedBytes} bytes`);
  }
  if (!/^[0-9a-f]{8}$/.test(crc!) || crc32Hex(compressed) !== crc) {
    throw new ProtocolError("bad_crc", "CRC32 mismatch — corrupted or truncated export");
  }
  const plain = inflateRaw(compressed, LIMITS.decodedBytes);
  let text: string;
  try {
    text = textDecoder.decode(plain);
  } catch {
    throw new ProtocolError("invalid_json", "payload is not valid UTF-8");
  }
  return parseJson(text, {
    maxDepth: LIMITS.maxDepth,
    maxStringBytes: LIMITS.maxStringBytes,
  });
}

// ---- WFP2: player -> website ---------------------------------------------

export function encodeExport(payload: JsonValue, opts: EncodeOptions = {}): string {
  return encodePayload(payload, PROTOCOL.exportTag, opts);
}

export function decodeExport(envelope: string): JsonValue {
  return decodePayload(envelope, PROTOCOL.exportTag);
}

// ---- WFU1: website -> addon ----------------------------------------------

export function encodeUpdate(payload: JsonValue, opts: EncodeOptions = {}): string {
  return encodePayload(payload, PROTOCOL.updateTag, opts);
}

export function decodeUpdate(envelope: string): JsonValue {
  return decodePayload(envelope, PROTOCOL.updateTag);
}
