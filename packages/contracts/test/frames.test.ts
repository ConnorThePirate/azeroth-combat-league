import { describe, expect, it } from "vitest";
import {
  Reassembler, TokenBucket, chunkMessage, decodeFrame, encodeFrame,
  newMessageId, newSessionShortId,
} from "../src/frames.js";
import { ProtocolError } from "../src/errors.js";
import { TRANSPORT } from "../src/limits.js";

const rng = (n: number) => new Uint8Array(n).fill(7);

describe("frames", () => {
  it("encode/decode round-trips", () => {
    const f = decodeFrame(encodeFrame({
      sessionShortId: "AAAA", messageId: "BBBBBBBB", seq: 42,
      chunkIndex: 0, chunkTotal: 1, checksum: "0000",
      data: "",
    }).replace("|0000|", `|${"0000"}|`));
    expect(f.messageId).toBe("BBBBBBBB");
  });

  it("rejects oversized frames", () => {
    expect(() => encodeFrame({
      sessionShortId: "AAAA", messageId: "BBBBBBBB", seq: 0,
      chunkIndex: 0, chunkTotal: 1, checksum: "0000",
      data: "x".repeat(TRANSPORT.frameBytes),
    })).toThrow(ProtocolError);
  });

  it("detects corrupted chunk data via checksum", () => {
    const [frame] = chunkMessage({
      sessionShortId: newSessionShortId(rng), messageId: newMessageId(rng),
      seq: 0, body: new TextEncoder().encode("hello world"),
    });
    // flip one character inside the base64url data section (after last '|')
    const idx = frame!.lastIndexOf("|");
    const c = frame![idx + 1]!;
    const flipped = c === "A" ? "B" : "A";
    const corrupted = frame!.slice(0, idx + 1) + flipped + frame!.slice(idx + 2);
    expect(() => decodeFrame(corrupted)).toThrow(ProtocolError);
  });
});

describe("chunking + reassembly", () => {
  const enc = new TextEncoder();
  const sid = newSessionShortId(rng);

  function assemble(body: Uint8Array, shuffle = false): Uint8Array {
    const frames = chunkMessage({ sessionShortId: sid, messageId: newMessageId(rng), seq: 1, body });
    if (shuffle) frames.reverse();
    const r = new Reassembler();
    let out: Uint8Array | null = null;
    for (const f of frames) {
      out = r.push(decodeFrame(f), "sender", 1000) ?? out;
    }
    expect(out).not.toBeNull();
    return out!;
  }

  it("reassembles single-chunk messages", () => {
    const body = enc.encode('{"schema":"x"}');
    expect(assemble(body)).toEqual(body);
  });

  it("reassembles multi-chunk messages regardless of order", () => {
    const body = enc.encode("payload ".repeat(2000)); // ~16 KiB
    expect(assemble(body, true)).toEqual(body);
  });

  it("rejects oversized logical messages", () => {
    expect(() => chunkMessage({
      sessionShortId: sid, messageId: newMessageId(rng), seq: 0,
      body: new Uint8Array(TRANSPORT.maxMessageBytes + 1),
    })).toThrow(ProtocolError);
  });

  it("sweeps stale assemblies", () => {
    const frames = chunkMessage({
      sessionShortId: sid, messageId: newMessageId(rng), seq: 0,
      body: enc.encode("y".repeat(5000)),
    });
    const r = new Reassembler();
    r.push(decodeFrame(frames[0]!), "sender", 0);
    expect(r.size).toBe(1);
    // idle timeout
    expect(r.sweep(TRANSPORT.assemblyIdleTimeoutSec * 1000 + 1).length).toBe(1);
    expect(r.size).toBe(0);
  });

  it("bounds concurrent assemblies per sender", () => {
    const r = new Reassembler();
    for (let i = 0; i < TRANSPORT.maxConcurrentAssemblies; i++) {
      const frames = chunkMessage({
        sessionShortId: sid, messageId: newMessageId((n) => new Uint8Array(n).fill(i + 1)),
        seq: i, body: enc.encode("z".repeat(5000)),
      });
      r.push(decodeFrame(frames[0]!), "sender", 0);
    }
    const extra = chunkMessage({
      sessionShortId: sid, messageId: newMessageId((n) => new Uint8Array(n).fill(99)),
      seq: 9, body: enc.encode("z".repeat(5000)),
    });
    expect(() => r.push(decodeFrame(extra[0]!), "sender", 0)).toThrow(ProtocolError);
    // a different sender is unaffected
    expect(() => r.push(decodeFrame(extra[0]!), "other", 0)).not.toThrow();
  });
});

describe("token bucket", () => {
  it("allows burst then throttles", () => {
    const b = new TokenBucket(0);
    for (let i = 0; i < TRANSPORT.tokenBucketBurst; i++) {
      expect(b.tryTake(i * 10)).toBe(0);
    }
    expect(b.tryTake(100)).toBeGreaterThan(0);
  });
  it("refills over time", () => {
    const b = new TokenBucket(0);
    for (let i = 0; i < TRANSPORT.tokenBucketBurst; i++) b.tryTake(0);
    expect(b.tryTake(5000)).toBe(0); // 5s * 4/s = 20 tokens, capped at burst
  });
});
