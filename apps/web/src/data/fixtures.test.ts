import { describe, it, expect } from "vitest";
import { ladder, MATCHES, PLAYERS, STATUS, EVENTS } from "./fixtures";
import { ago } from "../components/common";

describe("fixture data layer", () => {
  it("open ladder is sorted by rating desc with sequential ranks", () => {
    const rows = ladder("open");
    expect(rows.length).toBeGreaterThan(3);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.rating).toBeLessThanOrEqual(rows[i - 1]!.rating);
      expect(rows[i]!.rank).toBe(i + 1);
    }
  });

  it("placing players appear without a fake rating", () => {
    const rows = ladder("open");
    const placing = rows.filter((r) => r.placement !== null);
    expect(placing.length).toBeGreaterThan(0);
    for (const p of placing) expect(p.rating).toBe(0); // unknown, not a number to display
  });

  it("mirror ladder is a separate population", () => {
    const mirror = ladder("mirror");
    expect(mirror.length).toBeLessThan(ladder("open").length);
    expect(mirror.every((r) => r.playerId === "p4")).toBe(true);
  });

  it("zero-weight and disputed matches carry honest notes", () => {
    const zero = MATCHES.find((m) => m.weightPercent === 0);
    expect(zero?.note).toMatch(/never affects/i);
    const disputed = MATCHES.find((m) => m.evidence === "disputed");
    expect(disputed?.status).toBe("under_review");
  });

  it("every rated match was received before it was rated", () => {
    for (const m of MATCHES.filter((m) => m.status === "rated")) {
      expect(m.receivedAtMs).not.toBeNull();
      expect(m.ratedAtMs).not.toBeNull();
      expect(m.ratedAtMs!).toBeGreaterThan(m.receivedAtMs!);
    }
  });

  it("capabilities never claim more than measured", () => {
    for (const c of STATUS.capabilities) {
      expect(["working", "partial", "unknown", "down"]).toContain(c.status);
    }
    // nothing is advertised that hasn't been probed
    expect(STATUS.capabilities.some((c) => c.status === "unknown")).toBe(true);
  });

  it("event staff are named with a role — witness scope lives on events", () => {
    for (const e of EVENTS) {
      for (const s of e.staff ?? []) {
        expect(["organizer", "referee"]).toContain(s.role);
        expect(s.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("player fixtures have consistent ladders", () => {
    for (const p of PLAYERS) {
      if (p.open.rating === null) expect(p.open.placement).not.toBeNull();
    }
  });
});

describe("ago()", () => {
  const now = 1_000_000_000_000;
  it("formats compact relative times", () => {
    expect(ago(now - 30_000, now)).toBe("30s ago");
    expect(ago(now - 5 * 60_000, now)).toBe("5m ago");
    expect(ago(now - 3 * 3600_000, now)).toBe("3h ago");
    expect(ago(now - 4 * 86400_000, now)).toBe("4d ago");
    expect(ago(now + 10_000, now)).toBe("0s ago"); // never negative
  });
});
