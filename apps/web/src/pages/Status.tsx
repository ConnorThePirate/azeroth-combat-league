import { useStatus, nowFor } from "../data/source";
import { Freshness } from "../components/common";

const PILL: Record<string, string> = {
  working: "good", partial: "warn", unknown: "", down: "bad",
};

export default function StatusPage() {
  const { data: STATUS, source } = useStatus();
  return (
    <>
      <div className="page-head">
        <h1>Status</h1>
      </div>
      <p className="dim small">
        What the addon can actually do on the Forever build — measured in the
        beta lab, not assumed from docs. Config {STATUS.configVersion}, issued{" "}
        <Freshness atMs={STATUS.generatedAtMs} now={nowFor(source)} staleAfterMs={24 * 3600_000} />.
      </p>
      <div className="card" style={{ padding: "0.4rem 0.6rem", marginTop: "1rem" }}>
        <table className="board">
          <thead><tr><th>Capability</th><th>Status</th><th>What we know</th></tr></thead>
          <tbody>
            {STATUS.capabilities.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td><span className={`pill ${PILL[c.status]}`}>{c.status}</span></td>
                <td className="dim small">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>Rating generation</h2>
        {STATUS.ratingGeneration ? (
          <p className="small">
            <span className="mono">{STATUS.ratingGeneration.id}</span> ·{" "}
            {STATUS.ratingGeneration.seriesCounted} series counted · computed{" "}
            <Freshness atMs={STATUS.ratingGeneration.computedAtMs} now={nowFor(source)} />
          </p>
        ) : (
          <p className="small dim">
            No generation yet — ratings publish after the first corroborated series.
          </p>
        )}
        <p className="dim small">
          Ratings replay deterministically from immutable evidence. If a bug is
          found, a new generation is published and the pointer swaps — the old
          one stays inspectable.
        </p>
      </div>
    </>
  );
}
