// Server-side database access for the ingest and composer scripts. Uses the
// Supabase SERVICE key (bypasses RLS) — loaded from the environment only, never
// committed (KTD3). This module is the single write path; the transforms decide
// what to write, this decides how.

import { createClient } from '@supabase/supabase-js';

export function serviceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env before running ingest/compose.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// Upsert players on their natural keys and return a map from natural key to
// player id. Rows carry wikidata_qid and/or espncricinfo_id; at least one is
// required by the schema. Upsert conflict target is wikidata_qid when present,
// else espncricinfo_id — the DB uniqueness on both prevents duplicates.
export async function upsertPlayers(db, rows) {
  const byQid = rows.filter((r) => r.wikidata_qid);
  const byEspn = rows.filter((r) => !r.wikidata_qid && r.espncricinfo_id);

  if (byQid.length) {
    const { error } = await db.from('players').upsert(byQid, { onConflict: 'wikidata_qid' });
    if (error) throw error;
  }
  if (byEspn.length) {
    const { error } = await db.from('players').upsert(byEspn, { onConflict: 'espncricinfo_id' });
    if (error) throw error;
  }

  // Read back the ids for every natural key we just wrote.
  const qids = rows.map((r) => r.wikidata_qid).filter(Boolean);
  const espns = rows.map((r) => r.espncricinfo_id).filter(Boolean);
  const map = { byQid: new Map(), byEspn: new Map() };
  if (qids.length) {
    const { data, error } = await db.from('players').select('id, wikidata_qid').in('wikidata_qid', qids);
    if (error) throw error;
    for (const p of data) map.byQid.set(p.wikidata_qid, p.id);
  }
  if (espns.length) {
    const { data, error } = await db.from('players').select('id, espncricinfo_id').in('espncricinfo_id', espns);
    if (error) throw error;
    for (const p of data) map.byEspn.set(p.espncricinfo_id, p.id);
  }
  return map;
}

// Resolve a transform row's natural key to a player id via the map from
// upsertPlayers.
export function resolvePlayerId(map, row) {
  if (row.wikidata_qid && map.byQid.has(row.wikidata_qid)) return map.byQid.get(row.wikidata_qid);
  if (row.espncricinfo_id && map.byEspn.has(row.espncricinfo_id)) return map.byEspn.get(row.espncricinfo_id);
  return null;
}

async function upsertResolved(db, table, rows, map, project, onConflict) {
  const resolved = [];
  for (const row of rows) {
    const player_id = resolvePlayerId(map, row);
    if (player_id == null) continue;
    resolved.push(project(row, player_id));
  }
  if (!resolved.length) return 0;
  const { error } = await db.from(table).upsert(resolved, { onConflict });
  if (error) throw error;
  return resolved.length;
}

export const upsertAliases = (db, rows, map) =>
  upsertResolved(db, 'aliases', rows, map,
    (r, player_id) => ({ player_id, alias: r.alias, normalized_name: r.normalized_name, source: r.source }),
    'player_id,normalized_name');

export const upsertStints = (db, rows, map) =>
  upsertResolved(db, 'stints', rows, map,
    (r, player_id) => ({ player_id, league: r.league, source: r.source, active: true }),
    'player_id,league');

export const upsertEligibility = (db, rows, map) =>
  upsertResolved(db, 'eligibility', rows, map,
    (r, player_id) => ({
      player_id, country: r.country, tier: r.tier,
      justification: r.justification ?? null, citation: r.citation ?? null,
      source: r.source, active: true,
    }),
    'player_id,country,tier');
