import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStatus, nowFor } from "../data/source";
import { ClassTag, Freshness, IdentityBadge } from "../components/common";
import { PlayerLink } from "../components/PlayerModal";
import {
  api, apiConfigured, clearAccount, ensureSession, getSessionToken,
  storedAccount, storeAccount, supabase, type MeResponse,
} from "../data/api";
import type { VerificationTier, WowClass } from "../data/types";

const CLASS_BY_ID: Record<number, WowClass> = {
  1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest",
  6: "shaman", 7: "mage", 8: "warlock", 9: "druid",
};

/** The account's character list — shared by the Supabase and dev views. */
function MeCharacters({ me }: { me: MeResponse }) {
  return (
    <div style={{ marginTop: "0.8rem" }}>
      <p className="dim small" style={{ margin: "0 0 0.4rem" }}>
        Account <span className="mono">{me.accountId}</span>
      </p>
      {me.characters.length > 0 ? (
        <table className="board">
          <thead>
            <tr><th>Character</th><th>Class</th><th>Identity</th></tr>
          </thead>
          <tbody>
            {me.characters.map((c) => (
              <tr key={c.id}>
                <td>
                  <PlayerLink id={c.id} name={c.name}
                    cls={CLASS_BY_ID[c.classId]} />
                </td>
                <td>
                  {CLASS_BY_ID[c.classId]
                    ? <ClassTag cls={CLASS_BY_ID[c.classId]!} />
                    : <span className="dim">unknown</span>}
                </td>
                <td>
                  <IdentityBadge
                    tier={c.verificationTier as VerificationTier} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="dim small" style={{ margin: 0 }}>
          No characters on this account yet — register one below, or check
          in with event staff to verify one.
        </p>
      )}
    </div>
  );
}

/** POST /v1/characters — self-registration. Characters always land at
 *  claimed tier; only an event check-in or provider verification raises
 *  them, so the copy says that plainly. */
function RegisterCharacter({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [classId, setClassId] = useState(1);
  const [factionId, setFactionId] = useState(0);
  const [level, setLevel] = useState("60");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit() {
    const n = name.trim();
    if (!n) return;
    setBusy(true); setNote(null); setOk(null);
    try {
      const token = await getSessionToken();
      if (!token) throw new Error("sign in first");
      const res = await api.createCharacter(
        { name: n, classId, factionId, level: Number(level) }, token);
      setOk(`${res.character.name} registered — claimed tier.`);
      setName("");
      await onDone(); // reload /v1/me so the character list picks it up
    } catch (e) {
      const msg = e instanceof Error ? e.message : "registration failed";
      setNote(
        msg.includes("name_taken")
          ? "That name is already taken — names are unique on the megaserver."
          : msg.includes("invalid_name")
            ? "Names are 2–12 letters — no spaces, numbers or punctuation."
            : msg.includes("invalid_")
              ? "A field was rejected — check class, faction and level (1–60)."
              : msg);
    } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Register a character</h2>
      <p className="dim small">
        Tell the league who you play. Characters register as{" "}
        <strong>claimed</strong> — they can duel and record matches
        immediately, but only count on the ladder after an event check-in
        or provider verification. Names are unique on the megaserver,
        first come first served.
      </p>
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="reg-name">Name</label>
          <input id="reg-name" type="text" value={name} maxLength={12}
            placeholder="Testadin" style={{ width: "10rem" }}
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="reg-class">Class</label>
          <select id="reg-class" value={classId} style={{ width: "8.5rem" }}
            onChange={(e) => setClassId(Number(e.target.value))}>
            {Object.entries(CLASS_BY_ID).map(([id, cls]) => (
              <option key={id} value={id}>
                {cls.charAt(0).toUpperCase() + cls.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="reg-faction">Faction</label>
          <select id="reg-faction" value={factionId} style={{ width: "7.5rem" }}
            onChange={(e) => setFactionId(Number(e.target.value))}>
            <option value={0}>Alliance</option>
            <option value={1}>Horde</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="reg-level">Level</label>
          <input id="reg-level" type="number" min={1} max={60} value={level}
            style={{ width: "5rem" }}
            onChange={(e) => setLevel(e.target.value)} />
        </div>
        <button className="btn primary" disabled={busy || !name.trim()}
          onClick={submit}>
          {busy ? "Registering…" : "Register"}
        </button>
      </div>
      {ok && <div className="notice info" style={{ marginTop: "0.6rem" }}>{ok}</div>}
      {note && <div className="notice" style={{ marginTop: "0.6rem" }}>{note}</div>}
    </div>
  );
}

type AuthMode = "signin" | "signup";

export default function AccountPage() {
  const { data: STATUS, source } = useStatus();
  const now = nowFor(source);
  const [acct, setAcct] = useState(storedAccount() ?? "");
  const [signed, setSigned] = useState(!!storedAccount());
  const [busy, setBusy] = useState(false);

  // Supabase Auth state — null user = not signed in
  const [sbUser, setSbUser] = useState<{ email: string | null } | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [checking, setChecking] = useState(!!supabase);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  /** Pull the provisioned account + characters once a session exists. */
  async function loadMe(user: { email: string | null }) {
    setSbUser(user);
    setChecking(false);
    const token = await getSessionToken();
    if (!token || !apiConfigured()) { setMe(null); return; }
    setMeLoading(true);
    try {
      const m = await api.me(token);
      setMe(m);
      // lets Events/Pair prefill the real account id for this session
      storeAccount(m.accountId);
      setAcct(m.accountId);
      setSigned(true);
    } catch {
      setMe(null); // token rejected — show the session without detail
    } finally {
      setMeLoading(false);
    }
  }

  /** Re-fetch /v1/me — e.g. after registering a character. */
  async function reloadMe() {
    const token = await getSessionToken();
    if (!token || !apiConfigured()) return;
    try { setMe(await api.me(token)); } catch { /* keep stale view */ }
  }

  // Supabase session bootstrap — getSession() also finishes the OAuth
  // redirect-back (supabase-js parses the URL hash on load).
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, s) => {
        if (s?.user) void loadMe({ email: s.user.email ?? null });
        else if (live) { setSbUser(null); setMe(null); setChecking(false); }
      });
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!live) return;
        if (data.session?.user) {
          void loadMe({ email: data.session.user.email ?? null });
        } else {
          setChecking(false);
        }
      })
      .catch(() => { if (live) setChecking(false); });
    return () => { live = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dev mode (no Supabase): a stored account gets a session + /v1/me so the
  // character list and registration card show just like the real sign-in.
  useEffect(() => {
    if (supabase || !apiConfigured() || !storedAccount()) return;
    let live = true;
    void (async () => {
      try {
        const token = await ensureSession(storedAccount()!);
        const m = await api.me(token);
        if (live) setMe(m);
      } catch { /* API down or token rejected — stay on the basic view */ }
    })();
    return () => { live = false; };
  }, []);

  async function submitAuth() {
    if (!supabase) return;
    setBusy(true); setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (error) throw error;
        // onAuthStateChange -> loadMe picks the session up
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
        });
        if (error) throw error;
        if (!data.session) {
          // email confirmation enabled — nothing to validate against yet
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "sign-in failed");
    } finally { setBusy(false); }
  }

  async function oauth(provider: "discord" | "google") {
    if (!supabase) return;
    setBusy(true); setNotice(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/account` },
    });
    // on success the browser is navigating to the provider — nothing to do
    if (error) { setNotice(error.message); setBusy(false); }
  }

  async function signOutAll() {
    setBusy(true);
    try {
      if (supabase) await supabase.auth.signOut().catch(() => undefined);
      clearAccount();
      setSbUser(null); setMe(null); setSigned(false);
    } finally { setBusy(false); }
  }

  // Dev path (no Supabase env) — account-id login, then the same /v1/me view.
  async function signIn() {
    const a = acct.trim();
    if (!a) return;
    setBusy(true);
    try {
      storeAccount(a);
      const token = await ensureSession(a);
      setSigned(true);
      if (apiConfigured()) {
        try { setMe(await api.me(token)); } catch { setMe(null); }
      }
    } finally { setBusy(false); }
  }
  function signOut() {
    clearAccount();
    setMe(null);
    setSigned(false);
  }

  return (
    <>
      <div className="page-head">
        <h1>Account</h1>
      </div>

      {supabase ? (
        <div className="card">
          <h2>Sign in</h2>
          {checking ? (
            <p className="dim small">Checking your session…</p>
          ) : sbUser ? (
            <>
              <div className="row between">
                <span>
                  Signed in{sbUser.email ? <> as <strong>{sbUser.email}</strong></> : ""}
                </span>
                <button className="btn ghost" disabled={busy} onClick={signOutAll}>
                  Sign out
                </button>
              </div>
              {meLoading ? (
                <p className="dim small" style={{ marginTop: "0.6rem" }}>
                  Loading account…
                </p>
              ) : me ? (
                <MeCharacters me={me} />
              ) : (
                <p className="dim small" style={{ marginTop: "0.6rem" }}>
                  {apiConfigured()
                    ? "Account details unavailable — the API did not recognize the session."
                    : "API not configured — signed in, but account details need VITE_API_URL."}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="dim small">
                Browsing is open — leaderboards, rules, and events need no
                account. Sign in to sign up for events, run your own night,
                or link characters.
              </p>
              <div className="row" style={{ marginBottom: "0.8rem" }}>
                <button className={`btn${mode === "signin" ? " primary" : ""}`}
                  onClick={() => { setMode("signin"); setNotice(null); }}>
                  Sign in
                </button>
                <button className={`btn${mode === "signup" ? " primary" : ""}`}
                  onClick={() => { setMode("signup"); setNotice(null); }}>
                  Create account
                </button>
              </div>
              <div className="field">
                <label htmlFor="auth-email">Email</label>
                <input id="auth-email" type="email" value={email}
                  autoComplete="email" style={{ maxWidth: "16rem" }}
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="auth-pass">Password</label>
                <input id="auth-pass" type="password" value={password}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  style={{ maxWidth: "16rem" }}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void submitAuth(); }} />
              </div>
              {notice && (
                <div className="notice" style={{ marginBottom: "0.8rem" }}>{notice}</div>
              )}
              <div className="row">
                <button className="btn primary"
                  disabled={busy || !email.trim() || !password}
                  onClick={submitAuth}>
                  {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
                </button>
                <button className="btn" disabled={busy}
                  onClick={() => void oauth("discord")}>
                  Continue with Discord
                </button>
                <button className="btn" disabled={busy}
                  onClick={() => void oauth("google")}>
                  Continue with Google
                </button>
              </div>
              <p className="dim small" style={{ marginTop: "0.6rem" }}>
                Discord/Google appear when the deployment enables those
                providers; email sign-up may ask you to confirm your address
                first.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <h2>Sign in</h2>
          {signed ? (
            <>
              <div className="row between">
                <span>Signed in as <span className="mono">{acct}</span></span>
                <button className="btn ghost" onClick={signOut}>Sign out</button>
              </div>
              {me && <MeCharacters me={me} />}
            </>
          ) : (
            <>
              <p className="dim small">
                Browsing is open — leaderboards, rules, and events need no
                account. Sign in to sign up for events, run your own night,
                or link characters.
              </p>
              <div className="notice info" style={{ marginBottom: "0.8rem" }}>
                Development sign-in — no password, no verification. It exists
                for local testing and disappears once Supabase Auth is
                configured on this deployment.
              </div>
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
      )}

      {me && <RegisterCharacter onDone={reloadMe} />}

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
