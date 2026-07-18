#!/usr/bin/env node
// U2 orchestrator: fetch each league's roster and each Tier 2 national-team from
// the Wikidata Query Service, transform (pure logic in wikidata-transform.mjs),
// and upsert. Runs locally with the service key (KTD3). Idempotent — reruns
// upsert on natural keys and never duplicate a player.
//
//   node scripts/ingest/wikidata.mjs            # all leagues + national teams
//   node scripts/ingest/wikidata.mjs MLB NBA    # a subset of leagues
//
// Deletion policy: reruns are upsert-only. Rows absent from the source are left
// in place (players, stints); eligibility corrections happen via the composer's
// revalidation and the heritage loader, not by deleting here.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from '../lib/env.mjs';
import {
  serviceClient, upsertPlayers, upsertAliases, upsertStints, upsertEligibility,
} from '../lib/db.mjs';
import { LEAGUES } from '../../shared/leagues.mjs';
import { NATIONAL_TEAMS } from './national-teams.mjs';
import {
  buildLeagueRows, buildNationalTeamRows, buildWiCricketRows,
} from './wikidata-transform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WDQS = 'https://query.wikidata.org/sparql';
const UA = 'caribbean-grid-ingest/0.1 (https://github.com/backcourt/caribbean-grid)';

function query(name) {
  return readFileSync(resolve(HERE, 'queries', name), 'utf8');
}

async function runSparql(sparql) {
  const res = await fetch(`${WDQS}?query=${encodeURIComponent(sparql)}&format=json`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`WDQS ${res.status}: ${await res.text()}`);
  const json = await res.json();
  // Flatten bindings to plain { var: value } objects for the transform.
  return json.results.bindings.map((b) => {
    const row = {};
    for (const [k, v] of Object.entries(b)) row[k] = v.value;
    return row;
  });
}

async function ingestLeague(db, league) {
  const sparql = query('league.rq').replaceAll('{{LEAGUE_QID}}', league.qid);
  const sourceUrl = `${WDQS}#${league.code}`;
  const bindings = await runSparql(sparql);
  const rows = buildLeagueRows(bindings, { leagueCode: league.code, sourceUrl });
  const map = await upsertPlayers(db, rows.players);
  await upsertAliases(db, rows.aliases, map);
  await upsertStints(db, rows.stints, map);
  await upsertEligibility(db, rows.eligibility, map);
  console.log(`  ${league.code}: ${rows.players.length} players, ${rows.eligibility.length} tier-1 eligibilities`);
  return rows.players.length;
}

async function ingestNationalTeam(db, team) {
  const sourceUrl = `${WDQS}#${team.island}-${team.sport}`;
  let eligibility;
  if (team.qid === 'Q912881') {
    const sparql = query('wi-cricket.rq').replaceAll('{{TEAM_QID}}', team.qid);
    const bindings = await runSparql(sparql);
    ({ eligibility } = buildWiCricketRows(bindings, { sourceUrl }));
  } else {
    const sparql = query('national-team.rq').replaceAll('{{TEAM_QID}}', team.qid);
    const bindings = await runSparql(sparql);
    ({ eligibility } = buildNationalTeamRows(bindings, { island: team.island, sourceUrl }));
  }
  if (eligibility.length === 0) {
    console.warn(`  ! ${team.name} (${team.qid}) returned 0 members — check the QID`);
    return 0;
  }
  // Tier 2 eligibility attaches to players that already exist from the league
  // ingest; unknown players are skipped by resolvePlayerId. Upsert a player row
  // only when we have a display name — national-team queries don't always carry
  // one, so we attach to existing rows only.
  const players = eligibility.map((e) => ({
    wikidata_qid: e.wikidata_qid, espncricinfo_id: null,
    display_name: e.wikidata_qid, normalized_name: e.wikidata_qid.toLowerCase(),
    source: sourceUrl,
  }));
  const map = await upsertPlayers(db, players);
  const written = await upsertEligibility(db, eligibility, map);
  console.log(`  ${team.name}: ${written} tier-2 eligibilities`);
  return written;
}

async function main() {
  loadEnv();
  const db = serviceClient();
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const leagues = LEAGUES.filter(
    (l) => l.source === 'wikidata' && (only.length === 0 || only.includes(l.code)),
  );

  console.log('Wikidata ingest — leagues:');
  for (const league of leagues) await ingestLeague(db, league);

  if (only.length === 0) {
    console.log('Wikidata ingest — Tier 2 national teams:');
    for (const team of NATIONAL_TEAMS) await ingestNationalTeam(db, team);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
