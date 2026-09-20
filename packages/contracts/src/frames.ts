/**
 * Peer transport framing (docs/06). Addon messages travel over the game's
 * addon channel, so every frame is printable ASCII at or below
 * TRANSPORT.frameBytes including its header.
 *
 * Frame layout (pipe-delimited):
 *   WF2|<sid>|<mid>|<seq>|<ci>/<cn>|<sum>|<data>
 *     sid  — 4-char base64url session short ID (sender-chosen per session)
 *     mid  — 8-char base64url message ID
 *     seq  — sender-side message sequence, base36
 *     ci/cn— chunk index (0-based) / chunk total, base36
 *     sum  — 4-hex CRC32 of this chunk's decoded bytes
 *     data — base64url chunk payload
 *
 * Integrity only: a checksum authenticates nothing. Sender identity is
 * validated from the game event, never the frame body.
 */

import { base64urlDecode, base64urlEncode } from "./base64url.js";
import { crc32 } from "./crc32.js";
import { ProtocolError } from "./errors.js";
import { TRANSPORT } from "./limits.js";

export interface Frame {
  sessionShortId: string;
  messageId: string;
  seq: number;
  chunkIndex: number;
  chunkTotal: number;
  checksum: string;
  data: string;
}

const B64_RE = /^[A-Za-z0-9\-_]+$/;
const B36_RE = /^[0-9a-z]+$/;

export function encodeFrame(f: Frame): string {
  const head = `WF2|${f.sessionShortId}|${f.messageId}|${f.seq.toString(36)}|${f.chunkIndex.toString(36)}/${f.chunkTotal.toString(36)}|${f.checksum}|`;
  const frame = head + f.data;
  if (frame.length > TRANSPORT.frameBytes) {
    throw new ProtocolError("invalid_field", `frame exceeds ${TRANSPORT.frameBytes} bytes`);
  }
  return frame;
}

export function decodeFrame(text: string): Frame {
  if (text.length > TRANSPORT.frameBytes) {
    throw new ProtocolError("invalid_field", "frame too large");
  }
  const parts = text.split("|");
  if (parts.length !== 7 || parts[0] !== "WF2") {
    throw new ProtocolError("malformed_envelope", "bad frame layout");
  }
  const [, sid, mid, seq, cix, sum, data] = parts as [string, string, string, string, string, string, string];
  if (!/^[A-Za-z0-9\-_]{4}$/.test(sid)) throw new ProtocolError("invalid_field", "bad session short id");
  if (!/^[A-Za-z0-9\-_]{8}$/.test(mid)) throw new ProtocolError("invalid_field", "bad message id");
  if (!B36_RE.test(seq)) throw new ProtocolError("invalid_field", "bad sequence");
  if (!/^[0-9a-f]{4}$/.test(sum)) throw new ProtocolError("invalid_field", "bad checksum");
  if (data.length > 0 && !B64_RE.test(data)) throw new ProtocolError("invalid_field", "bad chunk data");
  const slash = cix.indexOf("/");
  if (slash <= 0) throw new ProtocolError("invalid_field", "bad chunk index");
  const chunkIndex = parseInt(cix.slice(0, slash), 36);
  const chunkTotal = parseInt(cix.slice(slash + 1), 36);
  if (!Number.isSafeInteger(chunkIndex) || !Number.isSafeInteger(chunkTotal) || chunkTotal < 1 || chunkIndex >= chunkTotal || chunkTotal > TRANSPORT.maxChunks) {
    throw new ProtocolError("invalid_field", "bad chunk index/total");
  }
  const raw = base64urlDecode(data);
  const crc = (crc32(raw) & 0xffff).toString(16).padStart(4, "0");
  if (crc !== sum) {
    throw new ProtocolError("bad_crc", "chunk checksum mismatch");
  }
  const msgSeq = parseInt(seq, 36);
  if (!Number.isSafeInteger(msgSeq)) throw new ProtocolError("invalid_field", "bad sequence");
  return { sessionShortId: sid, messageId: mid, seq: msgSeq, chunkIndex, chunkTotal, checksum: sum, data };
}

