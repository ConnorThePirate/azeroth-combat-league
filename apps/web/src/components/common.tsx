/** Shared bits — freshness, status pills, placement progress (docs/12). */
import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RecordStatus, PlacementProgress, WowClass } from "../data/types";

/** A render error must degrade to a card, never a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  override state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  override render() {
    if (this.state.err) {
      return (
        <div className="card" style={{ marginTop: "2rem" }}>
          <h2>Something broke on this page</h2>
          <p className="dim small mono">{this.state.err.message}</p>
          <p className="dim small">The rest of the site still works — pick a tab above, or reload.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function Freshness({ atMs, now, staleAfterMs = 6 * 3600_000 }: {
  atMs: number; now: number; staleAfterMs?: number;
}) {
  const stale = now - atMs > staleAfterMs;
  return (
    <span className={`freshness${stale ? " stale" : ""}`} title={new Date(atMs).toLocaleString()}>
      {ago(atMs, now)}{stale ? " · stale" : ""}
    </span>
  );
}

const STATUS_LABEL: Record<RecordStatus, { label: string; cls: string }> = {
  recorded_locally: { label: "Recorded locally", cls: "info" },
  saved_for_upload: { label: "Saved for upload", cls: "info" },
  received: { label: "Received", cls: "info" },
  awaiting_opponent: { label: "Awaiting opponent", cls: "warn" },
  under_review: { label: "Under review", cls: "bad" },
  rated: { label: "Rated", cls: "good" },
};

export function StatusPill({ status }: { status: RecordStatus }) {
  const s = STATUS_LABEL[status];
  return <span className={`pill ${s.cls}`}>{s.label}</span>;
}

export function ClassTag({ cls }: { cls: WowClass }) {
  return <span className={`class-tag cls-${cls}`}>{cls}</span>;
}

/** "New Challenger: 6/10 series, 3/5 opponents" — progress, not mystery. */
export function Placement({ p }: { p: PlacementProgress }) {
  return (
    <span className="pill accent">
      New Challenger · {p.seriesDone}/{p.seriesNeeded} series · {p.opponentsDone}/{p.opponentsNeeded} opponents
    </span>
  );
}

/**
 * Identity verification badge — describes how strongly the *character's
 * identity* is established (docs/26). Never shown as match evidence:
 * regular duels are corroborated by both clients, never witnessed.
 */
export function IdentityBadge({ tier }: { tier: "claimed" | "witnessed" | "provider_verified" }) {
  if (tier === "provider_verified")
    return <span className="pill good" title="Account-linked identity">Verified</span>;
  if (tier === "witnessed")
    return <span className="pill info" title="Verified by event staff at an event check-in">Verified · check-in</span>;
  return <span className="pill" title="Self-reported name — practice play only">Unverified</span>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flat" style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
      <p style={{ fontSize: "1.05rem", margin: "0 0 0.3rem" }}>{title}</p>
      {children && <p className="dim small" style={{ margin: 0 }}>{children}</p>}
    </div>
  );
}

export { Link };
