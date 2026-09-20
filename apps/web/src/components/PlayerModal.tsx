/**
 * PlayerModal — click any fighter's name anywhere and get the card:
 * ratings, streak, rivals, titles, recent duels. The full /player/:id
 * page still exists for deep links and the "full profile" button.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  usePlayer, usePlayerMatches, deriveRivals, nowFor,
} from "../data/source";
import { Freshness, StatusPill, ClassTag, Placement, IdentityBadge } from "./common";
import type { MatchRecord } from "../data/types";

const PlayerModalCtx = createContext<(id: string) => void>(() => {});
export const usePlayerModal = () => useContext(PlayerModalCtx);

/** Derived fun stats — honest: computed only from the player's match list. */
function usePlayerStats(id: string, matches: MatchRecord[]) {
  const decided = matches
    .filter((m) => m.winnerId !== null && m.evidence !== "disputed")
    .sort((a, b) => b.playedAtMs - a.playedAtMs);
  let streak = 0;
  let streakWin: boolean | null = null;
  for (const m of decided) {
    const won = m.winnerId === id;
    if (streakWin === null) { streakWin = won; streak = 1; continue; }
    if (won === streakWin) streak++; else break;
  }
  const opponents = new Set(
    matches.map((m) => (m.a.playerId === id ? m.b.playerId : m.a.playerId)));
  return { decided: decided.length, streak: streakWin ? streak : 0,
    lossStreak: streakWin === false ? streak : 0, uniqueOpponents: opponents.size };
}

