// Pure transforms: SPARQL JSON bindings -> the row shapes the upsert layer
// writes. No network, no database — this is the tested core of U2. The
// orchestrator (wikidata.mjs) fetches and upserts; everything decision-bearing
// lives here.

import { normalizeName, sanitize } from './normalize.mjs';
import { islandByQid } from '../../shared/islands.mjs';

// A SPARQL "uri" binding value looks like http://www.wikidata.org/entity/Q42.
export function qidFromUri(uri) {
  if (!uri) return null;
  const m = /Q\d+$/.exec(uri);
  return m ? m[0] : null;
}

// Resolve the pool island for a birthplace. Sovereign islands match on the
// direct P17 country; non-sovereign territories (PR, USVI, ...) match on a
// P131* administrative area, because their P17 is the parent nation. A binding
// row carries at most one countryDirect and one adminArea; the orchestrator
// unions the adminArea set per player across rows before calling this.
export function resolveIsland({ countryQid, adminAreaQids }) {
  const direct = countryQid ? islandByQid(countryQid) : null;
  if (direct && direct.resolve === 'P17') return direct.code;
  for (const qid of adminAreaQids ?? []) {
    const island = islandByQid(qid);
    if (island && island.resolve === 'P131*') return island.code;
  }
  return null;
}

// Collapse the row-per-(player,adminArea) SPARQL result into one record per
// player, unioning admin areas and alt labels. Input: array of raw binding
// objects (already flattened to plain values). Output: Map keyed by QID.
export function foldLeagueBindings(bindings) {
  const byQid = new Map();
  for (const b of bindings) {
    const qid = qidFromUri(b.player);
    if (!qid) continue;
    let rec = byQid.get(qid);
    if (!rec) {
      rec = {
        qid,
        displayName: sanitize(b.playerLabel) || qid,
        aliases: new Set(),
        countryQid: qidFromUri(b.countryDirect),
        adminAreaQids: new Set(),
      };
      byQid.set(qid, rec);
    }
    if (b.countryDirect && !rec.countryQid) rec.countryQid = qidFromUri(b.countryDirect);
    const admin = qidFromUri(b.adminArea);
    if (admin) rec.adminAreaQids.add(admin);
    if (b.altLabel) {
      const alt = sanitize(b.altLabel);
      if (alt && alt.toLowerCase() !== rec.displayName.toLowerCase()) rec.aliases.add(alt);
    }
  }
  return byQid;
}

// Produce the player / stint / eligibility(tier1) / alias rows for one league.
// `leagueCode` labels the stint; `sourceUrl` is stamped on every row (R11).
export function buildLeagueRows(bindings, { leagueCode, sourceUrl }) {
  const folded = foldLeagueBindings(bindings);
  const players = [];
  const aliases = [];
  const stints = [];
  const eligibility = [];

  for (const rec of folded.values()) {
    players.push({
      wikidata_qid: rec.qid,
      espncricinfo_id: null,
      display_name: rec.displayName,
      normalized_name: normalizeName(rec.displayName),
      source: sourceUrl,
    });
    for (const alt of rec.aliases) {
      aliases.push({
        wikidata_qid: rec.qid,
        alias: alt,
        normalized_name: normalizeName(alt),
        source: sourceUrl,
      });
    }
    stints.push({ wikidata_qid: rec.qid, league: leagueCode, source: sourceUrl });

    const island = resolveIsland({
      countryQid: rec.countryQid,
      adminAreaQids: rec.adminAreaQids,
    });
    if (island) {
      eligibility.push({
        wikidata_qid: rec.qid,
        country: island,
        tier: 1,
        source: sourceUrl,
      });
    }
  }
  return { players, aliases, stints, eligibility };
}

// Tier 2 rows from a football national-team membership query. Each member gets
// Tier 2 eligibility for the team's island directly — that is the point of
// Tier 2: it catches heritage internationals the birthplace filter misses.
export function buildNationalTeamRows(bindings, { island, sourceUrl }) {
  const eligibility = [];
  const seen = new Set();
  for (const b of bindings) {
    const qid = qidFromUri(b.player);
    if (!qid || seen.has(qid)) continue;
    seen.add(qid);
    eligibility.push({ wikidata_qid: qid, country: island, tier: 2, source: sourceUrl });
  }
  return { eligibility };
}

// Tier 2 rows from West Indies cricket caps. WI is multinational, so each capped
// player is attributed to their home pool island via birthplace (the same
// two-path resolution the league query uses). Caps without a pool birthplace
// are skipped — they cannot be island-attributed.
export function buildWiCricketRows(bindings, { sourceUrl }) {
  const byQid = new Map();
  for (const b of bindings) {
    const qid = qidFromUri(b.player);
    if (!qid) continue;
    let rec = byQid.get(qid);
    if (!rec) {
      rec = { qid, countryQid: qidFromUri(b.countryDirect), adminAreaQids: new Set() };
      byQid.set(qid, rec);
    }
    if (b.countryDirect && !rec.countryQid) rec.countryQid = qidFromUri(b.countryDirect);
    const admin = qidFromUri(b.adminArea);
    if (admin) rec.adminAreaQids.add(admin);
  }
  const eligibility = [];
  for (const rec of byQid.values()) {
    const island = resolveIsland({ countryQid: rec.countryQid, adminAreaQids: rec.adminAreaQids });
    if (island) {
      eligibility.push({ wikidata_qid: rec.qid, country: island, tier: 2, source: sourceUrl });
    }
  }
  return { eligibility };
}
