import { useState } from "react";
import { Link } from "react-router-dom";
import { useMatches, nowFor } from "../data/source";
import { Freshness, StatusPill, ClassTag, EmptyState } from "../components/common";
import { PlayerLink } from "../components/PlayerModal";
import type { MatchRecord } from "../data/types";

type Filter = "all" | "rated" | "pending" | "disputed" | "unrated";

const FILTERS: { id: Filter; label: string; match: (m: MatchRecord) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "rated", label: "Rated", match: (m) => m.status === "rated" },
  { id: "pending", label: "Pending",
    match: (m) => m.status === "awaiting_opponent" || m.status === "received" },
  { id: "disputed", label: "Under review", match: (m) => m.status === "under_review" },
  { id: "unrated", label: "Unrated", match: (m) => m.ladder === null },
];

const EVIDENCE: Record<MatchRecord["evidence"], { label: string; cls: string }> = {
  corroborated: { label: "corroborated", cls: "good" },
  peer_supported: { label: "one report", cls: "warn" },
  referee: { label: "referee", cls: "info" },
  disputed: { label: "disputed", cls: "bad" },
};

export default function MatchesPage() {
  const { data: matches, source, loading } = useMatches();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = matches.filter(FILTERS.find((f) => f.id === filter)!.match);

  return (
    <>
      <div className="page-head">
        <h1>Matches</h1>
        <span className="freshness">
          {loading ? "loading…" : source === "live" ? "live" : "fixture data"}
        </span>
      </div>
      <p className="dim small">
        Every recorded duel — pending, corroborated, disputed, unrated. Nothing
        counts toward a ladder until independent evidence agrees.
      </p>

      <div className="chip-row" role="group" aria-label="Filter matches">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip${filter === f.id ? " on" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No matches here yet">
          Duels show up as soon as the addon or companion delivers the first report.
        </EmptyState>
      ) : (
        <div className="list">
          {shown.map((m) => {
            const ev = m.reportsReceived === 0
              ? { label: "no reports yet", cls: "info" }
              : EVIDENCE[m.evidence];
            return (
              <Link to={`/match/${m.id}`} key={m.id} className="card"
                style={{ display: "block", color: "inherit" }}>
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
                  <span className={`pill ${ev.cls}`} style={{ marginRight: "0.5rem" }}>
                    {ev.label}
                  </span>
                  {m.rulesetName} · {m.ladder ? `${m.ladder} ladder` : "unrated"} ·{" "}
                  <Freshness atMs={m.playedAtMs} now={nowFor(source)}
                    staleAfterMs={30 * 24 * 3600_000} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
