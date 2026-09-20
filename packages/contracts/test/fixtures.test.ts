/**
 * Generates cross-language golden fixtures consumed by the Lua fixture
 * runner (apps/addon/tools/lua-fixture-runner.mjs). Runs inside vitest so
 * regeneration is always in sync with the implementation; the written files
 * are committed and reviewed like code.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalize, canonicalBytes } from "../src/canonical.js";
import { sha256Hex } from "../src/hash.js";
import { crc32Hex } from "../src/crc32.js";
import { deflateRawStored, inflateRaw } from "../src/deflate.js";
import { base64urlEncode } from "../src/base64url.js";
import { encodeExport, encodeUpdate, decodeExport, decodeUpdate } from "../src/envelope.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
mkdirSync(outDir, { recursive: true });

const enc = new TextEncoder();
const hex = (u8: Uint8Array) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
const U = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

describe("golden fixtures", () => {
  it("writes canonicalization fixtures", () => {
    const cases = [
      { name: "empty-object", value: {} },
      { name: "flat", value: { b: 1, a: "x", Z: true, n: null } },
      { name: "nested", value: { arr: [1, -5, "two", false, null], obj: { y: { z: 0 } } } },
      { name: "escapes", value: { s: 'quote" back\\slash newline\n tab\t ctrl del' } },
      { name: "unicode-preserved", value: { s: "Äëñå 🌍 é" } },
      { name: "big-int", value: { t: 1789833600000, neg: -42 } },
      { name: "deep", value: { a: [{ b: [{ c: [[]] }] }] } },
    ];
    const fixtures = cases.map((c) => {
      const text = canonicalize(c.value as never);
      const bytes = canonicalBytes(c.value as never);
      return { name: c.name, canonical: text, canonicalHex: hex(bytes), sha256: sha256Hex(bytes) };
    });
    writeFileSync(join(outDir, "canonical.json"), JSON.stringify(fixtures, null, 2));
    expect(fixtures.every((f) => f.sha256.length === 64)).toBe(true);
  });

  it("writes hash/checksum/base64 fixtures", () => {
    writeFileSync(join(outDir, "primitives.json"), JSON.stringify([
      { name: "sha256-abc", inputHex: hex(enc.encode("abc")), sha256: sha256Hex(enc.encode("abc")) },
      { name: "sha256-empty", inputHex: "", sha256: sha256Hex(new Uint8Array(0)) },
      { name: "crc32-123456789", inputHex: hex(enc.encode("123456789")), crc32: crc32Hex(enc.encode("123456789")) },
      {
        name: "b64url-bytes",
        inputHex: hex(new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])),
        base64url: base64urlEncode(new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])),
      },
    ], null, 2));
  });

  it("writes stored-deflate fixtures", () => {
    const cases = [
      { name: "empty", payload: "" },
      { name: "small-json", payload: '{"a":1,"b":[2,3]}' },
      { name: "multiblock", payload: "block-data ".repeat(7000) },
    ];
    const fixtures = cases.map((c) => {
      const plain = enc.encode(c.payload);
      const stored = deflateRawStored(plain);
      return {
        name: c.name,
        plainLength: plain.length,
        plainHex: plain.length <= 4096 ? hex(plain) : null,
        storedHex: hex(stored),
      };
    });
    writeFileSync(join(outDir, "deflate.json"), JSON.stringify(fixtures, null, 2));
    for (const f of fixtures) {
      expect(inflateRaw(Buffer.from(f.storedHex, "hex"), 1 << 20).length).toBe(f.plainLength);
    }
  });

  it("writes envelope fixtures and verifies round-trip", () => {
    const report = {
      schema: "wf.match-report.v2",
      sessionId: U(1), contractHash: "a".repeat(64),
      originCharacterId: U(5), installationId: U(7), nonce: "nonce-1",
      build: "1.60.1.69913", addonVersion: "0.1.0", detectorCatalogVersion: "cat-0",
      proposedAtMs: 1789833600000, acceptedAtMs: 1789833610000,
      startedAtMs: 1789833620000, finishedAtMs: 1789833680000,
      games: [{
        index: 0, observedStartMs: 1789833620000, observedEndMs: 1789833680000,
        claimedWinnerCharacterId: U(5), finishReason: "death",
        facts: [], interferenceCandidates: [], violationCandidates: [],
      }],
      coverage: [], attestations: [], peerDigests: [],
    };
    const envelopePayload = {
      schema: "wf.sync-envelope.v2",
      installationId: U(7), build: "1.60.1.69913", addonVersion: "0.1.0",
      exportedAtMs: 1789833700000, reports: [report],
    };
    const updatePayload = {
      schema: "wf.addon-update.v1", accountId: U(8), snapshotSequence: 3,
      issuedAtMs: 1789833800000, characters: [], receipts: [], configVersion: "beta-v2",
    };
    const fixtures = {
      wfp2_stored: encodeExport(envelopePayload as never, { stored: true }),
      wfp2_compressed: encodeExport(envelopePayload as never),
      wfu1_stored: encodeUpdate(updatePayload as never, { stored: true }),
      envelopePayload,
      updatePayload,
    };
    writeFileSync(join(outDir, "envelopes.json"), JSON.stringify(fixtures, null, 2));
    expect(decodeExport(fixtures.wfp2_stored)).toEqual(envelopePayload);
    expect(decodeExport(fixtures.wfp2_compressed)).toEqual(envelopePayload);
    expect(decodeUpdate(fixtures.wfu1_stored)).toEqual(updatePayload);
  });
});
