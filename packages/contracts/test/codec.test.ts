import { describe, expect, it } from "vitest";
import { inflateSync } from "fflate";
import { crc32, crc32Hex } from "../src/crc32.js";
import { deflateRawStored, inflateRawStored, deflateRaw, inflateRaw } from "../src/deflate.js";
import { base64urlDecode, base64urlEncode } from "../src/base64url.js";
import { sha256Hex } from "../src/hash.js";
import { encodeExport, decodeExport, encodeUpdate, decodeUpdate } from "../src/envelope.js";
import { ProtocolError } from "../src/errors.js";

const enc = new TextEncoder();

describe("crc32", () => {
  it("matches the standard test vector", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32Hex(enc.encode("123456789"))).toBe("cbf43926");
  });
});

describe("sha256", () => {
  it("matches the abc test vector", () => {
    expect(sha256Hex(enc.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const data = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base64urlDecode(base64urlEncode(data))).toEqual(data);
  });
  it("produces no padding or unsafe characters", () => {
    const s = base64urlEncode(new Uint8Array([251, 255, 254, 239]));
    expect(s).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});

describe("deflate", () => {
  it("fflate round-trips", () => {
    const data = enc.encode('{"a":1,"b":[2,3]}');
    expect(inflateRaw(deflateRaw(data), 1024)).toEqual(data);
  });
  it("stored blocks are valid DEFLATE for zlib-compatible inflaters", () => {
    const data = enc.encode("hello stored world ".repeat(10));
    expect(inflateSync(deflateRawStored(data))).toEqual(data);
  });
  it("stored inflater round-trips", () => {
    const data = enc.encode('{"k":"v","n":42}');
    expect(inflateRawStored(deflateRawStored(data), 1024)).toEqual(data);
  });
  it("stored inflater rejects compressed blocks", () => {
    const data = enc.encode("compressible compressible compressible");
    expect(() => inflateRawStored(deflateRaw(data), 1024)).toThrow(ProtocolError);
  });
  it("enforces output size limit", () => {
    const data = enc.encode("x".repeat(100));
    expect(() => inflateRaw(deflateRaw(data), 10)).toThrow(ProtocolError);
  });
});

describe("envelopes", () => {
  const payload = { schema: "wf.sync-envelope.v2", reports: [], n: 7 };

  it("WFP2 round-trips compressed and stored", () => {
    for (const stored of [false, true]) {
      const env = encodeExport(payload, { stored });
      expect(env.startsWith("WFP2:")).toBe(true);
      expect(decodeExport(env)).toEqual(payload);
    }
  });

  it("WFU1 round-trips and cannot be confused with WFP2", () => {
    const env = encodeUpdate(payload, { stored: true });
    expect(env.startsWith("WFU1:")).toBe(true);
    expect(decodeUpdate(env)).toEqual(payload);
    expect(() => decodeExport(env)).toThrow(ProtocolError);
  });

  it("detects corruption via CRC", () => {
    const env = encodeExport(payload);
    const bad = env.slice(0, -4) + "ffff";
    expect(() => decodeExport(bad)).toThrow(ProtocolError);
  });

  it("detects payload tampering", () => {
    const env = encodeExport(payload);
    const parts = env.split(":");
    const b = parts[1]!;
    parts[1] = (b[0] === "A" ? "B" : "A") + b.slice(1);
    expect(() => decodeExport(parts.join(":"))).toThrow(ProtocolError);
  });

  it("rejects malformed envelopes", () => {
    expect(() => decodeExport("WFP2")).toThrow(ProtocolError);
    expect(() => decodeExport("WFP2:!!!:00000000")).toThrow(ProtocolError);
    expect(() => decodeExport("XXX:AAAA:00000000")).toThrow(ProtocolError);
  });
});
