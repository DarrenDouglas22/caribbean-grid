// Pure transforms for the CPL ingest (KTD5). Cricsheet match JSON -> distinct
// squad players -> player/stint rows keyed on the ESPNcricinfo id, plus Tier 1
// eligibility once birthplaces resolve via Wikidata P2697. No network or DB
// here — the orchestrator (cpl.mjs) downloads, resolves, and upserts.

import { normalizeName, sanitize } from './normalize.mjs';
import { islandByQid } from '../../shared/islands.mjs';

// Extract the distinct squad from one Cricsheet match. `info.players` maps team
// name -> [player names]; `info.registry.people` maps player name -> Cricsheet
// person id. Returns [{ name, cricsheetId }].
export function extractSquad(matchJson) {
  const info = matchJson?.info ?? {};
  const registry = info.registry?.people ?? {};
  const names = new Set();
  for (const roster of Object.values(info.players ?? {})) {
    for (const name of roster) names.add(name);
  }
  return [...names].map((name) => ({
    name: sanitize(name),
    cricsheetId: registry[name] ?? null,
  }));
}

// Merge squads from many matches into one distinct player list (by cricsheetId
// when present, else by name).
export function mergeSquads(squads) {
  const byKey = new Map();
  for (const squad of squads) {
    for (const p of squad) {
      const key = p.cricsheetId ?? `name:${normalizeName(p.name)}`;
      if (!byKey.has(key)) byKey.set(key, p);
    }
  }
  return [...byKey.values()];
}

// Build player and stint rows for CPL players. `registerMap` maps a Cricsheet
// person id -> ESPNcricinfo id (from people.csv). Players with no ESPNcricinfo
// id cannot be stored (no natural key) and are returned in `skipped` for
// logging — not fatal. `sourceUrl` is stamped on every row (R11).
export function buildCplRows(players, registerMap, { sourceUrl }) {
  const playerRows = [];
  const stintRows = [];
  const skipped = [];
  for (const p of players) {
    const espnId = p.cricsheetId ? registerMap.get(p.cricsheetId) : null;
    if (!espnId) {
      skipped.push(p);
      continue;
    }
    playerRows.push({
      wikidata_qid: null,
      espncricinfo_id: espnId,
      display_name: p.name,
      normalized_name: normalizeName(p.name),
      source: sourceUrl,
    });
    stintRows.push({ espncricinfo_id: espnId, league: 'CPL', source: sourceUrl });
  }
  return { players: playerRows, stints: stintRows, skipped };
}

// Build Tier 1 eligibility for CPL players whose ESPNcricinfo id resolved to a
// Wikidata birthplace inside a pool island. `birthplaceMap` maps espncricinfo id
// -> { countryQid, adminAreaQids }. Overseas imports (non-Caribbean birthplace)
// resolve to no island and correctly get no eligibility row.
export function buildCplEligibility(birthplaceMap, { sourceUrl }) {
  const eligibility = [];
  for (const [espnId, birth] of birthplaceMap) {
    const island = resolvePoolIsland(birth);
    if (island) {
      eligibility.push({ espncricinfo_id: espnId, country: island, tier: 1, source: sourceUrl });
    }
  }
  return { eligibility };
}

function resolvePoolIsland({ countryQid, adminAreaQids }) {
  const direct = countryQid ? islandByQid(countryQid) : null;
  if (direct && direct.resolve === 'P17') return direct.code;
  for (const qid of adminAreaQids ?? []) {
    const island = islandByQid(qid);
    if (island && island.resolve === 'P131*') return island.code;
  }
  return null;
}
