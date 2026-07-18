#!/usr/bin/env node
// U3 orchestrator (KTD5): CPL squads from Cricsheet, joined to Wikidata by
// ESPNcricinfo id (P2697) for birthplace. Runs locally with the service key.
//
//   node scripts/ingest/cpl.mjs
//
// Expects the extracted Cricsheet CPL data and people register:
//   scripts/ingest/.cache/cpl/*.json   (unzip of cpl_json.zip)
//   scripts/ingest/.cache/people.csv   (Cricsheet register)
// Both are downloaded/extracted by the U10 runbook; this script does not fetch
// the large archives itself so a rerun is fast and offline-friendly.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from '../lib/env.mjs';
import { serviceClient, upsertPlayers, upsertStints, upsertEligibility } from '../lib/db.mjs';
import { extractSquad, mergeSquads, buildCplRows, buildCplEligibility } from './cpl-transform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(HERE, '.cache');
const WDQS = 'https://query.wikidata.org/sparql';
const UA = 'caribbean-grid-ingest/0.1 (https://github.com/backcourt/caribbean-grid)';
const SOURCE = 'https://cricsheet.org/downloads/cpl_json.zip';

// people.csv columns include `identifier` (the match-registry person id) and
// `key_cricinfo` (the ESPNcricinfo id). Build identifier -> ESPNcricinfo id.
function loadRegister() {
  const path = resolve(CACHE, 'people.csv');
  if (!existsSync(path)) throw new Error(`Missing ${path} — download the Cricsheet people register first.`);
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  const header = lines[0].split(',');
  const idIdx = header.indexOf('identifier');
  const cricinfoIdx = header.indexOf('key_cricinfo');
  const map = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const id = cols[idIdx];
    const espn = cols[cricinfoIdx];
    if (id && espn) map.set(id, espn);
  }
  return map;
}

function loadMatches() {
  const dir = resolve(CACHE, 'cpl');
  if (!existsSync(dir)) throw new Error(`Missing ${dir} — extract cpl_json.zip there first.`);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')));
}

async function resolveBirthplaces(espnIds) {
  // Batch the ESPNcricinfo ids into a VALUES clause and resolve birthplaces.
  const birthplaceMap = new Map();
  const batchSize = 200;
  for (let i = 0; i < espnIds.length; i += batchSize) {
    const batch = espnIds.slice(i, i + batchSize);
    const values = batch.map((id) => `"${id}"`).join(' ');
    const sparql = `SELECT ?espn ?countryDirect ?adminArea WHERE {
      VALUES ?espn { ${values} }
      ?player wdt:P2697 ?espn ; wdt:P19 ?pob .
      OPTIONAL { ?pob wdt:P17 ?countryDirect . }
      OPTIONAL { ?pob wdt:P131* ?adminArea . }
    }`;
    const res = await fetch(`${WDQS}?query=${encodeURIComponent(sparql)}&format=json`, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`WDQS ${res.status}: ${await res.text()}`);
    const json = await res.json();
    for (const b of json.results.bindings) {
      const espn = b.espn.value;
      let rec = birthplaceMap.get(espn);
      if (!rec) {
        rec = { countryQid: null, adminAreaQids: new Set() };
        birthplaceMap.set(espn, rec);
      }
      if (b.countryDirect) rec.countryQid = /Q\d+$/.exec(b.countryDirect.value)?.[0] ?? rec.countryQid;
      if (b.adminArea) {
        const q = /Q\d+$/.exec(b.adminArea.value)?.[0];
        if (q) rec.adminAreaQids.add(q);
      }
    }
  }
  return birthplaceMap;
}

async function main() {
  loadEnv();
  const db = serviceClient();
  const register = loadRegister();
  const matches = loadMatches();

  const squad = mergeSquads(matches.map(extractSquad));
  const { players, stints, skipped } = buildCplRows(squad, register, { sourceUrl: SOURCE });
  console.log(`CPL: ${players.length} players resolved, ${skipped.length} unresolved (no ESPNcricinfo id)`);
  for (const p of skipped) console.warn(`  ! no register match: ${p.name}`);

  const map = await upsertPlayers(db, players);
  await upsertStints(db, stints, map);

  const espnIds = players.map((p) => p.espncricinfo_id);
  const birthplaces = await resolveBirthplaces(espnIds);
  const { eligibility } = buildCplEligibility(birthplaces, { sourceUrl: SOURCE });
  const eligMap = await upsertPlayers(db, players); // ensure ids present
  const written = await upsertEligibility(db, eligibility, eligMap);
  console.log(`CPL: ${written} island eligibilities from ${birthplaces.size} resolved birthplaces`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
