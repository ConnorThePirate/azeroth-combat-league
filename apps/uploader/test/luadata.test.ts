import { describe, it, expect } from "vitest";
import { parseSavedVariables, LuaDataError, DEFAULT_LIMITS } from "../src/luadata.js";

const SAMPLE = `
AzerothCombatLeagueDB = {
	["schemaVersion"] = 1,
	["installationId"] = "11111111-1111-4111-8111-111111111111",
	["settings"] = {
		["quietMode"] = false,
		["bestOf"] = 3,
	},
	["reports"] = {
		["nonce1"] = {
			["status"] = "queued",
			["body"] = {
				["schema"] = "wf.match-report.v2",
				["winnerId"] = "abc",
			},
		},
	},
	["reportOrder"] = {
		"nonce1",
	},
}
`;

describe("luadata parser", () => {
  it("parses a realistic SavedVariables file", () => {
    const db = parseSavedVariables(SAMPLE);
    const sv = db.AzerothCombatLeagueDB as Record<string, unknown>;
    expect(sv.schemaVersion).toBe(1);
    expect((sv.settings as Record<string, unknown>).quietMode).toBe(false);
    const reports = sv.reports as Record<string, { status: string }>;
    expect(reports.nonce1!.status).toBe("queued");
    expect(sv.reportOrder).toEqual(["nonce1"]);
  });

  it("handles escapes and quoted strings", () => {
    const db = parseSavedVariables(
      `X = { ["a"] = "line\\nfeed", b = 'sq', c = "\\65\\66", d = "\\\\" }`,
    );
    const x = db.X as Record<string, string>;
    expect(x.a).toBe("line\nfeed");
    expect(x.b).toBe("sq");
    expect(x.c).toBe("AB");
    expect(x.d).toBe("\\");
  });

  it("rejects code execution attempts", () => {
    const hostile = [
      `X = loadstring("os.execute('rm -rf /')")`,
      `X = (function() return 1 end)()`,
      `X = print("hi")`,
      `X = { [foo()] = 1 }`,
      `X = require("fs")`,
      `X = _G["os"]["execute"]`,
    ];
    for (const src of hostile) {
      expect(() => parseSavedVariables(src)).toThrow(LuaDataError);
    }
  });

  it("rejects forbidden identifier values", () => {
    expect(() => parseSavedVariables(`X = someGlobal`)).toThrow(/forbidden identifier/);
  });

  it("enforces size/depth limits", () => {
    expect(() =>
      parseSavedVariables(`X = ` + "x".repeat(10), { ...DEFAULT_LIMITS, maxBytes: 5 }),
    ).toThrow(/exceeds/);
    const deep = "X = " + "{".repeat(40) + "}".repeat(40);
    expect(() => parseSavedVariables(deep)).toThrow(/too deep/);
  });

  it("rejects unterminated input as truncated", () => {
    expect(() => parseSavedVariables(`X = { ["a"] = `)).toThrow(/unterminated|unexpected/);
  });

  it("rejects non-finite numbers WoW can emit", () => {
    expect(() => parseSavedVariables(`X = { v = -1.#IND }`)).toThrow();
  });

  it("rejects mixed array/record tables", () => {
    expect(() => parseSavedVariables(`X = { "a", ["k"] = 1 }`)).toThrow(/mixed/);
  });
});
