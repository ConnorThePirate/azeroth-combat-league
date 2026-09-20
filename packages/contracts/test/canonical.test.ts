import { describe, expect, it } from "vitest";
import { canonicalize, parseJson, parseCanonical, recanonicalize } from "../src/canonical.js";
import { hashCanonical } from "../src/hash.js";
import { ProtocolError } from "../src/errors.js";

describe("canonicalize", () => {
  it("sorts object keys by code unit", () => {
    expect(canonicalize({ b: 1, a: 2, Z: 3 })).toBe('{"Z":3,"a":2,"b":1}');
  });
  it("emits no whitespace", () => {
    expect(canonicalize({ a: [1, { b: null, c: true }] })).toBe('{"a":[1,{"b":null,"c":true}]}');
  });
  it("escapes quote, backslash and control chars", () => {
    expect(canonicalize('a"b\\c\nd')).toBe('"a\\"b\\\\c\\u000ad"');
    expect(canonicalize("")).toBe('"\\u0001\\u001f"');
    expect(canonicalize("\t\r")).toBe('"\\u0009\\u000d"');
  });
  it("preserves non-ASCII UTF-8 exactly", () => {
    expect(canonicalize("Äëñå 🌍")).toBe('"Äëñå 🌍"');
  });
  it("rejects floats and unsafe integers", () => {
    expect(() => canonicalize(1.5)).toThrow(ProtocolError);
    expect(() => canonicalize(Number.MAX_SAFE_INTEGER + 1)).toThrow(ProtocolError);
    expect(() => canonicalize(NaN)).toThrow(ProtocolError);
  });
  it("rejects lone surrogates", () => {
    expect(() => canonicalize("\ud800")).toThrow(ProtocolError);
  });
  it("rejects non-ASCII object keys", () => {
    expect(() => canonicalize({ "käy": 1 })).toThrow(ProtocolError);
  });
  it("rejects undefined values", () => {
    expect(() => canonicalize({ a: undefined } as never)).toThrow(ProtocolError);
  });
  it("golden: contract example stays stable", () => {
    const v = parseJson('{"schema":"wf.match-contract.v2","sessionId":"11111111-1111-4111-8111-111111111111","bestOf":3}');
    expect(canonicalize(v)).toBe(
      '{"bestOf":3,"schema":"wf.match-contract.v2","sessionId":"11111111-1111-4111-8111-111111111111"}',
    );
  });
});

describe("parseJson", () => {
  it("round-trips through canonicalize", () => {
    const src = { z: [1, "two", false, null], a: { x: -5 } };
    expect(parseJson(canonicalize(src))).toEqual(src);
  });
  it("rejects duplicate object keys", () => {
    expect(() => parseJson('{"a":1,"a":2}')).toThrow(ProtocolError);
  });
  it("rejects non-integer numbers", () => {
    expect(() => parseJson("1.5")).toThrow(ProtocolError);
    expect(() => parseJson("1e3")).toThrow(ProtocolError);
  });
  it("enforces depth limit", () => {
    const deep = "[".repeat(17) + "0" + "]".repeat(17);
    expect(() => parseJson(deep)).toThrow(ProtocolError);
    expect(() => parseJson(deep, { maxDepth: 20 })).not.toThrow();
  });
  it("enforces string byte limit", () => {
    const long = `"${"x".repeat(4097)}"`;
    expect(() => parseJson(long)).toThrow(ProtocolError);
  });
  it("rejects trailing content", () => {
    expect(() => parseJson("{} []")).toThrow(ProtocolError);
  });
  it("handles escaped unicode pairs", () => {
    expect(parseJson('"\\ud83c\\udf0d"')).toBe("🌍");
  });
});

describe("parseCanonical", () => {
  it("accepts canonical bytes", () => {
    expect(parseCanonical('{"a":1,"b":2}')).toEqual({ a: 1, b: 2 });
  });
  it("rejects whitespace", () => {
    expect(() => parseCanonical('{ "a": 1 }')).toThrow(ProtocolError);
  });
  it("rejects unsorted keys", () => {
    expect(() => parseCanonical('{"b":1,"a":2}')).toThrow(ProtocolError);
  });
});

describe("hashing", () => {
  it("sha256 of canonical bytes is stable", () => {
    // sha256('{"a":1}') — verified against system sha256sum
    expect(hashCanonical({ a: 1 })).toBe(
      "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
    );
  });
});

describe("recanonicalize", () => {
  it("normalizes whitespace and key order", () => {
    expect(recanonicalize('{ "b" : 1, "a" : 2 }')).toBe('{"a":2,"b":1}');
  });
});
