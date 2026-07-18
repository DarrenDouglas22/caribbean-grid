#!/usr/bin/env node
// U4 orchestrator: load the curated Tier 3 heritage seed into the database.
// Runs locally with the service key.
//
//   node scripts/ingest/heritage.mjs [path/to/heritage.csv]
//
// Validation errors are reported per line and are fatal for that row only — a
// bad row never silently loads. Curation is owner-gated: the owner verifies each
// entry before it ships (see data/README.md).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from '../lib/env.mjs';
import { serviceClient, upsertPlayers, upsertStints, upsertEligibility } from '../lib/db.mjs';
import { parseHeritageCsv, buildHeritageRows } from './heritage-loader.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV = resolve(HERE, '../../data/heritage.csv');

async function main() {
  loadEnv();
  const csvPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_CSV;
  const text = readFileSync(csvPath, 'utf8');
  const { rows, errors } = parseHeritageCsv(text);

  for (const e of errors) console.warn(`  ! line ${e.line}: ${e.reason}`);
  if (rows.length === 0) {
    console.error('No valid heritage rows to load.');
    process.exit(errors.length ? 1 : 0);
  }

  const db = serviceClient();
  const { players, eligibility, stints } = buildHeritageRows(rows);
  const map = await upsertPlayers(db, players);
  await upsertStints(db, stints, map);
  const written = await upsertEligibility(db, eligibility, map);
  console.log(`Heritage: ${written} Tier 3 eligibilities loaded, ${errors.length} rows rejected.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
