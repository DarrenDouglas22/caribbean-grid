// Pure parse + validation + row-building for the heritage (Tier 3) seed. The
// loader matches by natural key only — name-only rows are rejected, not joined
// (name-match is a curator disambiguation step, not a load-time join). Every
// Tier 3 row upserts a stint alongside eligibility, because heritage players are
// usually absent from the birthplace-keyed Wikidata ingest and without the stint
// the target cell stays dead.

import { normalizeName, sanitize } from './normalize.mjs';
import { islandByCode } from '../../shared/islands.mjs';
import { leagueByCode } from '../../shared/leagues.mjs';

// Minimal RFC-4180-ish CSV parser: handles quoted fields containing commas and
// escaped double-quotes. Returns an array of string arrays (rows of fields).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const HEADERS = ['qid', 'espncricinfo_id', 'name', 'island', 'league', 'justification', 'source_url'];

// Parse and validate heritage CSV text. Returns { rows, errors } where rows are
// validated objects and errors describe rejected rows (line number + reason).
export function parseHeritageCsv(text) {
  const raw = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  const rows = [];
  const errors = [];
  if (raw.length === 0) return { rows, errors };

  const header = raw[0].map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(HEADERS.map((h) => [h, header.indexOf(h)]));

  for (let r = 1; r < raw.length; r++) {
    const line = r + 1;
    const get = (h) => (idx[h] >= 0 ? sanitize(raw[r][idx[h]] ?? '') : '');
    const entry = {
      qid: get('qid'),
      espncricinfo_id: get('espncricinfo_id'),
      name: get('name'),
      island: get('island').toUpperCase(),
      league: get('league').toUpperCase(),
      justification: get('justification'),
      source_url: get('source_url'),
    };

    if (!entry.qid && !entry.espncricinfo_id) {
      errors.push({ line, reason: 'name-only row rejected — needs a QID or ESPNcricinfo id' });
      continue;
    }
    if (!entry.source_url) { errors.push({ line, reason: 'missing source_url' }); continue; }
    if (!entry.justification) { errors.push({ line, reason: 'missing justification' }); continue; }
    if (!entry.league) { errors.push({ line, reason: 'missing league' }); continue; }
    if (!islandByCode(entry.island)) { errors.push({ line, reason: `unknown island "${entry.island}"` }); continue; }
    if (!leagueByCode(entry.league)) { errors.push({ line, reason: `unknown league "${entry.league}"` }); continue; }

    rows.push(entry);
  }
  return { rows, errors };
}

// Build player / eligibility(tier3) / stint rows from validated heritage rows.
// The `source` is the citation URL (R11). A player absent from the DB is created
// here from its natural key; one already present attaches by upsert.
export function buildHeritageRows(rows) {
  const players = [];
  const eligibility = [];
  const stints = [];
  for (const e of rows) {
    const natural = e.qid
      ? { wikidata_qid: e.qid, espncricinfo_id: null }
      : { wikidata_qid: null, espncricinfo_id: e.espncricinfo_id };
    players.push({
      ...natural,
      display_name: e.name || natural.wikidata_qid || natural.espncricinfo_id,
      normalized_name: normalizeName(e.name),
      source: e.source_url,
    });
    eligibility.push({
      ...natural,
      country: e.island,
      tier: 3,
      justification: e.justification,
      citation: e.source_url,
      source: e.source_url,
    });
    stints.push({ ...natural, league: e.league, source: e.source_url });
  }
  return { players, eligibility, stints };
}
