import { useWorld } from "../data/source";
import { ClassTag, EmptyState } from "../components/common";
import { PlayerLink } from "../components/PlayerModal";
import type { WorldEntry } from "../data/types";

function Board({ title, hint, rows }: {
  title: string; hint: string; rows: WorldEntry[];
}) {
  return (
    <section className="section" style={{ marginTop: "1.2rem" }}>
      <div className="sec-title"><span className="t">{title}</span></div>
      <p className="dim small" style={{ marginTop: "-0.3rem" }}>{hint}</p>
      {rows.length === 0 ? (
        <EmptyState title="Nobody on this board yet">
          Opt in with the addon and your kills start journaling.
        </EmptyState>
      ) : (
        <div className="card board-card">
          <table className="board">
            <thead>
              <tr><th>#</th><th>Fighter</th><th>Points</th><th>Reports</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId} className={r.rank <= 3 ? "podium" : undefined}>
                  <td className="rank">
                    {r.rank <= 3 ? <span className={`medal m${r.rank}`}>{r.rank}</span>
                      : <span className="plain">{r.rank}</span>}
                  </td>
                  <td>
                    <PlayerLink id={r.playerId} cls={r.wowClass} name={r.name} />{" "}
                    <ClassTag cls={r.wowClass} />
                  </td>
                  <td className="num">{r.points}</td>
                  <td className="num dim">{r.reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function WorldPage() {
  const { data: world, source } = useWorld();
  return (
    <>
      <div className="page-head">
        <h1>World PvP</h1>
      </div>
      <p className="dim small">
        Opt-in journals for open-world kills (<b>War</b>) and Gurubashi-style
        pit brawls (<b>Pit</b>). Duels stay on the ladder — this is for the
        fights that happen out in the world.
        {source === "fixture" && " (fixture data)"}
      </p>

      {!world.scoringLive && (
        <div className="notice info" style={{ margin: "0.8rem 0" }}>
          Journal-only for now — these are pilot numbers. Scoring turns on
          when the client probes prove we can detect world kills reliably;
          the status page shows what's been measured.
        </div>
      )}

      <Board title="War" rows={world.war}
        hint="Honorable kills in the open world, journaled by opt-in." />
      <Board title="Pit" rows={world.pit}
        hint="Free-for-all brawls — survive, score, get out." />

      <p className="dim small" style={{ marginTop: "1.2rem" }}>
        Opt in or out any time in the addon settings — journals are yours,
        and nothing here touches your duel rating.
      </p>
    </>
  );
}
