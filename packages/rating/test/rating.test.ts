import { describe, expect, it } from "vitest";
import {
  INITIAL, WEEK, displayRating, isEstablished, replay, roundAway, update, weightFor,
  type RatingEvent,
} from "../src/rating.js";

const event = (id: string, seq: number, extra: Partial<RatingEvent> = {}): RatingEvent => ({
  id, seq, firstSeen: seq * 1000, season: "s", pool: "p", bracket: "20",
  ladder: "open", a: "char-a", b: "char-b", accountA: "acct-a", accountB: "acct-b",
  classA: "mage", classB: "mage", score: 1, eligible: true, ...extra,
});

describe("update — golden examples from docs/09", () => {
  it("1500/1500 weights 1/.5/.25/0", () => {
    expect(update(INITIAL, INITIAL, 1, 1)).toEqual({ a: 1516000, b: 1484000, delta: 16000 });
    expect(update(INITIAL, INITIAL, 1, 0.5)).toEqual({ a: 1508000, b: 1492000, delta: 8000 });
    expect(update(INITIAL, INITIAL, 1, 0.25)).toEqual({ a: 1504000, b: 1496000, delta: 4000 });
    expect(update(INITIAL, INITIAL, 1, 0)).toEqual({ a: INITIAL, b: INITIAL, delta: 0 });
    expect(update(INITIAL, INITIAL, 0.5, 1).delta).toBe(0); // equal-rating draw
  });
  it("1700 vs 1500: favorite and underdog", () => {
    expect(update(1700000, 1500000, 1, 1)).toEqual({ a: 1707688, b: 1492312, delta: 7688 });
    expect(update(1700000, 1500000, 0, 1)).toEqual({ a: 1675688, b: 1524312, delta: -24312 });
  });
});

describe("repeat policy", () => {
  it("three wins then zero-weight rematch", () => {
    const { ledger } = replay([1, 2, 3, 4].map((n) => event(String(n), n)));
    expect(ledger.map((x) => x.weight)).toEqual([1, 0.5, 0.25, 0]);
    expect(ledger[2]!.a).toBe(1526732);
    expect(ledger[3]!.delta).toBe(0);
  });
  it("seven-day boundary: match exactly 7d later is excluded", () => {
    const x = replay([event("1", 1, { firstSeen: 0 }), event("2", 2, { firstSeen: WEEK })]);
    expect(x.ledger[1]!.weight).toBe(1);
  });
  it("same-time records order by receipt sequence", () => {
    const x = replay([
      event("3", 3, { firstSeen: WEEK - 1 }),
      event("2", 2, { firstSeen: 0 }),
      event("1", 1, { firstSeen: 0 }),
    ]);
    expect(x.ledger.map((x) => x.weight)).toEqual([1, 0.5, 0.25]);
  });
  it("alts and mirror share the pair counter", () => {
    const x = replay([
      event("1", 1),
      event("2", 2, { a: "char-c", b: "char-d", ladder: "mirror" }),
    ]);
    expect(x.ledger[1]!.weight).toBe(0.5);
    expect(x.ledger[1]!.beforeA).toBe(INITIAL); // mirror is an independent ladder
  });
  it("invalid and same-account events consume no credit", () => {
    const x = replay([
      event("1", 1, { eligible: false }),
      event("2", 2, { accountB: "acct-a" }),
      event("3", 3),
    ]);
    expect(x.ledger.length).toBe(1);
    expect(x.ledger[0]!.weight).toBe(1);
  });
});

describe("replay semantics", () => {
  it("is independent of arrival order", () => {
    const es = [event("1", 1), event("2", 2, { score: 0 }), event("3", 3)];
    expect(replay(es)).toEqual(replay([...es].reverse()));
  });
  it("voiding an old event rebuilds weights and downstream ratings", () => {
    const es = [event("1", 1), event("2", 2), event("3", 3)];
    const fixed = replay(es.map((e) => ({ ...e, eligible: e.id !== "1" })));
    expect(fixed).toEqual(replay(es.slice(1)));
    expect(fixed.ledger.map((x) => x.weight)).toEqual([1, 0.5]);
  });
  it("rejects duplicate event ids and receipt sequences", () => {
    expect(() => replay([event("1", 1), event("1", 2)])).toThrow();
    expect(() => replay([event("1", 1), event("2", 1)])).toThrow();
  });
  it("rejects non-canonical participant order", () => {
    expect(() => replay([event("1", 1, { a: "char-z", b: "char-a" })])).toThrow();
  });
  it("rejects mirror events with different classes", () => {
    expect(() => replay([event("1", 1, { ladder: "mirror", classB: "rogue" })])).toThrow();
  });
  it("rejects invalid numeric input", () => {
    expect(() => update(NaN, INITIAL, 1, 1)).toThrow();
    expect(() => weightFor(-1)).toThrow();
  });
});

describe("properties", () => {
  it("mass conservation, bounded delta, monotonic upset reward", () => {
    for (let a = 0; a <= 3000000; a += 150000) {
      for (let b = 0; b <= 3000000; b += 150000) {
        for (const w of [0, 0.25, 0.5, 1] as const) {
          for (const s of [0, 0.5, 1] as const) {
            const x = update(a, b, s, w);
            expect(x.a + x.b).toBe(a + b);
            expect(Math.abs(x.delta)).toBeLessThanOrEqual(32000 * w);
          }
        }
      }
    }
    expect(update(1300000, 1700000, 1, 1).delta).toBeGreaterThan(update(1700000, 1300000, 1, 1).delta);
  });
  it("extreme ratings stay numeric (clamped exponent)", () => {
    const x = update(0, 3000000, 1, 1);
    expect(Number.isSafeInteger(x.a)).toBe(true);
    expect(x.delta).toBe(32000); // full K for maximum underdog
  });
});

describe("helpers", () => {
  it("roundAway is ties-away-from-zero", () => {
    expect(roundAway(1.5)).toBe(2);
    expect(roundAway(-1.5)).toBe(-2);
    expect(roundAway(0.4)).toBe(0);
  });
  it("displayRating renders nearest integer", () => {
    expect(displayRating(1516500)).toBe(1517);
    expect(displayRating(1500000)).toBe(1500);
  });
  it("established thresholds", () => {
    expect(isEstablished("open", { series: 10, opponents: 5 })).toBe(true);
    expect(isEstablished("open", { series: 10, opponents: 4 })).toBe(false);
    expect(isEstablished("mirror", { series: 6, opponents: 3 })).toBe(true);
  });
});
