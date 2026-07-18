#!/usr/bin/env node
// One-command production data bring-up against a hosted Postgres (Neon). Chains
// the deploy steps so going live is a single command once DATABASE_URL is set:
//
//   DATABASE_URL=postgres://... npm run deploy:bootstrap
//
// Steps: apply migrations -> ingest Wikidata (players + Tier 1/2 eligibility) ->
// load the heritage seed -> report the valid-grid count -> compose 14 days.
// CPL ingest is skipped unless the Cricsheet cache is present (it needs a manual
// download; see the runbook) — the grid is fully playable without it.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from '../lib/env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function run(script, args = []) {
  return new Promise((res, rej) => {
    const child = spawn('node', [resolve(ROOT, script), ...args], { stdio: 'inherit', env: process.env });
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${script} exited ${code}`))));
  });
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL (your Neon connection string) first.');
    process.exit(1);
  }

  console.log('\n== 1/5 apply migrations ==');
  await run('scripts/deploy/migrate.mjs');

  console.log('\n== 2/5 ingest Wikidata ==');
  await run('scripts/ingest/wikidata.mjs');

  const cplReady = existsSync(resolve(ROOT, 'scripts/ingest/.cache/cpl')) &&
    existsSync(resolve(ROOT, 'scripts/ingest/.cache/people.csv'));
  if (cplReady) {
    console.log('\n== CPL ingest (Cricsheet cache found) ==');
    await run('scripts/ingest/cpl.mjs');
  } else {
    console.log('\n== CPL ingest skipped (no Cricsheet cache — see runbook) ==');
  }

  console.log('\n== 3/5 load heritage seed ==');
  await run('scripts/ingest/heritage.mjs');

  console.log('\n== 4/5 validate the grid pool ==');
  await run('scripts/composer/compose.mjs', ['--validate']);

  console.log('\n== 5/5 compose 14 days of puzzles ==');
  await run('scripts/composer/compose.mjs', ['--days', '14', '--seed', '42']);

  console.log('\nDone. The database is seeded and puzzles are scheduled.');
  console.log('Deploy the frontend + functions to Vercel with DATABASE_URL set, and it is live.');
}

main().catch((err) => {
  console.error('\nBootstrap failed:', err.message);
  process.exit(1);
});
