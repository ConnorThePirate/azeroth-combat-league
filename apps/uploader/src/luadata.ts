/**
 * luadata.ts — constrained parser for WoW SavedVariables files (docs/27).
 *
 * Parses ONLY the data grammar WoW emits:
 *   file   := (IDENT '=' literal)*
 *   table  := '{' (entry ','?)* '}'
 *   entry  := '[' literal ']' '=' literal | IDENT '=' literal | literal
 *   literal:= number | "string" | 'string' | true | false | table
 *
 * NEVER evaluates code. Identifiers in value position, function calls,
 * string escapes it doesn't recognize, and any other token are errors.
 * Hard limits bound size/depth/entry counts so a hostile file cannot
 * consume unbounded resources.
 */

export type LuaValue =
  | null
  | boolean
  | number
  | string
  | LuaValue[]
  | { [key: string]: LuaValue };

export interface ParseLimits {
  maxBytes: number;      // input size cap
  maxDepth: number;      // nesting cap
  maxEntries: number;    // entries per table cap
  maxStringBytes: number;
}

export const DEFAULT_LIMITS: ParseLimits = {
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 32,
  maxEntries: 100_000,
  maxStringBytes: 1024 * 1024,
};

export class LuaDataError extends Error {
  constructor(
    message: string,
    public readonly offset: number,
    public readonly code:
      | "too_large" | "too_deep" | "too_many_entries" | "syntax"
      | "forbidden_token" | "truncated" | "string_too_large",
  ) {
    super(message);
    this.name = "LuaDataError";
  }
}

interface Tok {
  kind: "ident" | "num" | "str" | "punct" | "eof";
  value: string;
  offset: number;
}

const PUNCT = new Set(["{", "}", "[", "]", "=", ",", ";", "(", ")"]);

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    // comments: -- line, --[[ block ]] (WoW doesn't emit them; accept anyway)
    if (c === "-" && src[i + 1] === "-") {
      if (src[i + 2] === "[" && src[i + 3] === "[") {
        const end = src.indexOf("]]", i + 4);
        i = end < 0 ? n : end + 2;
      } else {
        const end = src.indexOf("\n", i + 2);
        i = end < 0 ? n : end;
      }
      continue;
    }
    if (PUNCT.has(c)) { toks.push({ kind: "punct", value: c, offset: i }); i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i++;
      let out = "";
      while (i < n) {
        const ch = src[i]!;
        if (ch === quote) { i++; break; }
        if (ch === "\n") {
          throw new LuaDataError("newline in string literal", i, "syntax");
        }
        if (ch === "\\") {
          const e = src[i + 1];
          if (e === undefined) throw new LuaDataError("truncated escape", i, "truncated");
          if (e >= "0" && e <= "9") {
            let j = i + 1, num = "";
            while (j < n && j < i + 4 && src[j]! >= "0" && src[j]! <= "9") {
              num += src[j]!; j++;
            }
            const cp = parseInt(num, 10);
            if (cp > 255) throw new LuaDataError("escape > 255", i, "syntax");
            out += String.fromCharCode(cp);
            i = j;
            continue;
          }
          const map: Record<string, string> = {
            n: "\n", r: "\r", t: "\t", a: "", b: "", f: "", v: "",
            "\\": "\\", '"': '"', "'": "'",
          };
          if (!(e in map)) throw new LuaDataError(`unknown escape \\${e}`, i, "syntax");
          out += map[e]!;
          i += 2;
          continue;
        }
        out += ch;
        i++;
      }
      if (i > n || src[i - 1] !== quote) {
        throw new LuaDataError("unterminated string", start, "truncated");
      }
      toks.push({ kind: "str", value: out, offset: start });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_]/.test(src[i]!)) i++;
      toks.push({ kind: "ident", value: src.slice(start, i), offset: start });
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const start = i;
      // hex or decimal float/int; WoW may emit 1.#INF / -1.#IND — rejected below
      while (i < n && /[0-9a-fA-FxX.eE+\-#]/.test(src[i]!)) i++;
      toks.push({ kind: "num", value: src.slice(start, i), offset: start });
      continue;
    }
    throw new LuaDataError(`unexpected byte ${JSON.stringify(c)}`, i, "forbidden_token");
  }
  toks.push({ kind: "eof", value: "", offset: n });
  return toks;
}