/** Derived achievements — badges earned from real match data. */
function badges(id: string, matches: MatchRecord[]): string[] {
  const out: string[] = [];
  const decided = matches.filter((m) => m.winnerId !== null && m.evidence !== "disputed");
  const wins = decided.filter((m) => m.winnerId === id).length;
  if (wins >= 10) out.push("Veteran — 10+ decided wins");
  let streak = 0, best = 0;
  for (const m of [...decided].sort((a, b) => a.playedAtMs - b.playedAtMs)) {
    streak = m.winnerId === id ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  if (best >= 3) out.push(`Hot hand — ${best} in a row`);
  const rivals = deriveRivals(id, matches);
  if (rivals.some((r) => r.meetings >= 5)) out.push("Bitter rivalry — 5+ meetings");
  if (out.length === 0 && decided.length === 0) out.push("Unblooded — no decided duels yet");
  return out;
}

/** Cosmetic item-quality tier for an achievement string. */
function badgeQuality(b: string): string {
  if (/in a row|streak|hot hand/i.test(b)) return "uncommon";
  if (/rival/i.test(b)) return "rare";
  if (/undefeated|perfect|flawless/i.test(b)) return "epic";
  if (/#1|top rank|rank 1/i.test(b)) return "legendary";
  return "common";
}

function ModalBody({ id, close }: { id: string; close: () => void }) {
  const { data: p } = usePlayer(id);
  const { data: matches, source: matchesSrc } = usePlayerMatches(id);
  const stats = usePlayerStats(id, matches ?? []);
  if (!p) return <p className="dim">loading…</p>;
  const rivals = deriveRivals(id, matches ?? []).slice(0, 3);
  const recent = (matches ?? [])
    .slice()
    .sort((a, b) => b.playedAtMs - a.playedAtMs)
    .slice(0, 3);
  const wins = (matches ?? []).filter((m) => m.winnerId === id).length;
  const losses = (matches ?? []).filter((m) => m.winnerId !== null && m.winnerId !== id).length;
  const winPct = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null;
  const badgeList = badges(id, matches ?? []);

  return (
    <>
      <div className="row between">
        <div>
          <h2 style={{ margin: 0 }} className={`cls-${p.wowClass}`}>
            {p.name} <ClassTag cls={p.wowClass} />
          </h2>
          {p.titles.length > 0 && <div className="titles">{p.titles.join(" · ")}</div>}
          <div className="faint small">{p.realm}</div>
        </div>
        <IdentityBadge tier={p.tier} />
      </div>

      <div className="row" style={{ gap: "1.6rem", margin: "0.9rem 0 0.2rem" }}>
        <div>
          <div className="small dim">Open rating</div>
          {p.open.rating !== null ? (
            <div className="rating-big">{p.open.rating}</div>
          ) : p.open.placement ? <Placement p={p.open.placement} />
          : <div className="dim">unranked</div>}
        </div>
        {p.mirror.rating !== null && (
          <div>
            <div className="small dim">Mirror</div>
            <div className="rating-big">{p.mirror.rating}</div>
          </div>
        )}
        <div>
          <div className="small dim">Record</div>
          <div className="num" style={{ fontSize: "1.15rem" }}>
            {wins}–{losses}{winPct !== null && <span className="dim"> · {winPct}%</span>}
          </div>
        </div>
      </div>

      <div className="stat-row">
        <div className="tt-line">
          <span>Opponents faced</span>
          <span className="num">{stats.uniqueOpponents}</span>
        </div>
        <div className="tt-line">
          <span>Decided series</span>
          <span className="num">{stats.decided}</span>
        </div>
        {stats.streak >= 2 && (
          <div className="tt-line">
            <span>Current streak</span>
            <span className="delta-up">W{stats.streak}</span>
          </div>
        )}
        {stats.lossStreak >= 2 && (
          <div className="tt-line">
            <span>Current streak</span>
            <span className="delta-down">L{stats.lossStreak}</span>
          </div>
        )}
      </div>

      {badgeList.length > 0 && (
        <div className="chip-row" style={{ margin: "0.6rem 0 0" }}>
          {badgeList.map((b) => (
            <span key={b} className={`pill quality-${badgeQuality(b)}`}>{b}</span>
          ))}
        </div>
      )}

      {rivals.length > 0 && (
        <>
          <h3 className="modal-section">Rivals</h3>
          {rivals.map((r) => (
            <div className="row between small" key={r.playerId} style={{ padding: "0.15rem 0" }}>
              <PlayerLink id={r.playerId} cls={r.wowClass} name={r.name} />
              <span className="num dim">{r.wins}–{r.losses}</span>
            </div>
          ))}
        </>
      )}

      {recent.length > 0 && (
        <>
          <h3 className="modal-section">Recent duels</h3>
          {recent.map((m) => {
            const opp = m.a.playerId === id ? m.b : m.a;
            const won = m.winnerId === id;
            return (
              <Link to={`/match/${m.id}`} key={m.id} onClick={close}
                className="row between small modal-match">
                <span>
                  <span className={won ? "delta-up" : m.winnerId ? "delta-down" : "dim"}>
                    {m.winnerId === null ? "—" : won ? "W" : "L"}
                  </span>
                  <span className="vs">vs</span>
                  <span className={`cls-${opp.wowClass}`}>{opp.name}</span>
                </span>
                <span className="row" style={{ gap: "0.5rem" }}>
                  <StatusPill status={m.status} />
                  <span className="dim"><Freshness atMs={m.playedAtMs} now={nowFor(matchesSrc)} /></span>
                </span>
              </Link>
            );
          })}
        </>
      )}

      <div className="row" style={{ marginTop: "1rem" }}>
        <Link className="btn primary" to={`/player/${id}`} onClick={close}>Full profile</Link>
      </div>
    </>
  );
}

export function PlayerModalProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);
  const open = useCallback((id: string) => setOpenId(id), []);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, close]);

  return (
    <PlayerModalCtx.Provider value={open}>
      {children}
      {openId && (
        <div className="modal-overlay" onClick={close} role="dialog" aria-modal="true">
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={close} aria-label="Close">×</button>
            <ModalBody id={openId} close={close} />
          </div>
        </div>
      )}
    </PlayerModalCtx.Provider>
  );
}

/** A fighter's name — opens the popup card. A span (not <a>) so it can sit
 *  inside card-level links without nested anchors; "Full profile" in the
 *  modal covers deep navigation. */
export function PlayerLink({ id, cls, name }: {
  id: string; cls?: string | undefined; name: string;
}) {
  const open = usePlayerModal();
  return (
    <span role="link" tabIndex={0}
      className={`player-link${cls ? ` cls-${cls}` : ""}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); open(id); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); open(id); }
      }}>
      {name}
    </span>
  );
}
