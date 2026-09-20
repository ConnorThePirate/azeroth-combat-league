import { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useRulesets } from "../data/source";
import type { RulesetRule, RuleCategory, RulePhase } from "../data/types";

/**
 * Rules builder (docs/12): preset first, Advanced expandable.
 * Any custom edit immediately removes the Standard-rated badge — that is
 * the point of the badge, not a punishment.
 */

const CATEGORIES: { id: RuleCategory; label: string }[] = [
  { id: "consumable", label: "Consumables (potions, elixirs)" },
  { id: "trinket", label: "Trinket uses" },
  { id: "engineering", label: "Engineering items" },
  { id: "class_created", label: "Class-created items (healthstones…)" },
  { id: "pet", label: "Pets" },
  { id: "food_drink", label: "Food & drink" },
  { id: "world_buff", label: "World buffs" },
  { id: "equipment_swap", label: "Mid-fight equipment swaps" },
];

const PHASES: { id: RulePhase; label: string }[] = [
  { id: "preparation", label: "Before the duel" },
  { id: "active", label: "During the fight" },
  { id: "between_games", label: "Between games" },
];

const PRESETS = [
  { id: "standard", label: "Ranked Standard", desc: "The ladder ruleset. Consumables, engineering and world buffs off during the fight." },
  { id: "pure_duel", label: "Pure Duel", desc: "Skills only — no items at all." },
  { id: "fieldcraft", label: "Fieldcraft", desc: "World PvP rules — consumables fine, engineering fine." },
  { id: "anything_goes", label: "Anything Goes", desc: "No restrictions. Never Standard-rated." },
  { id: "custom", label: "Custom", desc: "Start from scratch." },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

const PRESET_RULES: Record<PresetId, Omit<RulesetRule, "id">[]> = {
  standard: [
    { category: "consumable", action: "deny", phase: "active", itemExceptions: [] },
    { category: "engineering", action: "deny", phase: "active", itemExceptions: [] },
    { category: "world_buff", action: "deny", phase: "ready", itemExceptions: [] },
    { category: "food_drink", action: "allow", phase: "between_games", itemExceptions: [] },
  ],
  pure_duel: [
    { category: "consumable", action: "deny", phase: "active", itemExceptions: [] },
    { category: "trinket", action: "deny", phase: "active", itemExceptions: [] },
    { category: "engineering", action: "deny", phase: "active", itemExceptions: [] },
    { category: "class_created", action: "deny", phase: "active", itemExceptions: [] },
    { category: "pet", action: "deny", phase: "active", itemExceptions: [] },
    { category: "equipment_swap", action: "deny", phase: "active", itemExceptions: [] },
  ],
  fieldcraft: [
    { category: "world_buff", action: "deny", phase: "ready", itemExceptions: [] },
    { category: "consumable", action: "limit", phase: "active", count: 3, itemExceptions: [] },
  ],
  anything_goes: [],
  custom: [],
};

export default function RulesBuilder() {
  const [params] = useSearchParams();
  const { data: RULESETS } = useRulesets();
  const from = params.get("from");
  const base = RULESETS.find((r) => r.id === from);
  const [preset, setPreset] = useState<PresetId>(base?.preset ?? "standard");
  const [rules, setRules] = useState<Omit<RulesetRule, "id">[]>(
    () => base ? base.rules.map(({ id: _id, ...rest }) => rest) : PRESET_RULES.standard,
  );
  const [dirty, setDirty] = useState(!!base && base.preset !== "standard");
  const [advOpen, setAdvOpen] = useState(false);
  const [phase, setPhase] = useState<RulePhase>("active");
  const [bestOf, setBestOf] = useState(3);
  const [timeoutMin, setTimeoutMin] = useState(15);

  // Editing Standard always drops the badge — even if you end up identical,
  // only the exact immutable published version qualifies.
  const standardBadge = !dirty && preset === "standard";

  function pick(p: PresetId) {
    setPreset(p);
    setRules(PRESET_RULES[p].map((r) => ({ ...r })));
    setDirty(p !== "standard");
  }

  function setRule(cat: RuleCategory, action: RulesetRule["action"] | "unset") {
    setDirty(true);
    setRules((rs) => {
      const rest = rs.filter((r) => !(r.category === cat && r.phase === phase));
      return action === "unset" ? rest : [...rest, {
        category: cat, action, phase, itemExceptions: [],
      }];
    });
  }

  const ruleFor = (cat: RuleCategory) =>
    rules.find((r) => r.category === cat && r.phase === phase);

  const coverage = useMemo(() => {
    // honest estimate: what the addon can actually observe vs attest
    const observed = rules.filter((r) =>
      ["consumable", "engineering", "world_buff"].includes(r.category)).length;
    return { observed, attested: rules.length - observed };
  }, [rules]);

  return (
    <>
      <div style={{ marginTop: "1rem" }}>
        <Link to="/rules" className="small dim">← rulesets</Link>
      </div>
      <div className="row between" style={{ marginTop: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>Rules builder</h1>
        {standardBadge
          ? <span className="pill good">Standard-rated</span>
          : <span className="pill warn">Custom — not Standard-rated</span>}
      </div>
      <p className="dim small">
        Pick a starting point. Your opponent sees exactly this list (plus
        detector coverage) before accepting.
      </p>

      <div className="list" style={{ marginTop: "1rem" }}>
        {PRESETS.map((p) => (
          <button key={p.id} className="card" onClick={() => pick(p.id)}
            style={{
              textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
              borderColor: preset === p.id ? "var(--accent)" : undefined,
            }}
            aria-pressed={preset === p.id}>
            <div className="row between">
              <strong>{p.label}</strong>
              {preset === p.id && <span className="pill accent">selected</span>}
            </div>
            <div className="dim small">{p.desc}</div>
          </button>
        ))}
      </div>

      <details className="adv" open={advOpen} onToggle={(e) => setAdvOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Advanced — categories, phases &amp; limits</summary>
        <div>
          <div className="tabs" role="tablist" aria-label="Phase">
            {PHASES.map((p) => (
              <button key={p.id} role="tab" aria-selected={phase === p.id}
                onClick={() => setPhase(p.id)}>{p.label}</button>
            ))}
          </div>
          <div className="card">
            {CATEGORIES.map((c) => {
              const r = ruleFor(c.id);
              return (
                <div className="row between" key={c.id} style={{ padding: "0.35rem 0" }}>
                  <span>{c.label}</span>
                  <span className="row">
                    {(["deny", "allow", "limit"] as const).map((a) => (
                      <button key={a}
                        className={`btn ghost${r?.action === a ? " primary" : ""}`}
                        style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                        aria-pressed={r?.action === a}
                        onClick={() => setRule(c.id, r?.action === a ? "unset" : a)}>
                        {a}
                      </button>
                    ))}
                    {r?.action === "limit" && (
                      <input type="number" min={1} max={10} defaultValue={r.count ?? 3}
                        aria-label={`max ${c.label}`}
                        style={{ width: "3.2rem", marginLeft: "0.4rem" }} />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ gap: "1.5rem", marginTop: "0.8rem" }}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="bestof">Best of</label>
              <select id="bestof" value={bestOf}
                onChange={(e) => { setBestOf(+e.target.value); setDirty(true); }}>
                {[1, 3, 5, 7].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="timeout">Game timeout (min)</label>
              <input id="timeout" type="number" min={5} max={30} value={timeoutMin}
                onChange={(e) => { setTimeoutMin(+e.target.value); setDirty(true); }} />
            </div>
          </div>
        </div>
      </details>

      <div className="notice info" style={{ marginTop: "1rem" }}>
        Detector coverage: ~{coverage.observed} rule{coverage.observed === 1 ? "" : "s"} observable
        via combat log, {coverage.attested} attested (both players' addons report;
        disagreement flags the match). Your opponent sees this before accepting.
      </div>

      <div className="row" style={{ marginTop: "1rem" }}>
        <button className="btn primary">Publish ruleset</button>
        <span className="dim small">publishes an immutable version with a share code</span>
      </div>
    </>
  );
}
