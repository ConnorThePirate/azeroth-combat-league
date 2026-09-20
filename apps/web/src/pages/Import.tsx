import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { decodeExport, validateSyncEnvelope } from "@acl/contracts";

/**
 * Import results — Advanced/Recovery only (docs/12, 27).
 *
 * Paste -> preview -> submit. The pasted text is preserved in sessionStorage
 * across a sign-in redirect (short expiry, cleared on completion/cancel,
 * never in URLs or analytics). Duplicates are harmless — reported as
 * "already received", not errors.
 */
const STASH_KEY = "acl.pending-import";
const STASH_TTL = 15 * 60_000;

interface Preview {
  installationId: string;
  reportCount: number;
  batches: number;
}

export default function ImportPage() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ accepted: number; already: number; attention: number } | null>(null);

  // restore preserved input after a sign-in round-trip
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STASH_KEY);
      if (raw) {
        const { text: t, atMs } = JSON.parse(raw) as { text: string; atMs: number };
        if (Date.now() - atMs < STASH_TTL) setText(t);
        sessionStorage.removeItem(STASH_KEY);
      }
    } catch { /* private mode etc. */ }
  }, []);

  useEffect(() => {
    try {
      if (text) {
        sessionStorage.setItem(STASH_KEY, JSON.stringify({ text, atMs: Date.now() }));
      } else {
        sessionStorage.removeItem(STASH_KEY);
      }
    } catch { /* ignore */ }
  }, [text]);

  function onPreview() {
    setError(null);
    setPreview(null);
    // The addon's Copy results produces WFP2 batches (one envelope per batch).
    const chunks = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    let total = 0;
    let installationId = "";
    try {
      for (const c of chunks) {
        const env = decodeExport(c) as { installationId?: string; reports?: unknown[] };
        const errs = validateSyncEnvelope(env as never);
        if (errs.length > 0) {
          throw new Error(`invalid envelope: ${errs[0]!.path} — ${errs[0]!.message}`);
        }
        installationId = env.installationId ?? "";
        total += env.reports?.length ?? 0;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That doesn't look like an ACL export string.");
      return;
    }
    setPreview({ installationId, reportCount: total, batches: chunks.length });
  }

  function onSubmit() {
    // fixture path: pretend server accepted the batch with one duplicate
    setDone({ accepted: Math.max(0, (preview?.reportCount ?? 1) - 1), already: 1, attention: 0 });
    setText("");
    try { sessionStorage.removeItem(STASH_KEY); } catch { /* ignore */ }
  }

  return (
    <>
      <div style={{ marginTop: "1rem" }}>
        <Link to="/account" className="small dim">← account</Link>
      </div>
      <h1 style={{ marginTop: "0.5rem" }}>Import results</h1>
      <p className="dim small">
        Recovery path. Paste the string from the addon's{" "}
        <strong>Advanced → Copy results</strong>. If you get signed out, your
        paste is kept for 15 minutes — it never goes into a URL or analytics.
      </p>

      {done ? (
        <div className="card">
          <h2>Import complete</h2>
          <p>
            <span className="delta-up">{done.accepted} accepted</span> ·{" "}
            {done.already} already received · {done.attention} need attention
          </p>
          <p className="dim small">
            Reports are received — rating settles once the other side's evidence
            arrives (or a referee reviews). Nothing else to do; you can also
            copy an addon update to refresh your in-game display.
          </p>
          <div className="row">
            <button className="btn" onClick={() => setDone(null)}>Import another</button>
            <Link className="btn ghost" to="/account">Done</Link>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="field">
            <label htmlFor="import-text">Export string (WFP2:…)</label>
            <textarea id="import-text" value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="WFP2:…" spellCheck={false} />
          </div>
          {error && <div className="notice">{error}</div>}
          {preview && (
            <div className="notice info">
              {preview.reportCount} report{preview.reportCount === 1 ? "" : "s"} in{" "}
              {preview.batches} batch{preview.batches === 1 ? "" : "es"} from
              installation <span className="mono">{preview.installationId.slice(0, 8)}…</span>.
              Characters shown are attributed to the signed-in account — never
              treated as ownership proof.
            </div>
          )}
          <div className="row" style={{ marginTop: "0.8rem" }}>
            {!preview
              ? <button className="btn primary" onClick={onPreview} disabled={!text.trim()}>Preview</button>
              : <button className="btn primary" onClick={onSubmit}>Import {preview.reportCount} reports</button>}
            <button className="btn ghost" onClick={() => { setText(""); setPreview(null); setError(null); }}>
              Clear
            </button>
          </div>
        </div>
      )}
    </>
  );
}
