--[[ Locale/enUS.lua — display strings. Names are display-only; identity is UUIDs. ]]
local _, ACL = ...

ACL.L = {
  addonTitle = "Azeroth Combat League",
  tagline = "Community fight club — duel anyone, anywhere.",

  -- tabs
  tabChallenge = "Challenge",
  tabMatches = "Matches",
  tabRules = "Rules",
  tabHub = "Hub",
  tabEvents = "Events",
  tabSync = "Sync",
  tabSettings = "Settings",
  tabLab = "Test Lab",

  -- challenge
  challengeTarget = "Challenge target",
  challengeNoTarget = "Target a player first.",
  preset = "Rules",
  bestOf = "Best of",
  sendChallenge = "Send challenge",
  challengeSent = "Challenge sent — waiting for them to accept.",
  challengeIncoming = "%s challenges you",
  accept = "Accept",
  decline = "Decline",

  -- result card
  resultWin = "Victory!",
  resultLoss = "Defeat",
  resultDraw = "Draw",
  resultUnknown = "Outcome unclear",
  confirm = "Confirm",
  reportProblem = "Report problem",
  rematch = "Rematch",
  coverageLabel = "Monitoring: %s",

  -- sync
  syncTitle = "Sync",
  syncModeCompanion = "Companion uploads automatically after you save & reload.",
  syncModeLocal = "Local recording only — no automatic upload is set up.",
  saveReload = "Save results & reload",
  copyResults = "Copy results (recovery)",
  importUpdate = "Import update",
  unsyncedCount = "%d report(s) not yet acknowledged",
  unsyncedExplain = "Not yet acknowledged here — the website may already have them.",
  lastSnapshot = "Last update imported: %s",
  neverImported = "No website update imported yet.",

  -- sync badge
  badgePendingMemory = "ACL · %d unsaved",
  badgePendingSaved = "ACL · %d awaiting upload",
  badgeTipTitle = "Results waiting",
  badgeTipUnsynced = "%d in memory only — lost if the game crashes. Click to save & reload; the companion uploads right after.",
  badgeTipSaved = "%d saved on this computer — the companion uploads shortly. Click to flush anything new.",
  badgeTipDismiss = "Right-click to hide until the next result.",
  badgeCantSync = "ACL: can't save right now (%s) — results stay queued.",
  badgeNudge = "ACL: %d results only in memory — a crash would lose them. Click the badge to save & reload.",

  -- states (docs/27 status language)
  stateRecorded = "Recorded locally",
  stateSaved = "Saved for upload",
  stateReceived = "Received by website",
  stateAwaiting = "Awaiting opponent",
  stateReview = "Under review",
  stateRated = "Rated",

  -- test lab
  labIntro = "Live-client probe results. Unknown means not yet measured.",
  labExport = "Export lab bundle",
  labRunProbes = "Run probes",

  -- generic
  close = "Close",
  unknown = "Unknown",
}
