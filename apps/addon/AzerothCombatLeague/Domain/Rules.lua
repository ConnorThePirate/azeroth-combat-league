--[[
  Domain/Rules.lua — ruleset data and evaluation (docs/08).

  Templates: standard, pure_duel, fieldcraft, anything_goes, custom.
  Rules: { ruleId, category, action=allow|deny|limit, itemIds, effectIds,
           phase, countLimit, sourceFilter, detectorId, minimumEvidence,
           unavailableBehavior, sanction }
  Precedence: item exception > category > template default.
  Unknown detector coverage is surfaced, never treated as a clean pass.
]]
local _, ACL = ...

local Rules = {}

Rules.PHASES = { preparation = true, ready = true, active = true, between_games = true, series_end = true }

-- Template rule sets (data-only; no executable user content).
Rules.TEMPLATES = {
  standard = {
    label = "Ranked Standard",
    description = "Class abilities, self buffs, bandages. No active-game consumables or engineering.",
    ratedEligible = true,
    rules = {
      { ruleId = "std.consumables", category = "consumable", action = "deny", phase = "active",
        detectorId = "combat_log.use", sanction = "game_loss" },
      { ruleId = "std.engineering", category = "engineering", action = "deny", phase = "active",
        detectorId = "combat_log.use", sanction = "game_loss" },
      { ruleId = "std.worldbuffs", category = "world_buff", action = "deny", phase = "ready",
        detectorId = "aura.inspect", sanction = "game_loss" },
      { ruleId = "std.outside", category = "outside_assistance", action = "deny", phase = "active",
        detectorId = "combat_log.source", sanction = "void_game" },
    },
  },
  pure_duel = {
    label = "Pure Duel",
    description = "Class abilities only — no consumables, bandages, or gear actives.",
    ratedEligible = false,
    rules = {
      { ruleId = "pure.all_items", category = "item_use", action = "deny", phase = "active",
        detectorId = "combat_log.use", sanction = "game_loss" },
    },
  },
  fieldcraft = {
    label = "Fieldcraft",
    description = "Declared consumables and engineering allowed.",
    ratedEligible = false,
    rules = {},
  },
  anything_goes = {
    label = "Anything Goes",
    description = "Everything legal in normal play; no outside interference.",
    ratedEligible = false,
    rules = {
      { ruleId = "ag.outside", category = "outside_assistance", action = "deny", phase = "active",
        detectorId = "combat_log.source", sanction = "void_game" },
    },
  },
  custom = {
    label = "Custom",
    description = "Private rules — never Standard-rated.",
    ratedEligible = false,
    rules = {},
  },
}

--- Evaluate a normalized fact against a rule list for a phase.
--- Returns a violation candidate table or nil.
function Rules.checkFact(ruleset, fact, phase)
  if not ruleset or not ruleset.rules then return nil end
  for _, rule in ipairs(ruleset.rules) do
    if rule.phase == phase and Rules.factMatches(rule, fact) then
      if rule.action == "deny" then
        return {
          ruleId = rule.ruleId, fact = fact, phase = phase,
          sanction = rule.sanction or "game_loss",
        }
      elseif rule.action == "limit" and fact.count and rule.countLimit
          and fact.count > rule.countLimit then
        return {
          ruleId = rule.ruleId, fact = fact, phase = phase,
          sanction = rule.sanction or "game_loss",
        }
      end
    end
  end
  return nil
end

--- Does a normalized fact hit a rule's item/effect/category scope?
function Rules.factMatches(rule, fact)
  if fact.category and rule.category == fact.category then
    -- item exception beats category (docs/08 precedence)
    if rule.itemIds and fact.itemId then
      for _, id in ipairs(rule.itemIds) do
        if id == fact.itemId then return false end -- explicit exception
      end
    end
    if rule.effectIds and fact.effectId then
      for _, id in ipairs(rule.effectIds) do
        if id == fact.effectId then return false end
      end
    end
    return true
  end
  if rule.itemIds and fact.itemId then
    for _, id in ipairs(rule.itemIds) do
      if id == fact.itemId then return true end
    end
  end
  if rule.effectIds and fact.effectId then
    for _, id in ipairs(rule.effectIds) do
      if id == fact.effectId then return true end
    end
  end
  return false
end

