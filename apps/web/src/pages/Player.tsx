import { useParams, Link } from "react-router-dom";
import { usePlayer, usePlayerMatches, deriveRivals, nowFor } from "../data/source";
import { Freshness, StatusPill, ClassTag, Placement, IdentityBadge, EmptyState } from "../components/common";

export default function PlayerPage() {
  const { id } = useParams();
  const { data: p, source: playerSrc } = usePlayer(id);
  const { data: matches, source: matchesSrc } = usePlayerMatches(id);
  if (!p) return <EmptyState title="No such fighter">They may not have joined yet.</EmptyState>;

  const rivals = deriveRivals(p.id, matches);

  return (
    <>
      <div className="row between" style={{ marginTop: "1rem" }}>
        <div>
          <h1 style={{ margin: 0 }} className={`cls-${p.wowClass}`}>{p.name} <ClassTag cls={p.wowClass} /></h1>
          <div className="dim small">
            {p.realm} · {p.titles.join(" · ") || "no titles yet"}
          </div>
          <div className="dim small" style={{ marginTop: "0.15rem" }}>
            identity: {p.tier === "provider_verified" ? "verified — linked account"
              : p.tier === "witnessed" ? "verified — event check-in"
              : "unverified — practice play only"}
          </div>
        </div>
        <IdentityBadge tier={p.tier} />
      </div>

      <div className="row" style={{ gap: "1.5rem", margin: "1rem 0" }}>
        <div>
          <div className="small dim">Open rating</div>
          {p.open.rating !== null ? (
            <div className="rating-big">{p.open.rating}</div>
          ) : p.open.placement ? (
            <div><Placement p={p.open.placement} /></div>
          ) : (
            <div className="dim">unranked</div>
          )}
          <div className="dim small num">{p.open.wins}–{p.open.losses}</div>
        </div>
        {p.mirror.rating !== null && (
          <div>
            <div className="small dim">Mirror rating</div>
            <div className="rating-big">{p.mirror.rating}</div>
            <div className="dim small num">{p.mirror.wins}–{p.mirror.losses}</div>
          </div>
        )}
      </div>
      <p className="freshness">last active <Freshness atMs={p.lastActiveAtMs} now={nowFor(playerSrc)} staleAfterMs={7 * 24 * 3600_000} /></p>

      <section className="section">
        <div className="sec-title"><span className="t">Matches</span></div>
        {matches.length === 0 ? (
          <EmptyState title="No recorded duels yet">
            Practice duels count toward placement — challenge anyone with the addon.
          </EmptyState>
        ) : (
          <div className="list">
            {matches.map((m) => {
              const opp = m.a.playerId === p.id ? m.b : m.a;
              const won = m.winnerId === p.id;
              return (
                <Link to={`/match/${m.id}`} key={m.id} className="card" style={{ color: "inherit" }}>
                  <div className="row between">
                    <div>
                      <span className={won ? "delta-up" : m.winnerId ? "delta-down" : "dim"}>
                        {m.winnerId === null ? "—" : won ? "W" : "L"}
                      </span>
                      <span className="vs"> vs </span>
                      <span className={`cls-${opp.wowClass}`}>{opp.name}</span> <ClassTag cls={opp.wowClass} />
                    </div>
                    <StatusPill status={m.status} />
                  </div>
                  <div className="dim small" style={{ marginTop: "0.25rem" }}>
                    {m.rulesetName} · <Freshness atMs={m.playedAtMs} now={nowFor(matchesSrc)} staleAfterMs={30 * 24 * 3600_000} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {rivals.length > 0 && (
        <section className="section">
          <div className="sec-title"><span className="t">Rivals</span></div>
          <div className="rival-grid">
            {rivals.map((r) => {
              const decided = r.wins + r.losses;
              const pending = r.meetings - decided;
              const winPct = decided > 0 ? (r.wins / decided) * 100 : 0;
              return (
                <Link to={`/player/${r.playerId}`} key={r.playerId}
                  className="card rival-card">
                  <div className="row between">
                    <span className={`cls-${r.wowClass}`}>{r.name}</span> <ClassTag cls={r.wowClass} />
                    <span className="score">{r.wins}–{r.losses}</span>
                  </div>
                  <div className="rival-bar" aria-hidden="true">
                    <span style={{ width: `${winPct}%` }} />
                  </div>
                  <div className="dim small">
                    {decided === 0
                      ? "no decided series yet"
                      : `${r.meetings} meeting${r.meetings === 1 ? "" : "s"}`}
                    {pending > 0 && ` · ${pending} pending`}
                    {" · last "}
                    <Freshness atMs={r.lastPlayedMs} now={nowFor(matchesSrc)}
                      staleAfterMs={30 * 24 * 3600_000} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