export function parseSavedVariables(
  src: string,
  limits: ParseLimits = DEFAULT_LIMITS,
): Record<string, LuaValue> {
  if (src.length > limits.maxBytes) {
    throw new LuaDataError(`file exceeds ${limits.maxBytes} bytes`, 0, "too_large");
  }
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p]!;
  const next = () => toks[p++]!;
  const err = (msg: string, code: ConstructorParameters<typeof LuaDataError>[2], t = peek()) =>
    new LuaDataError(msg, t.offset, code);

  function parseLiteral(depth: number): LuaValue {
    if (depth > limits.maxDepth) throw err("table nesting too deep", "too_deep");
    const t = peek();
    if (t.kind === "num") {
      next();
      const v = Number(t.value);
      if (!Number.isFinite(v)) throw err(`non-finite number ${t.value}`, "forbidden_token", t);
      if (!Number.isSafeInteger(v) && !t.value.includes(".") && !t.value.includes("e")) {
        // integer-looking but unsafe — keep as float? canonical data uses safe ints only
        throw err(`unsafe integer ${t.value}`, "syntax", t);
      }
      return v;
    }
    if (t.kind === "str") {
      next();
      if (t.value.length > limits.maxStringBytes) throw err("string too large", "string_too_large", t);
      return t.value;
    }
    if (t.kind === "ident") {
      if (t.value === "true") { next(); return true; }
      if (t.value === "false") { next(); return false; }
      if (t.value === "nil") { next(); return null; }
      throw err(`forbidden identifier in value position: ${t.value}`, "forbidden_token", t);
    }
    if (t.kind === "punct" && t.value === "{") {
      return parseTable(depth);
    }
    throw err(`unexpected token ${t.value || t.kind}`, "syntax", t);
  }

  function parseTable(depth: number): LuaValue {
    next(); // consume {
    const obj: Record<string, LuaValue> = {};
    const arr: LuaValue[] = [];
    let isArray = false;
    let entries = 0;
    while (true) {
      const t = peek();
      if (t.kind === "punct" && t.value === "}") { next(); break; }
      if (t.kind === "eof") throw err("unterminated table", "truncated", t);
      if (++entries > limits.maxEntries) throw err("too many table entries", "too_many_entries", t);

      if (t.kind === "punct" && t.value === "[") {
        next();
        const k = parseLiteral(depth + 1);
        const kt = peek();
        if (!(kt.kind === "punct" && kt.value === "]")) throw err("expected ]", "syntax");
        next();
        const eq = peek();
        if (!(eq.kind === "punct" && eq.value === "=")) throw err("expected =", "syntax");
        next();
        const v = parseLiteral(depth + 1);
        if (typeof k !== "string" && typeof k !== "number") {
          throw err("table key must be string or number", "syntax");
        }
        if (isArray) throw err("mixed array/record table", "syntax");
        obj[String(k)] = v;
      } else if (t.kind === "ident" && toks[p + 1]?.kind === "punct" && toks[p + 1]!.value === "=") {
        next();
        const key = t.value;
        next(); // '='
        if (isArray) throw err("mixed array/record table", "syntax");
        obj[key] = parseLiteral(depth + 1);
      } else {
        // bare value -> array part
        if (entries > 1 && !isArray && Object.keys(obj).length > 0) {
          throw err("mixed array/record table", "syntax");
        }
        isArray = true;
        arr.push(parseLiteral(depth + 1));
      }
      const sep = peek();
      if (sep.kind === "punct" && (sep.value === "," || sep.value === ";")) next();
    }
    return isArray ? arr : obj;
  }

  const out: Record<string, LuaValue> = {};
  while (peek().kind !== "eof") {
    const t = peek();
    if (t.kind !== "ident") throw err(`expected variable name, got ${t.value || t.kind}`, "syntax");
    next();
    const name = t.value;
    const eq = peek();
    if (!(eq.kind === "punct" && eq.value === "=")) {
      throw err(`expected = after ${name}`, "syntax");
    }
    next();
    out[name] = parseLiteral(0);
    const sep = peek();
    if (sep.kind === "punct" && (sep.value === "," || sep.value === ";")) next();
  }
  return out;
}
