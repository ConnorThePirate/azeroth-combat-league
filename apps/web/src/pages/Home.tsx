import { Link } from "react-router-dom";
import { useEvents, useMatches, useLeaderboard, useStatus, nowFor } from "../data/source";
import { Freshness, StatusPill, ClassTag } from "../components/common";
import { PlayerLink } from "../components/PlayerModal";

const STEPS = [
  { n: "01", t: "Challenge in game", p: "Target someone, pick a ruleset, send the challenge — the addon handles the rest." },
  { n: "02", t: "Duel under the contract", p: "Both clients record independently. Rules are shown up front; custom sets never touch Standard rating." },
  { n: "03", t: "Results count", p: "Reports corroborate on the site. No typing scores, no honor system — two clients agree or it doesn't rate." },
];

export default function Home() {
  const { data: EVENTS } = useEvents();
  const { data: MATCHES, source: matchesSrc } = useMatches();
  const { data: STATUS, source: statusSrc } = useStatus();
  const { data: BOARD } = useLeaderboard("open");
  const next = EVENTS.filter((e) => e.status === "upcoming")
    .sort((a, b) => a.whenMs - b.whenMs)[0];
  const top = BOARD.filter((r) => !r.placement).slice(0, 3);
  const fighters = new Set(BOARD.map((r) => r.playerId)).size;
  const duels = MATCHES.length;

  return (
    <>
      <section className="hero">
        <svg className="hero-swords" viewBox="0 0 200 200" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M32 26 142 136" />
          <path d="M46 40 118 112" />
          <path d="M126 148 150 124" />
          <path d="M142 136 166 160" />
          <circle cx="170" cy="164" r="4" />
          <path d="M168 26 58 136" />
          <path d="M154 40 82 112" />
          <path d="M74 148 50 124" />
          <path d="M58 136 34 160" />
          <circle cx="30" cy="164" r="4" />
        </svg>
        <div className="eyebrow">A player-run fight club · WoW Forever</div>
        <h1>Walk up. Duel. It counts.</h1>
        <p>
          Challenge anyone, fight under agreed rules, and the addon records it —
          no queues, no forms, no typing scores into a website.
        </p>
        <div className="rule" aria-hidden="true"><span className="d" /></div>
        <div className="statline">
          <div className="st"><b>{fighters}</b><span>fighters on the board</span></div>
          <div className="st"><b>{duels}</b><span>duels recorded</span></div>
          <div className="st"><b>{EVENTS.length}</b><span>events hosted</span></div>
          <div className="st"><b>0</b><span>trusted inputs</span></div>
        </div>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="n">{s.n} — {s.t}</div>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      {next && (
        <div className="card feature">
          <div className="row between">
            <div>
              <div className="small dim">Next event</div>
              <h2 style={{ margin: "0.1rem 0" }}>{next.name}</h2>
              <div className="dim small">
                {new Date(next.whenMs).toLocaleString(undefined, {
                  weekday: "long", month: "short", day: "numeric",
                  hour: "numeric", minute: "2-digit",
                })} · {next.venue}
              </div>
            </div>
            <Link className="btn primary" to="/events">See events</Link>
          </div>
        </div>
      )}

      {top.length > 0 && (
        <section className="section">
          <div className="sec-title"><span className="t">Top of the ladder</span></div>
          <div className="card board-card">
            <table className="board">
              <tbody>
                {top.map((r) => (
                  <tr key={r.playerId} className="podium">
                    <td className="rank"><span className={`medal m${r.rank}`}>{r.rank}</span></td>
                    <td>
                      <PlayerLink id={r.playerId} cls={r.wowClass} name={r.name} />{" "}
                      <ClassTag cls={r.wowClass} />
                    </td>
                    <td className="num">{r.rating}</td>
                    <td className="num dim">{r.wins}–{r.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section">
        <div className="sec-title"><span className="t">Recent duels</span></div>
        <p className="freshness" style={{ marginTop: "-0.3rem" }}>
          {STATUS.ratingGeneration
            ? <>ratings from generation <Freshness atMs={STATUS.ratingGeneration.computedAtMs} now={nowFor(statusSrc)} />{" "}</>
            : "no rating generation yet " }
          · <Link to="/matches">all matches →</Link>
          {" "}· <Link to="/leaderboards">full board →</Link>
        </p>
        <div className="list">
          {MATCHES.slice(0, 3).map((m) => (
            <Link to={`/match/${m.id}`} key={m.id} className="card" style={{ display: "block", color: "inherit" }}>
              <div className="row between">
                <div>
                  <PlayerLink id={m.a.playerId} cls={m.a.wowClass} name={m.a.name} />
                  <ClassTag cls={m.a.wowClass} />
                  <span className="vs">{m.scoreA}–{m.scoreB}</span>
                  <PlayerLink id={m.b.playerId} cls={m.b.wowClass} name={m.b.name} />
                  <ClassTag cls={m.b.wowClass} />
                </div>
                <StatusPill status={m.status} />
              </div>
              <div className="dim small" style={{ marginTop: "0.3rem" }}>
                {m.rulesetName} · {m.ladder ? `${m.ladder} ladder` : "unrated"} ·{" "}
                <Freshness atMs={m.playedAtMs} now={nowFor(matchesSrc)} staleAfterMs={30 * 24 * 3600_000} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="card feature">
          <h2>Get the addon</h2>
          <p className="dim small" style={{ maxWidth: "36em" }}>
            Drop the folder in Interface/AddOns and you're recording. Practice
            duels work immediately — no account needed. When you want results
            on the ladder, the free companion uploads them automatically after
            a single reload.
          </p>
          <div className="row">
            <a className="btn primary" href="#download">Download addon</a>
            <Link className="btn ghost" to="/status">What's proven to work?</Link>
          </div>
        </div>
      </section>
    </>
  );
}
