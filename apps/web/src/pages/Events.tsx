import { useState } from "react";
import { useEvents, nowFor, type DataSource } from "../data/source";
import { api, apiConfigured, ensureSession, storedAccount, storeAccount } from "../data/api";
import { Freshness } from "../components/common";
import { PlayerLink } from "../components/PlayerModal";
import type { ClubEvent } from "../data/types";

const KIND_LABEL: Record<string, string> = {
  fight_night: "Fight night", mirror_cup: "Mirror cup",
  rookie_night: "Rookie night", gurubashi: "Gurubashi",
};
const KINDS = Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[];

type SignupState = "idle" | "need_account" | "working" | "joined" | "error";

/** Organizer tool — designate referees/organizers by account. Only shown
 *  on events where the signed-in account is the organizer. */
function StaffForm({ e, onAdded }: {
  e: ClubEvent; onAdded: (s: { name: string; role: "organizer" | "referee" }) => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [role, setRole] = useState<"organizer" | "referee">("referee");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const acct = accountId.trim();
    if (!acct) return;
    setBusy(true); setNote(null);
    try {
      const token = await ensureSession(storedAccount() ?? "");
      const res = await api.addEventStaff(e.id, acct, role, token);
      if (res.status === "ok") {
        onAdded({ name: acct, role });
        setAccountId("");
        setNote("designated — they'll show by character name next load");
      } else {
        setNote(res.message);
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="staff-form">
      <span className="small dim">You're the organizer — designate staff:</span>
      <div className="row" style={{ marginTop: "0.3rem" }}>
        <input type="text" value={accountId} placeholder="account id"
          onChange={(ev) => setAccountId(ev.target.value)}
          style={{ maxWidth: "11rem" }} />
        <select value={role} onChange={(ev) => setRole(ev.target.value as "referee")}
          style={{ maxWidth: "8.5rem" }}>
          <option value="referee">referee</option>
          <option value="organizer">organizer</option>
        </select>
        <button className="btn" disabled={busy || !accountId.trim()} onClick={add}>
          {busy ? "…" : "Designate"}
        </button>
      </div>
      {note && <div className="small dim" style={{ marginTop: "0.3rem" }}>{note}</div>}
    </div>
  );
}

function EventCard({ e, source }: { e: ClubEvent; source: DataSource }) {
  const live = apiConfigured();
  const [state, setState] = useState<SignupState>(e.registered ? "joined" : "idle");
  const [account, setAccount] = useState(storedAccount() ?? "");
  const [note, setNote] = useState("");
  const [signups, setSignups] = useState(e.signups);
  const [extraStaff, setExtraStaff] = useState<NonNullable<ClubEvent["staff"]>>([]);
  const staff = [...(e.staff ?? []), ...extraStaff];

  async function signup() {
    if (!live) { setState("joined"); setSignups(signups + 1); return; } // fixture: local only
    const acct = account.trim();
    if (!acct) { setState("need_account"); return; }
    setState("working");
    try {
      storeAccount(acct);
      const token = await ensureSession(acct);
      const res = await api.signupEvent(e.id, token);
      if (res.status === "ok" || res.status === "duplicate") {
        setState("joined");
        if (res.status === "ok") setSignups(signups + 1);
      } else {
        setNote(res.message);
        setState("error");
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "signup failed");
      setState("error");
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{e.name}</h2>
        <span className="row" style={{ gap: "0.4rem" }}>
          {e.managedByMe && <span className="pill info">you organize</span>}
          <span className="pill accent">{KIND_LABEL[e.kind]}</span>
        </span>
      </div>
      <p className="dim small" style={{ margin: "0.4rem 0" }}>{e.description}</p>
      {staff.length > 0 && (
        <p className="dim small" style={{ margin: "0 0 0.3rem" }}>
          run by{" "}
          {staff.map((s, i) => (
            <span key={`${s.name}-${s.role}`}>
              {i > 0 && ", "}
              {s.playerId ? (
                <PlayerLink id={s.playerId} cls={s.wowClass} name={s.name} />
              ) : s.name}
              <span className="faint"> ({s.role})</span>
            </span>
          ))}{" "}
          — referees rule disputes and run identity check-ins
        </p>
      )}
      <div className="row between small">
        <span className="dim">
          {new Date(e.whenMs).toLocaleString(undefined, {
            weekday: "long", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit",
          })} · {e.venue}
        </span>
        <span className="num">{signups}/{e.cap}</span>
      </div>
      <div className="cap-meter" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.round((signups / e.cap) * 100))}%` }} />
      </div>
      <div className="row" style={{ marginTop: "0.6rem" }}>
        {state === "joined" ? (
          <span className="pill good">Signed up</span>
        ) : (
          <button className="btn" disabled={state === "working" || signups >= e.cap}
            onClick={signup}>
            {state === "working" ? "Signing up…" : signups >= e.cap ? "Full" : "Sign up"}
          </button>
        )}
        <span className="freshness">
          posted <Freshness atMs={e.whenMs - 5 * 24 * 3600_000} now={nowFor(source)} staleAfterMs={14 * 24 * 3600_000} />
        </span>
      </div>
      {state === "need_account" && (
        <div className="field" style={{ marginTop: "0.7rem" }}>
          <label htmlFor={`acct-${e.id}`}>Account (dev sign-in until Battle.net lands)</label>
          <div className="row">
            <input id={`acct-${e.id}`} type="text" value={account}
              onChange={(ev) => setAccount(ev.target.value)}
              placeholder="acct-id" style={{ maxWidth: "14rem" }} />
            <button className="btn primary" onClick={signup}>Confirm</button>
          </div>
        </div>
      )}
      {state === "error" && <div className="notice" style={{ marginTop: "0.6rem" }}>{note}</div>}
      {e.managedByMe && (
        <StaffForm e={e} onAdded={(s) => setExtraStaff([...extraStaff, s])} />
      )}
    </div>
  );
}

/** Create-event form — any signed-in player can organize; the creator
 *  becomes the organizer and is the only one who can designate staff. */
function CreateEvent({ onCreated }: { onCreated: (e: ClubEvent) => void }) {
  const [f, setF] = useState({
    name: "", kind: "fight_night" as string,
    date: "", time: "20:00", venue: "", cap: "32", description: "",
  });
  const [account, setAccount] = useState(storedAccount() ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = apiConfigured();

  async function submit() {
    const acct = account.trim();
    if (!acct) { setNote("sign in first — enter your account id"); return; }
    const whenMs = Date.parse(`${f.date}T${f.time}`);
    if (!f.name.trim() || !f.date || Number.isNaN(whenMs)) {
      setNote("name, date and time are required"); return;
    }
    setBusy(true); setNote(null);
    try {
      if (!live) {
        // fixture mode — local only, no server round-trip
        onCreated({
          id: `local-${Date.now()}`, name: f.name.trim(),
          kind: f.kind as ClubEvent["kind"], whenMs,
          venue: f.venue.trim() || "TBD", status: "upcoming",
          description: f.description.trim(),
          signups: 0, cap: Number(f.cap) || 32,
          managedByMe: true, staff: [{ name: acct, role: "organizer" }],
        });
        setNote(null);
        return;
      }
      storeAccount(acct);
      const token = await ensureSession(acct);
      const res = await api.createEvent({
        name: f.name.trim(), kind: f.kind, whenMs,
        venue: f.venue.trim(), cap: Number(f.cap) || 32,
        description: f.description.trim(),
      }, token);
      onCreated({
        ...res.event, kind: res.event.kind as ClubEvent["kind"],
        registered: false, managedByMe: true,
        staff: [],
      });
      setNote(null);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "create failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Host an event</h2>
      {!live && (
        <div className="notice info" style={{ marginBottom: "0.6rem" }}>
          Fixture mode — events you create exist only in this session.
        </div>
      )}
      <div className="field">
        <label>Name</label>
        <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder="Saturday Scrap" />
      </div>
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Format</label>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}
            style={{ width: "11rem" }}>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}
            style={{ width: "10rem" }} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Time</label>
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })}
            style={{ width: "7rem" }} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Cap</label>
          <input type="number" value={f.cap} min={1} max={512}
            onChange={(e) => setF({ ...f, cap: e.target.value })}
            style={{ width: "5.5rem" }} />
        </div>
      </div>
      <div className="field" style={{ marginTop: "0.8rem" }}>
        <label>Venue</label>
        <input type="text" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })}
          placeholder="Gadgetzan courtyard" />
      </div>
      <div className="field">
        <label>Description</label>
        <input type="text" value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="Standard rules, walk-up signups" />
      </div>
      <div className="row">
        <input type="text" value={account} placeholder="your account id"
          onChange={(e) => setAccount(e.target.value)} style={{ maxWidth: "12rem" }} />
        <button className="btn primary" disabled={busy} onClick={submit}>
          {busy ? "Creating…" : "Create event"}
        </button>
      </div>
      {note && <div className="notice" style={{ marginTop: "0.6rem" }}>{note}</div>}
    </div>
  );
}

export default function EventsPage() {
  const { data: EVENTS, source } = useEvents();
  const [hosting, setHosting] = useState(false);
  const [mine, setMine] = useState<ClubEvent[]>([]);
  const upcoming = [...EVENTS, ...mine].filter((e) => e.status === "upcoming")
    .sort((a, b) => a.whenMs - b.whenMs);
  return (
    <>
      <div className="page-head">
        <h1>Events</h1>
        <button className={`btn${hosting ? "" : " primary"}`}
          onClick={() => setHosting(!hosting)}>
          {hosting ? "Cancel" : "Host an event"}
        </button>
      </div>
      <p className="dim small">
        Community-run nights. Sign up with your character — brackets seed from
        rating where the organizer wants it, or not at all. Event staff can
        verify your character at check-in — that's the only place "witnessed"
        means anything; regular duels are corroborated by both clients.
        {source === "fixture" && " (fixture data — signups here are local only)"}
      </p>
      {hosting && (
        <CreateEvent onCreated={(e) => { setMine([...mine, e]); setHosting(false); }} />
      )}
      <div className="list" style={{ marginTop: "1rem" }}>
        {upcoming.map((e) => <EventCard key={e.id} e={e} source={source} />)}
      </div>
    </>
  );
}
