/**
 * Canonical "restricted JSON" per docs/06:
 * - object keys are ASCII and emitted sorted by code unit
 * - UTF-8 string values preserved exactly; no Unicode normalization
 * - only \" and \\ short escapes; control chars < 0x20 as \u00xx (lowercase hex)
 * - integers in the safe range only; no floats, ever
 * - arrays ordered; booleans/null standard; no whitespace
 * - duplicate object keys rejected at parse time
 *
 * The Lua addon implements byte-identical output; cross-language fixtures in
 * test/fixtures pin the exact escaping rules.
 */

import { ProtocolError } from "./errors.js";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ParseOptions {
  /** Maximum nesting depth (default 16). */
  maxDepth?: number;
  /** Maximum UTF-8 byte length of any single string (default 4096). */
  maxStringBytes?: number;
  /**
   * When true, additionally enforce canonical form: no insignificant
   * whitespace and object keys must already be in sorted order.
   */
  requireCanonical?: boolean;
}

const DEFAULT_MAX_DEPTH = 16;
const DEFAULT_MAX_STRING_BYTES = 4096;

const textEncoder = new TextEncoder();

function isAsciiKey(key: string): boolean {
  for (let i = 0; i < key.length; i++) {
    if (key.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function escapeString(s: string, out: string[]): void {
  out.push('"');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out.push('\\"');
    else if (c === 0x5c) out.push("\\\\");
    else if (c < 0x20) {
      out.push("\\u");
      out.push(c.toString(16).padStart(4, "0"));
    } else {
      out.push(s[i]!);
    }
  }
  out.push('"');
}

/**
 * Serialize a value to canonical JSON bytes (as a JS string; every emitted
 * character is either ASCII or an original UTF-16 code unit, so encoding the
 * result as UTF-8 yields the canonical bytes).
 */
export function canonicalize(value: JsonValue): string {
  const out: string[] = [];
  writeValue(value, out, 0);
  return out.join("");
}

/** Canonical bytes as UTF-8. */
export function canonicalBytes(value: JsonValue): Uint8Array {
  return textEncoder.encode(canonicalize(value));
}

function writeValue(value: JsonValue, out: string[], depth: number): void {
  if (value === null) {
    out.push("null");
    return;
  }
  switch (typeof value) {
    case "boolean":
      out.push(value ? "true" : "false");
      return;
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new ProtocolError("invalid_json", "non-integer or unsafe number in canonical value");
      }
      out.push(String(value));
      return;
    case "string":
      if (hasLoneSurrogate(value)) {
        throw new ProtocolError("invalid_json", "lone surrogate in string");
      }
      escapeString(value, out);
      return;
    case "object": {
      if (Array.isArray(value)) {
        out.push("[");
        for (let i = 0; i < value.length; i++) {
          if (i > 0) out.push(",");
          writeValue(value[i]!, out, depth + 1);
        }
        out.push("]");
        return;
      }
      const keys = Object.keys(value);
      for (const k of keys) {
        if (!isAsciiKey(k)) {
          throw new ProtocolError("invalid_json", `non-ASCII object key: ${k}`);
        }
      }
      keys.sort();
      out.push("{");
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        const v = value[k];
        if (v === undefined) {
          throw new ProtocolError("invalid_json", `undefined value for key ${k}`);
        }
        if (i > 0) out.push(",");
        escapeString(k, out);
        out.push(":");
        writeValue(v, out, depth + 1);
      }
      out.push("}");
      return;
    }
    default:
      throw new ProtocolError("invalid_json", `unsupported value type ${typeof value}`);
  }
}

