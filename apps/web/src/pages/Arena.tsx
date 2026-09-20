import { Link } from "react-router-dom";

/**
 * Arena — honest "in development" page. We don't fake a bracket: what
 * exists today is 1v1 contract dueling; team formats need capabilities
 * the beta lab hasn't proven yet.
 */
export default function ArenaPage() {
  return (
    <>
      <div className="page-head" style={{ justifyContent: "flex-start", gap: "0.6rem" }}>
        <h1>Arena</h1>
        <span className="pill warn" style={{ marginBottom: "0.15rem" }}>in development</span>
      </div>
      <p className="dim small">
        Team formats — 2v2, 3v3, bracketed cups — are on the roadmap, not
        shipped. Nothing on this page is pretend: here's where it stands.
      </p>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>What exists today</h2>
        <p className="dim small" style={{ marginBottom: 0 }}>
          1v1 contract duels with selectable rulesets, automatic recording,
          and corroborated results — the <Link to="/leaderboards">ladder</Link>{" "}
          is live. Same-class duels run on the separate{" "}
          <Link to="/leaderboards">Mirror board</Link>.
        </p>
      </div>

      <div className="card">
        <h2>What arena needs before it ships</h2>
        <ul className="dim small" style={{ margin: 0, paddingLeft: "1.2rem" }}>
          <li>Party-aware contracts — a 2v2 needs four attesting clients, not two</li>
          <li>Team identity — which partner played, verified the same way duel identities are</li>
          <li>Client probes proving party/arena detection on the Forever build</li>
          <li>A rating model for teams — not invented until the data exists to test it</li>
        </ul>
      </div>

      <div className="card">
        <h2>Meanwhile</h2>
        <p className="dim small" style={{ marginBottom: 0 }}>
          Organizers already run bracketed events on the{" "}
          <Link to="/events">events board</Link> — a fight night with referees
          is most of what makes arena feel like arena.
        </p>
      </div>
    </>
  );
}
