import { useParams, Link } from "react-router-dom";
import { useMatch, nowFor } from "../data/source";
import { Freshness, StatusPill, ClassTag, EmptyState } from "../components/common";
import { PlayerLink } from "../components/PlayerModal";

const EVIDENCE_LABEL = {
  corroborated: { label: "Corroborated", cls: "good", hint: "Both participants' reports agree." },
  peer_supported: { label: "One report in", cls: "warn", hint: "One side reported. Peer evidence still pending — missing evidence is never a loss." },
  referee: { label: "Referee decision", cls: "info", hint: "A scoped referee ruling resolved this match." },
  disputed: { label: "Disputed", cls: "bad", hint: "Conflicting winner claims — held for review." },
} as const;

export default function MatchPage() {
  const { id } = useParams();
  const { data: m, source } = useMatch(id);
  if (!m) return <EmptyState title="Match not found" />;

  const now = nowFor(source);

  const ev = EVIDENCE_LABEL[m.evidence];
  const winnerName =
    m.winnerId === m.a.playerId ? m.a.name :
    m.winnerId === m.b.playerId ? m.b.name : null;

  return (
    <>
      <div style={{ marginTop: "1rem" }}>
        <Link to="/leaderboards" className="small dim">← boards</Link>
      </div>
      <div className="card" style={{ marginTop: "0.8rem" }}>
        <div className="row between">
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>
            <PlayerLink id={m.a.playerId} cls={m.a.wowClass} name={m.a.name} />{" "}
            <ClassTag cls={m.a.wowClass} />
            <span className="vs">{m.scoreA}–{m.scoreB}</span>
            <PlayerLink id={m.b.playerId} cls={m.b.wowClass} name={m.b.name} />{" "}
            <ClassTag cls={m.b.wowClass} />
          </h1>
          <StatusPill status={m.status} />
        </div>
        <p className="dim small" style={{ margin: "0.5rem 0 0" }}>
          {winnerName ? `${winnerName} wins` : "No winner recorded"} · best of {m.bestOf} ·{" "}
          {m.rulesetName}{m.standard ? " · Standard" : " · custom"} ·{" "}
          played <Freshness atMs={m.playedAtMs} now={now} staleAfterMs={30 * 24 * 3600_000} />
        </p>
      </div>

      {/* only meaningful issues, per doc 12 */}
      {m.note && (
        <div className={`notice${m.evidence === "disputed" ? "" : " info"}`}>{m.note}</div>
      )}
      {m.weightPercent === 0 && (
        <div className="notice info">
          Zero-weight rematch — this pairing already hit its weekly cap. Recorded
          for history, never moves rating.
        </div>
      )}
      {m.weightPercent > 0 && m.weightPercent < 100 && (
        <div className="notice info">
          Repeat pairing this week — counts at {m.weightPercent}% weight.
        </div>
      )}

      <section className="section">
        <h2>Games</h2>
        <div className="card" style={{ padding: "0.4rem 0.6rem" }}>
          <table className="board">
            <thead><tr><th>Game</th><th>Winner</th><th>Reason</th></tr></thead>
            <tbody>
              {m.games.map((g) => (
                <tr key={g.index}>
                  <td className="num">{g.index + 1}{g.voided ? " (void)" : ""}</td>
                  <td>{g.winnerId === m.a.playerId ? m.a.name : g.winnerId === m.b.playerId ? m.b.name : "—"}</td>
                  <td className="dim">{g.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Evidence</h2>
        <div className="card">
          <span className={`pill ${ev.cls}`}>{ev.label}</span>
          <p className="dim small" style={{ margin: "0.5rem 0 0" }}>{ev.hint}</p>
          <hr className="divider" />
          <p className="small dim" style={{ margin: 0 }}>
            received {m.receivedAtMs ? <Freshness atMs={m.receivedAtMs} now={now} staleAfterMs={Infinity} /> : "—"}
            {" · "}
            {m.ratedAtMs
              ? <>rated <Freshness atMs={m.ratedAtMs} now={now} staleAfterMs={Infinity} /></>
              : "rating not settled yet"}
            {m.ratingDelta !== null && (
              <> · <span className={m.ratingDelta >= 0 ? "delta-up" : "delta-down"}>
                {m.ratingDelta >= 0 ? "+" : ""}{m.ratingDelta / 1000} rating
              </span></>
            )}
          </p>
        </div>
      </section>

      <div className="row" style={{ marginTop: "1.2rem" }}>
        <button className="btn">Rematch</button>
        <button className="btn ghost">Report a problem</button>
      </div>
    </>
  );
}