// ---------------------------------------------------------------------------
// Strict parser
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;
  constructor(
    private readonly text: string,
    private readonly opts: Required<ParseOptions>,
  ) {}

  parse(): JsonValue {
    this.skipWs();
    const v = this.readValue(0);
    this.skipWs();
    if (this.pos !== this.text.length) {
      throw new ProtocolError("invalid_json", "trailing content after JSON value");
    }
    return v;
  }

  private peek(): number {
    return this.pos < this.text.length ? this.text.charCodeAt(this.pos) : -1;
  }

  private skipWs(): void {
    if (this.opts.requireCanonical) {
      if (this.peek() === 0x20 || this.peek() === 0x09 || this.peek() === 0x0a || this.peek() === 0x0d) {
        throw new ProtocolError("non_canonical", "whitespace in canonical JSON");
      }
      return;
    }
    while (this.pos < this.text.length) {
      const c = this.text.charCodeAt(this.pos);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.pos++;
      else break;
    }
  }

  private readValue(depth: number): JsonValue {
    if (depth > this.opts.maxDepth) {
      throw new ProtocolError("too_deep", `JSON depth exceeds ${this.opts.maxDepth}`);
    }
    const c = this.peek();
    if (c === 0x7b) return this.readObject(depth);
    if (c === 0x5b) return this.readArray(depth);
    if (c === 0x22) return this.readString();
    if (c === 0x74) return this.readLiteral("true", true);
    if (c === 0x66) return this.readLiteral("false", false);
    if (c === 0x6e) return this.readLiteral("null", null);
    if (c === 0x2d || (c >= 0x30 && c <= 0x39)) return this.readNumber();
    throw new ProtocolError("invalid_json", `unexpected character at ${this.pos}`);
  }

  private readLiteral(word: string, value: JsonValue): JsonValue {
    if (this.text.startsWith(word, this.pos)) {
      this.pos += word.length;
      return value;
    }
    throw new ProtocolError("invalid_json", `bad literal at ${this.pos}`);
  }

  private readNumber(): number {
    const start = this.pos;
    if (this.peek() === 0x2d) this.pos++;
    // integer part
    if (this.peek() === 0x30) {
      this.pos++;
    } else {
      const s = this.pos;
      while (this.peek() >= 0x30 && this.peek() <= 0x39) this.pos++;
      if (this.pos === s) throw new ProtocolError("invalid_json", `bad number at ${start}`);
    }
    // fraction / exponent: rejected — canonical values are safe integers only
    const c = this.peek();
    if (c === 0x2e || c === 0x65 || c === 0x45) {
      throw new ProtocolError("invalid_json", "non-integer number not allowed");
    }
    const n = Number(this.text.slice(start, this.pos));
    if (!Number.isSafeInteger(n)) {
      throw new ProtocolError("invalid_json", `unsafe integer at ${start}`);
    }
    return n;
  }

  private readString(): string {
    this.pos++; // opening quote
    const out: string[] = [];
    let byteLen = 0;
    for (;;) {
      if (this.pos >= this.text.length) {
        throw new ProtocolError("invalid_json", "unterminated string");
      }
      const c = this.text.charCodeAt(this.pos);
      if (c === 0x22) {
        this.pos++;
        break;
      }
      if (c === 0x5c) {
        this.pos++;
        const e = this.text.charCodeAt(this.pos);
        switch (e) {
          case 0x22: out.push('"'); byteLen += 1; break;
          case 0x5c: out.push("\\"); byteLen += 1; break;
          case 0x2f: out.push("/"); byteLen += 1; break;
          case 0x62: out.push("\b"); byteLen += 1; break;
          case 0x66: out.push("\f"); byteLen += 1; break;
          case 0x6e: out.push("\n"); byteLen += 1; break;
          case 0x72: out.push("\r"); byteLen += 1; break;
          case 0x74: out.push("\t"); byteLen += 1; break;
          case 0x75: {
            const hex = this.text.slice(this.pos + 1, this.pos + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
              throw new ProtocolError("invalid_json", "bad \\u escape");
            }
            const cp = parseInt(hex, 16);
            const ch = String.fromCharCode(cp);
            out.push(ch);
            byteLen += textEncoder.encode(ch).length;
            this.pos += 4;
            break;
          }
          default:
            throw new ProtocolError("invalid_json", `bad escape at ${this.pos}`);
        }
        this.pos++;
      } else {
        if (c < 0x20) {
          throw new ProtocolError("invalid_json", "unescaped control character in string");
        }
        const ch = this.text[this.pos]!;
        out.push(ch);
        byteLen += textEncoder.encode(ch).length;
        this.pos++;
      }
      if (byteLen > this.opts.maxStringBytes) {
        throw new ProtocolError("string_too_long", `string exceeds ${this.opts.maxStringBytes} bytes`);
      }
    }
    const s = out.join("");
    if (hasLoneSurrogate(s)) {
      throw new ProtocolError("invalid_json", "lone surrogate in string");
    }
    return s;
  }

  private readObject(depth: number): { [key: string]: JsonValue } {
    this.pos++; // {
    const obj: { [key: string]: JsonValue } = {};
    let prevKey: string | null = null;
    this.skipWs();
    if (this.peek() === 0x7d) {
      this.pos++;
      return obj;
    }
    for (;;) {
      this.skipWs();
      if (this.peek() !== 0x22) {
        throw new ProtocolError("invalid_json", `expected object key at ${this.pos}`);
      }
      const key = this.readString();
      if (!isAsciiKey(key)) {
        throw new ProtocolError("invalid_json", `non-ASCII object key ${key}`);
      }
      if (Object.hasOwn(obj, key)) {
        throw new ProtocolError("duplicate_key", `duplicate key ${key}`);
      }
      if (this.opts.requireCanonical && prevKey !== null && key <= prevKey) {
        throw new ProtocolError("non_canonical", `object keys out of order: ${key}`);
      }
      prevKey = key;
      this.skipWs();
      if (this.peek() !== 0x3a) {
        throw new ProtocolError("invalid_json", `expected ':' at ${this.pos}`);
      }
      this.pos++;
      this.skipWs();
      obj[key] = this.readValue(depth + 1);
      this.skipWs();
      const c = this.peek();
      if (c === 0x2c) {
        this.pos++;
        continue;
      }
      if (c === 0x7d) {
        this.pos++;
        return obj;
      }
      throw new ProtocolError("invalid_json", `expected ',' or '}' at ${this.pos}`);
    }
  }

  private readArray(depth: number): JsonValue[] {
    this.pos++; // [
    const arr: JsonValue[] = [];
    this.skipWs();
    if (this.peek() === 0x5d) {
      this.pos++;
      return arr;
    }
    for (;;) {
      this.skipWs();
      arr.push(this.readValue(depth + 1));
      this.skipWs();
      const c = this.peek();
      if (c === 0x2c) {
        this.pos++;
        continue;
      }
      if (c === 0x5d) {
        this.pos++;
        return arr;
      }
      throw new ProtocolError("invalid_json", `expected ',' or ']' at ${this.pos}`);
    }
  }
}

/** Strict JSON parse: rejects duplicate keys, floats, unsafe ints, lone
 *  surrogates, excessive depth/length. Whitespace allowed unless
 *  `requireCanonical` is set. */
export function parseJson(text: string, opts: ParseOptions = {}): JsonValue {
  return new Parser(text, {
    maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxStringBytes: opts.maxStringBytes ?? DEFAULT_MAX_STRING_BYTES,
    requireCanonical: opts.requireCanonical ?? false,
  }).parse();
}

/** Parse and verify canonical form byte-for-byte. */
export function parseCanonical(text: string, opts: Omit<ParseOptions, "requireCanonical"> = {}): JsonValue {
  return parseJson(text, { ...opts, requireCanonical: true });
}

/** Re-canonicalize a parsed value: parse, then emit canonical bytes. */
export function recanonicalize(text: string, opts: ParseOptions = {}): string {
  return canonicalize(parseJson(text, opts));
}
