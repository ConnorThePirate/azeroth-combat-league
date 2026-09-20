import { Link, NavLink, Route, Routes } from "react-router-dom";
import { PlayerModalProvider } from "./components/PlayerModal";
import { ErrorBoundary } from "./components/common";
import { NavIcon } from "./components/Icons";
import Home from "./pages/Home";
import Leaderboards from "./pages/Leaderboards";
import PlayerPage from "./pages/Player";
import MatchPage from "./pages/Match";
import RulesPage from "./pages/Rules";
import RulesBuilder from "./pages/RulesBuilder";
import EventsPage from "./pages/Events";
import AccountPage from "./pages/Account";
import StatusPage from "./pages/Status";
import MatchesPage from "./pages/Matches";
import ImportPage from "./pages/Import";
import PairPage from "./pages/Pair";
import WorldPage from "./pages/World";
import ArenaPage from "./pages/Arena";

const NAV: [string, string, string, string?][] = [
  ["Leaderboards", "/leaderboards", "trophy"],
  ["Matches", "/matches", "swords"],
  ["Rules", "/rules", "scroll"],
  ["Events", "/events", "banner"],
  ["World", "/world", "compass"],
  ["Arena", "/arena", "gate", "dev"],
  ["Account", "/account", "helm"],
  ["Status", "/status", "pulse"],
];

export default function App() {
  return (
    <PlayerModalProvider>
      <nav className="topnav" aria-label="Main">
        <NavLink to="/" className="brand">
          <span className="emblem" aria-hidden="true" />
          Azeroth <em>Combat League</em>
        </NavLink>
        {NAV.filter(([label]) => label !== "Matches").map(([label, to, icon, badge]) => (
          <NavLink key={to} to={to}>
            <NavIcon name={icon} />
            {label}
            {badge && <span className="pill warn" style={{ marginLeft: "0.35rem", fontSize: "0.62rem", padding: "0 0.4rem" }}>{badge}</span>}
          </NavLink>
        ))}
      </nav>
      <main className="page">
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/rules/builder" element={<RulesBuilder />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/world" element={<WorldPage />} />
          <Route path="/arena" element={<ArenaPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/import" element={<ImportPage />} />
          <Route path="/account/pair" element={<PairPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
        </ErrorBoundary>
      </main>
      <footer className="footer">
        <div className="inner">
          <span>Azeroth Combat League — free, volunteer-run, community-governed.</span>
          <span>
            <Link to="/status">status</Link> · ratings replay deterministically · evidence is immutable
          </span>
        </div>
      </footer>
    </PlayerModalProvider>
  );
}
