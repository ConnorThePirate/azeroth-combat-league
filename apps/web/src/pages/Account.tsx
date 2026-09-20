import { useState } from "react";
import { Link } from "react-router-dom";
import { useStatus, nowFor } from "../data/source";
import { Freshness } from "../components/common";
import { clearAccount, ensureSession, storedAccount, storeAccount } from "../data/api";

export default function AccountPage() {
  const { data: STATUS, source } = useStatus();
  const now = nowFor(source);
  const [acct, setAcct] = useState(storedAccount() ?? "");
  const [signed, setSigned] = useState(!!storedAccount());
  const [busy, setBusy] = useState(false);

  async function signIn() {
    const a = acct.trim();
    if (!a) return;
    setBusy(true);
    try { storeAccount(a); await ensureSession(a); setSigned(true); }
    finally { setBusy(false); }
  }
  function signOut() {
    clearAccount();
    setSigned(false);
  }

  return (
    <>
      <div className="page-head">
        <h1>Account</h1>
      </div>

      <div className="card">
        <h2>Sign in</h2>
        {signed ? (
          <div className="row between">
            <span>Signed in as <span className="mono">{acct}</span></span>
            <button className="btn ghost" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <>
            <p className="dim small">
              Browsing is open — leaderboards, rules, and events need no
              account. Sign in to sign up for events, run your own night,
              or link characters. (Dev sign-in until Battle.net lands.)
            </p>
            <div className="row">
              <input type="text" value={acct} placeholder="account id"
                onChange={(e) => setAcct(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void signIn(); }}
                style={{ maxWidth: "14rem" }} />
              <button className="btn primary" disabled={busy || !acct.trim()}
                onClick={signIn}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Identity</h2>
        <p className="dim small">
          Sign in with Battle.net to claim characters. Claimed characters play
          practice duels immediately; ranked requires identity verification —
          either a linked account, or a check-in with designated staff at an
          event. Regular duels are corroborated by both clients; nobody
          witnesses a ladder match.
        </p>
        <div className="row">
          <button className="btn primary">Connect Battle.net</button>
          <span className="pill">claimed · practice only</span>
        </div>
      </div>

      <div className="card">
        <h2>Automatic uploads</h2>
        <p className="dim small">
          The companion watches your addon's saved-results file and uploads
          after you press <strong>Confirm &amp; upload</strong> in game —
          once per reload, not per duel. Optional; practice never needs it.
        </p>
        <p className="dim small">
          Run <code>acl-companion install</code> once after setup — it puts a{" "}
          <strong>Play WoW + ACL</strong> shortcut on your desktop that launches
          the game, syncs while you play, and exits when you close WoW. Prefer
          your own launcher? <code>install --autostart</code> runs a tiny watcher
          at login so any way of starting the game works.
        </p>
        <div className="row">
          <button className="btn">Set up companion</button>
          <span className="dim small">or rely on a signed peer/relay carrier — no install needed</span>
        </div>
      </div>

      <div className="card">
        <h2>Devices &amp; sessions</h2>
        <p className="dim small">
          Paired companions are scoped to submitting reports and reading their
          own receipts. Revoke any device here.
        </p>
        <table className="board">
          <thead><tr><th>Device</th><th>Paired</th><th>Last upload</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td>Desktop-7F2 (companion)</td>
              <td className="dim"><Freshness atMs={now - 3 * 24 * 3600_000} now={now} staleAfterMs={Infinity} /></td>
              <td className="dim"><Freshness atMs={now - 5 * 3600_000} now={now} staleAfterMs={Infinity} /></td>
              <td><button className="btn ghost" style={{ fontSize: "0.8rem" }}>Revoke</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <details className="adv">
        <summary>Advanced / Recovery</summary>
        <div>
          <div className="row">
            <Link className="btn" to="/account/import">Import results (paste)</Link>
            <button className="btn">Copy addon update</button>
          </div>
          <p className="dim small" style={{ marginTop: "0.5rem" }}>
            Manual import is a recovery path — evidence this way is just as
            trustworthy, it's simply not the routine flow.
          </p>
        </div>
      </details>

      <p className="freshness" style={{ marginTop: "1.5rem" }}>
        config {STATUS.configVersion} · issued <Freshness atMs={STATUS.generatedAtMs} now={now} staleAfterMs={24 * 3600_000} />
      </p>
    </>
  );
}