--- Coverage map: ruleId -> detector status for this context.
--- Unknown detectors report "unavailable", never "observable".
function Rules.coverage(ruleset, phase, detectorStatus)
  local out = {}
  for _, rule in ipairs((ruleset and ruleset.rules) or {}) do
    if rule.phase == phase then
      local st = detectorStatus and detectorStatus[rule.detectorId] or "unavailable"
      out[#out + 1] = { ruleId = rule.ruleId, status = st }
    end
  end
  return out
end

--- Whether this ruleset can feed the Standard ladder.
function Rules.isRatedEligible(ruleset)
  return ruleset ~= nil and ruleset.ratedEligible == true
end

-- ---------------------------------------------------------------------------
-- Published (community) rulesets — delivered via WFU1 addon-update bundles
-- (docs/06, 08). Initially there is exactly one rated ruleset ("Ranked
-- Standard"); the community can publish additional casual or — after a
-- deliberate standard-approval step — rated variants. Published rulesets are
-- DATA ONLY: they are validated field-by-field and rebuilt into clean tables,
-- never executed.

local RULE_ACTIONS = { allow = true, deny = true, limit = true }
local RULE_SANCTIONS = { game_loss = true, void_game = true, ["none"] = true }
local MAX_RULES = 64
local MAX_IDS = 32
local TEMPLATE_ORDER = { "standard", "pure_duel", "fieldcraft", "anything_goes", "custom" }

local function isStr(v, max)
  return type(v) == "string" and #v <= (max or 64)
end
local function isNat(v)
  return type(v) == "number" and v >= 0 and math.floor(v) == v
end
local function idList(v)
  if v == nil then return nil end
  if type(v) ~= "table" or #v > MAX_IDS then return false end
  local out = {}
  for i, x in ipairs(v) do
    if not isNat(x) then return false end
    out[i] = x
  end
  return out
end

--- Validate + normalize one published ruleset into a clean data table.
--- Returns the normalized ruleset or nil — invalid entries are dropped by
--- the importer, never partially applied.
function Rules.validatePublished(rs)
  if type(rs) ~= "table" then return nil end
  if not (ACL.Uuid.isValid(rs.rulesetId) and ACL.Uuid.isValid(rs.versionId)
      and isNat(rs.version) and rs.version >= 1
      and isStr(rs.name, 64) and isStr(rs.description or "", 512)
      and type(rs.standard) == "boolean" and type(rs.rules) == "table"
      and #rs.rules <= MAX_RULES) then
    return nil
  end
  local rules = {}
  for i, r in ipairs(rs.rules) do
    if type(r) ~= "table" then return nil end
    if not (isStr(r.ruleId, 96) and isStr(r.category, 48)
        and RULE_ACTIONS[r.action] and Rules.PHASES[r.phase]
        and RULE_SANCTIONS[r.sanction or "game_loss"]) then
      return nil
    end
    local items = idList(r.itemIds)
    local effects = idList(r.effectIds)
    if items == false or effects == false then return nil end
    if r.countLimit ~= nil and not isNat(r.countLimit) then return nil end
    if r.detectorId ~= nil and not isStr(r.detectorId, 64) then return nil end
    rules[i] = {
      ruleId = r.ruleId, category = r.category, action = r.action,
      phase = r.phase, itemIds = items, effectIds = effects,
      countLimit = r.countLimit, detectorId = r.detectorId,
      sanction = r.sanction or "game_loss",
    }
  end
  return {
    rulesetId = rs.rulesetId, versionId = rs.versionId,
    version = rs.version, name = rs.name,
    description = rs.description or "",
    ratedEligible = rs.standard,   -- only publisher-flagged standard is rated
    rules = rules,
  }
end

--- All offerable rulesets: built-in templates, then published community
--- rulesets from the last imported update bundle. Returns list of
--- { key, label, description, ratedEligible, rules, versionId, source }.
function Rules.available()
  local out = {}
  -- fixed order: Standard first, casual presets after, custom last
  for _, key in ipairs(TEMPLATE_ORDER) do
    local t = Rules.TEMPLATES[key]
    if t then
      out[#out + 1] = {
        key = key, label = t.label, description = t.description,
        ratedEligible = t.ratedEligible, rules = t.rules,
        versionId = nil, source = "builtin",
      }
    end
  end
  -- published rulesets come after builtins; key is the version id
  local pub = ACL.db and ACL.db.publishedRulesets or nil
  if pub then
    local list = {}
    for versionId, rs in pairs(pub) do list[#list + 1] = rs end
    table.sort(list, function(a, b)
      if (a.ratedEligible and 1 or 0) ~= (b.ratedEligible and 1 or 0) then
        return a.ratedEligible and true or false -- rated first
      end
      return a.name < b.name
    end)
    for _, rs in ipairs(list) do
      out[#out + 1] = {
        key = "pub:" .. rs.versionId, label = rs.name,
        description = rs.description, ratedEligible = rs.ratedEligible,
        rules = rs.rules, versionId = rs.versionId, source = "published",
      }
    end
  end
  return out
end

--- Resolve a selection key ("standard" or "pub:<versionId>") to an entry.
--- Falls back to the standard template when the key no longer exists (e.g.
--- a ruleset was unpublished between sessions).
function Rules.resolve(key)
  for _, e in ipairs(Rules.available()) do
    if e.key == key then return e end
  end
  local t = Rules.TEMPLATES.standard
  return { key = "standard", label = t.label, description = t.description,
    ratedEligible = t.ratedEligible, rules = t.rules, source = "builtin" }
end

ACL.Rules = Rules
