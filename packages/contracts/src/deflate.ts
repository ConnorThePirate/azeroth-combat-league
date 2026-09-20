/**
 * Raw DEFLATE (RFC 1951, no zlib/gzip wrapper) — the only codec permitted
 * inside WFP2/WFU1 envelopes per docs/06.
 *
 * Two encoders are provided:
 * - `deflateRaw`: real compression via fflate (browser + Node).
 * - `deflateRawStored`: emits valid DEFLATE "stored" (uncompressed) blocks.
 *   The WoW addon can produce stored blocks in pure Lua without a compression
 *   library, and any conforming inflater — zlib included — accepts them.
 *   The website may emit WFU1 bundles with stored blocks so the addon can
 *   inflate them without vendored deflate code.
 */

import { deflateSync, inflateSync } from "fflate";
import { ProtocolError } from "./errors.js";

export function deflateRaw(data: Uint8Array): Uint8Array {
  // fflate's deflate is a raw DEFLATE stream (no zlib/gzip wrapper).
  return deflateSync(data);
}

export function inflateRaw(data: Uint8Array, maxBytes: number): Uint8Array {
  try {
    const out = inflateSync(data);
    if (out.length > maxBytes) {
      throw new ProtocolError("decoded_too_large", `decompressed payload exceeds ${maxBytes} bytes`);
    }
    return out;
  } catch (e) {
    if (e instanceof ProtocolError) throw e;
    throw new ProtocolError("decompression_failed", "invalid raw-DEFLATE data");
  }
}

/** Emit a raw-DEFLATE stream made entirely of stored (BTYPE=00) blocks. */
export function deflateRawStored(data: Uint8Array): Uint8Array {
  const nBlocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(data.length + nBlocks * 5);
  let o = 0;
  let i = 0;
  do {
    const remaining = data.length - i;
    const len = Math.min(remaining, 65535);
    const final = i + len >= data.length;
    out[o++] = final ? 0x01 : 0x00; // BFINAL + BTYPE=00 (already byte-aligned)
    out[o++] = len & 0xff;
    out[o++] = (len >> 8) & 0xff;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >> 8) & 0xff;
    out.set(data.subarray(i, i + len), o);
    o += len;
    i += len;
  } while (i < data.length);
  return out.subarray(0, o);
}

/**
 * Inflate a raw-DEFLATE stream that uses only stored blocks. Used by tests and
 * mirrored by the addon's minimal Lua inflater. Rejects compressed blocks.
 */
export function inflateRawStored(data: Uint8Array, maxBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let o = 0;
  for (;;) {
    if (o + 5 > data.length) {
      throw new ProtocolError("decompression_failed", "truncated stored block header");
    }
    const header = data[o]!;
    const bfinal = header & 1;
    const btype = (header >> 1) & 3;
    if (btype !== 0 || (header & 0xf8) !== 0) {
      throw new ProtocolError("decompression_failed", "not a stored DEFLATE block");
    }
    const len = data[o + 1]! | (data[o + 2]! << 8);
    const nlen = data[o + 3]! | (data[o + 4]! << 8);
    if (nlen !== (~len & 0xffff)) {
      throw new ProtocolError("decompression_failed", "stored block NLEN mismatch");
    }
    o += 5;
    if (o + len > data.length) {
      throw new ProtocolError("decompression_failed", "truncated stored block data");
    }
    chunks.push(data.subarray(o, o + len));
    total += len;
    if (total > maxBytes) {
      throw new ProtocolError("decoded_too_large", `decompressed payload exceeds ${maxBytes} bytes`);
    }
    o += len;
    if (bfinal) break;
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
