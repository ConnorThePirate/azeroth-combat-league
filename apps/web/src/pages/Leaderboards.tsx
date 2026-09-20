import { useState } from "react";
import { useLeaderboard, useStatus, nowFor } from "../data/source";
import type { Ladder, WowClass } from "../data/types";
import { Freshness, ClassTag, Placement } from "../components/common";
import { PlayerLink } from "../components/PlayerModal";

const TABS: { id: Ladder; label: string; hint: string }[] = [
  { id: "open", label: "Open", hint: "Standard rules, any class pairing." },
  { id: "mirror", label: "Mirror", hint: "Same-class duels — each class is its own ladder." },
];

const CLASSES: WowClass[] = [
  "warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid",
];

export default function Leaderboards() {
  const [l, setL] = useState<Ladder>("open");
  const [cls, setCls] = useState<WowClass | null>(null);
  const { data: STATUS, source: statusSrc } = useStatus();
  const { data: rows } = useLeaderboard(l);
  const tab = TABS.find((t) => t.id === l)!;
  // mirror boards are per-class ladders — there is no "all classes" view,
  // so the filter defaults to the first class present on the board
  const classesPresent = [...new Set(rows.map((r) => r.wowClass))];
  const effCls = l === "mirror" ? (cls ?? classesPresent[0] ?? null) : cls;
  const shown = effCls ? rows.filter((r) => r.wowClass === effCls) : rows;
  const maxRating = Math.max(...rows.filter((r) => !r.placement).map((r) => r.rating), 1);

  return (
    <>
      <div className="page-head">
        <h1>Leaderboards</h1>
        <span className="freshness">
          Season 1 · {STATUS.ratingGeneration
            ? <>generation <Freshness atMs={STATUS.ratingGeneration.computedAtMs} now={nowFor(statusSrc)} /></>
            : "no generation yet"}
        </span>
      </div>

      <div className="tabs" role="tablist" aria-label="Ladder">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={l === t.id}
            onClick={() => { setL(t.id); setCls(null); }}>{t.label}</button>
        ))}
      </div>
      <p className="dim small" style={{ marginTop: "-0.4rem" }}>{tab.hint}</p>

      {/* Class filter — a view, never a second rating (docs/09).
          Mirror has no combined view: each class is its own ladder. */}
      <div className="chip-row" role="group" aria-label="Filter by class">
        {l === "open" && (
          <button className={`chip${cls === null ? " on" : ""}`} onClick={() => setCls(null)}>All classes</button>
        )}
        {CLASSES.map((c) => (
          <button key={c} className={`chip cls-${c}${effCls === c ? " on" : ""}`}
            onClick={() => setCls(l === "mirror" ? c : (cls === c ? null : c))}>{c}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="dim">
          {effCls ? `No ${effCls}s on this board yet.` : "Nobody's placed yet — first fight night is coming up."}
        </p>
      ) : (
        <div className="card board-card">
          <table className="board">
            <thead>
              <tr><th>#</th><th>Fighter</th><th>Rating</th><th>W–L</th><th>Win share</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const games = r.wins + r.losses;
                const winPct = games > 0 ? (r.wins / games) * 100 : 0;
                return (
                  <tr key={r.playerId} className={!r.placement && r.rank <= 3 ? "podium" : undefined}>
                    <td className="rank">
                      {r.placement ? <span className="plain">—</span>
                        : r.rank <= 3 ? <span className={`medal m${r.rank}`}>{r.rank}</span>
                        : <span className="plain">{r.rank}</span>}
                    </td>
                    <td>
                      <PlayerLink id={r.playerId} cls={r.wowClass} name={r.name} />{" "}
                      <ClassTag cls={r.wowClass} />
                      {r.placement && <div style={{ marginTop: "0.2rem" }}><Placement p={r.placement} /></div>}
                    </td>
                    <td className="num">
                      {r.placement ? "placing" : r.rating}
                      {!r.placement && (
                        <div className="rating-bar" aria-hidden="true">
                          <span style={{ width: `${Math.round((r.rating / maxRating) * 100)}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="num dim">{r.wins}–{r.losses}</td>
                    <td className="num dim">
                      {games > 0 ? `${Math.round(winPct)}%` : "—"}
                      {games > 0 && (
                        <div className="wl-bar" aria-hidden="true">
                          <span className="w" style={{ width: `${winPct}%` }} />
                          <span className="l" style={{ width: `${100 - winPct}%` }} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="dim small">
        {l === "open"
          ? "Class filters are views of one rating — filtering never creates a second number. "
          : "Mirror duels rate within each class — the filter picks which class ladder you're viewing. "}
        Rematches against the same opponent decay to zero weight within a
        week, so the top spot can't be farmed with a friend. Ranked requires a
        verified character — link an account or check in with event staff.
      </p>
    </>
  );
}
