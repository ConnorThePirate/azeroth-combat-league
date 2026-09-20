import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { apiConfigured, getSessionToken } from "../data/api";

/**
 * Pairing approval (docs/27): the companion shows a code; the signed-in
 * player approves it here. The credential is scoped to report submission +
 * own receipts — nothing else.
 */
const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? null;

export default function PairPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function approve() {
    setState("working");
    setError("");
    try {
      const token = await getSessionToken();
      if (!token) throw new Error("sign in on the Account page first");
      const res = await fetch(`${API}/v1/pair/approve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userCode: code.toUpperCase() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `error ${res.status}`);
      }
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "approval failed");
      setState("error");
    }
  }

  if (!apiConfigured()) {
    return (
      <div className="card" style={{ marginTop: "2rem" }}>
        <h1>Pair a companion</h1>
        <p className="dim">
          This site is running on fixture data — no API is configured, so
          pairing can't complete. Set <code>VITE_API_URL</code> to point at a
          live backend.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 style={{ marginTop: "1rem" }}>Pair a companion</h1>
      <p className="dim small">
        Enter the code the companion printed. It gets permission to submit
        your duel reports and read its own receipts — nothing else. You can
        revoke it any time from Account → Devices.
      </p>
      {state === "done" ? (
        <div className="card">
          <h2>Paired</h2>
          <p className="dim small">
            The companion can now upload reports. Return to the game — results
            flow after your next <strong>Save results &amp; reload</strong>.
          </p>
          <Link className="btn" to="/account">Back to account</Link>
        </div>
      ) : (
        <div className="card">
          <div className="field">
            <label htmlFor="pair-code">Pairing code</label>
            <input id="pair-code" type="text" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. VZ54" maxLength={12}
              style={{ fontFamily: "var(--mono)", letterSpacing: "0.2em", maxWidth: "12rem" }} />
          </div>
          {error && <div className="notice">{error}</div>}
          <button className="btn primary" onClick={approve}
            disabled={state === "working" || !code.trim()}>
            {state === "working" ? "Approving…" : "Approve device"}
          </button>
          <p className="dim small" style={{ marginTop: "0.75rem" }}>
            Uses your signed-in account — <Link to="/account">sign in first</Link> if
            you haven't.
          </p>
        </div>
      )}
    </>
  );
}
