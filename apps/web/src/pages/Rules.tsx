import { Link } from "react-router-dom";
import { useRulesets } from "../data/source";

export default function RulesPage() {
  const { data: RULESETS } = useRulesets();
  return (
    <>
      <div className="page-head">
        <h1>Rulesets</h1>
        <Link className="btn primary" to="/rules/builder">Build your own</Link>
      </div>
      <p className="dim small">
        A ruleset is an immutable, shareable agreement — both players see the
        same list before accepting. Only the exact approved Standard version
        counts toward the Open ladder.
      </p>
      <div className="list" style={{ marginTop: "1rem" }}>
        {RULESETS.map((r) => (
          <div className="card" key={r.id}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>
                {r.name}
                {r.version !== undefined && (
                  <span className="dim small mono">{" "}v{r.version}</span>
                )}
              </h2>
              <div className="row">
                {r.standardEligible && <span className="pill good">Standard-rated</span>}
                {!r.standardEligible && r.version !== undefined && (
                  <span className="pill">community · casual</span>
                )}
                {r.immutable && <span className="pill">immutable</span>}
              </div>
            </div>
            <p className="dim small">{r.coverageNote}</p>
            {r.rules.length > 0 && (
              <table className="board" style={{ marginTop: "0.4rem" }}>
                <thead><tr><th>Rule</th><th>Phase</th><th>Exceptions</th></tr></thead>
                <tbody>
                  {r.rules.map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <span className={rule.action === "deny" ? "delta-down" : "delta-up"}>
                          {rule.action}
                        </span>{" "}
                        {rule.category.replace(/_/g, " ")}
                        {rule.count !== undefined ? ` (max ${rule.count})` : ""}
                      </td>
                      <td className="dim">{rule.phase.replace(/_/g, " ")}</td>
                      <td className="dim small">
                        {rule.itemExceptions.length === 0
                          ? "—"
                          : rule.itemExceptions.map((x) => x.name).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="row" style={{ marginTop: "0.6rem" }}>
              <Link className="btn ghost small" to={`/rules/builder?from=${r.id}`}>
                Clone &amp; customize
              </Link>
              <span className="dim small mono">share code: {r.id}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