/** Split a logical message body into frames within the byte budget. */
export function chunkMessage(opts: {
  sessionShortId: string;
  messageId: string;
  seq: number;
  body: Uint8Array;
}): string[] {
  const { sessionShortId, messageId, seq, body } = opts;
  if (body.length > TRANSPORT.maxMessageBytes) {
    throw new ProtocolError("invalid_field", `message exceeds ${TRANSPORT.maxMessageBytes} bytes`);
  }
  // Find the data budget per frame: header overhead is fixed width except
  // ci/cn, so compute against the widest possible chunk counters.
  const total = Math.max(1, Math.ceil(body.length / 1)); // placeholder, refined below
  void total;
  const probeTotal = Math.min(TRANSPORT.maxChunks, Math.max(1, Math.ceil(body.length / 96)));
  const headLen = `WF2|${sessionShortId}|${messageId}|${seq.toString(36)}|${(probeTotal - 1).toString(36)}/${probeTotal.toString(36)}|ffff|`.length;
  const dataChars = TRANSPORT.frameBytes - headLen;
  const dataBytes = Math.floor(dataChars / 4) * 3 - 3; // whole b64 groups, conservative
  const chunkTotal = Math.max(1, Math.ceil(body.length / dataBytes));
  if (chunkTotal > TRANSPORT.maxChunks) {
    throw new ProtocolError("invalid_field", `message requires ${chunkTotal} chunks (max ${TRANSPORT.maxChunks})`);
  }
  const frames: string[] = [];
  for (let ci = 0; ci < chunkTotal; ci++) {
    const chunk = body.subarray(ci * dataBytes, Math.min(body.length, (ci + 1) * dataBytes));
    const sum = (crc32(chunk) & 0xffff).toString(16).padStart(4, "0");
    frames.push(encodeFrame({
      sessionShortId, messageId, seq,
      chunkIndex: ci, chunkTotal,
      checksum: sum, data: base64urlEncode(chunk),
    }));
  }
  return frames;
}

/** Reassembly state for one sender. */
export interface Assembly {
  messageId: string;
  seq: number;
  total: number;
  chunks: (Uint8Array | null)[];
  received: number;
  lastProgressMs: number;
  startedMs: number;
}

export class Reassembler {
  private assemblies = new Map<string, Assembly>();

  /**
   * Feed a decoded frame. Returns the complete message body when the last
   * missing chunk arrives, otherwise null. Expire assemblies with
   * `sweep(nowMs)`.
   */
  push(frame: Frame, senderKey: string, nowMs: number): Uint8Array | null {
    const key = `${senderKey}|${frame.messageId}`;
    let a = this.assemblies.get(key);
    if (!a) {
      const senderAssemblies = [...this.assemblies.keys()].filter((k) => k.startsWith(`${senderKey}|`));
      if (senderAssemblies.length >= TRANSPORT.maxConcurrentAssemblies) {
        throw new ProtocolError("invalid_field", "too many concurrent assemblies");
      }
      a = {
        messageId: frame.messageId,
        seq: frame.seq,
        total: frame.chunkTotal,
        chunks: new Array(frame.chunkTotal).fill(null),
        received: 0,
        lastProgressMs: nowMs,
        startedMs: nowMs,
      };
      this.assemblies.set(key, a);
    }
    if (a.total !== frame.chunkTotal) {
      throw new ProtocolError("invalid_field", "chunk total changed mid-assembly");
    }
    if (a.chunks[frame.chunkIndex] === null) {
      a.chunks[frame.chunkIndex] = base64urlDecode(frame.data);
      a.received++;
      a.lastProgressMs = nowMs;
    }
    if (a.received < a.total) return null;
    const size = a.chunks.reduce((n, c) => n + (c?.length ?? 0), 0);
    const out = new Uint8Array(size);
    let p = 0;
    for (const c of a.chunks) {
      out.set(c!, p);
      p += c!.length;
    }
    this.assemblies.delete(key);
    return out;
  }

  /** Drop stale assemblies; returns the dropped keys for diagnostics. */
  sweep(nowMs: number): string[] {
    const dropped: string[] = [];
    for (const [k, a] of this.assemblies) {
      const idle = nowMs - a.lastProgressMs;
      const age = nowMs - a.startedMs;
      if (idle > TRANSPORT.assemblyIdleTimeoutSec * 1000 || age > TRANSPORT.assemblyTotalTimeoutSec * 1000) {
        this.assemblies.delete(k);
        dropped.push(k);
      }
    }
    return dropped;
  }

  get size(): number {
    return this.assemblies.size;
  }
}

/** Token bucket: 4 frames/sec sustained, burst 8 (docs/06). */
export class TokenBucket {
  private tokens: number;
  private lastMs: number;
  constructor(nowMs: number) {
    this.tokens = TRANSPORT.tokenBucketBurst;
    this.lastMs = nowMs;
  }
  /** Consume one frame's worth; returns ms to wait if insufficient, else 0. */
  tryTake(nowMs: number): number {
    const elapsed = (nowMs - this.lastMs) / 1000;
    this.tokens = Math.min(TRANSPORT.tokenBucketBurst, this.tokens + elapsed * TRANSPORT.tokenBucketPerSec);
    this.lastMs = nowMs;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil((1 - this.tokens) / TRANSPORT.tokenBucketPerSec * 1000);
  }
}

/** New random IDs: sid is 3 bytes -> 4 chars, mid is 6 bytes -> 8 chars. */
export function newSessionShortId(randomBytes: (n: number) => Uint8Array): string {
  return base64urlEncode(randomBytes(3));
}
export function newMessageId(randomBytes: (n: number) => Uint8Array): string {
  return base64urlEncode(randomBytes(6));
}
