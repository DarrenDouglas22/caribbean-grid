#!/usr/bin/env node
// U5 orchestrator: read active eligibility + stints, compose future puzzles, and
// report the valid-grid pool. Pure logic lives in core.mjs. Runs locally with
// the service key.
//
//   node scripts/composer/compose.mjs --validate          # count valid grids, no write
//   node scripts/composer/compose.mjs --days 14 --seed 42  # compose 14 future days
//   node scripts/composer/compose.mjs --revalidate         # recheck future puzzles
//
// Puzzles with date <= today or with existing guesses are immutable — the
// composer only fills open future dates. --revalidate re-checks every future
// puzzle against current data (compose-time validity does not survive ingest
// reruns or heritage corrections) and recomposes any that went dead.

import { loadEnv } from '../lib/env.mjs';
import { serviceClient } from '../lib/db.mjs';
import { ISLAND_CODES } from '../../shared/islands.mjs';
import { LEAGUE_CODES } from '../../shared/leagues.mjs';
import {
  buildDataView, countDistinctValidGrids, composeSchedule, findDeadPuzzles,
} from './core.mjs';

function parseArgs(argv) {
  const args = { days: 14, seed: 1, window: 7, floor: 1, validate: false, revalidate: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--validate') args.validate = true;
    else if (a === '--revalidate') args.revalidate = true;
    else if (a === '--days') args.days = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--window') args.window = Number(argv[++i]);
    else if (a === '--floor') args.floor = Number(argv[++i]);
  }
  return args;
}

async function loadDataView(db) {
  const { data: eligibility, error: e1 } = await db
    .from('eligibility').select('player_id, country, tier, active').eq('active', true);
  if (e1) throw e1;
  const { data: stints, error: e2 } = await db
    .from('stints').select('player_id, league, active').eq('active', true);
  if (e2) throw e2;
  return buildDataView({ eligibility, stints });
}

// Eastern Caribbean puzzle day (UTC-4, no DST) — KTD8.
function puzzleToday() {
  const now = new Date(Date.now() - 4 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const db = serviceClient();
  const view = await loadDataView(db);

  if (args.validate) {
    const n = countDistinctValidGrids(view, ISLAND_CODES, LEAGUE_CODES, { floor: args.floor });
    console.log(`Distinct valid grids: ${n}`);
    if (n < 30) process.exitCode = 1;
    return;
  }

  if (args.revalidate) {
    const today = puzzleToday();
    const { data: future, error } = await db
      .from('puzzles').select('id, puzzle_date, island_codes, league_codes').gt('puzzle_date', today);
    if (error) throw error;
    const dead = findDeadPuzzles(future, view, { floor: args.floor });
    console.log(`Revalidation: ${dead.length} of ${future.length} future puzzles went dead.`);
    for (const p of dead) {
      // Recompose the affected date only; past/guessed puzzles are untouched.
      const [replacement] = composeSchedule(view, ISLAND_CODES, LEAGUE_CODES, {
        days: 1, seed: hashDate(p.puzzle_date), window: 0, floor: args.floor,
      });
      if (!replacement) { console.warn(`  ! no valid grid to replace ${p.puzzle_date}`); continue; }
      const { error: upErr } = await db.from('puzzles')
        .update({ island_codes: replacement.islands, league_codes: replacement.leagues })
        .eq('id', p.id);
      if (upErr) throw upErr;
      console.log(`  recomposed ${p.puzzle_date}`);
    }
    return;
  }

  // Compose: fill open future dates starting the day after the latest existing
  // puzzle (or tomorrow), never touching today-or-past.
  const today = puzzleToday();
  const { data: latest } = await db
    .from('puzzles').select('puzzle_date').order('puzzle_date', { ascending: false }).limit(1);
  let cursor = latest && latest.length ? latest[0].puzzle_date : today;
  if (cursor < today) cursor = today;

  const schedule = composeSchedule(view, ISLAND_CODES, LEAGUE_CODES, {
    days: args.days, seed: args.seed, window: args.window, floor: args.floor,
  });
  const rows = schedule.map((grid, i) => ({
    puzzle_date: addDays(cursor, i + 1),
    island_codes: grid.islands,
    league_codes: grid.leagues,
  }));
  if (!rows.length) { console.error('No valid grids to compose — check ingest data.'); process.exit(1); }
  const { error } = await db.from('puzzles').insert(rows);
  if (error) throw error;
  console.log(`Composed ${rows.length} puzzles: ${rows[0].puzzle_date} .. ${rows[rows.length - 1].puzzle_date}`);
}

function hashDate(dateStr) {
  let h = 0;
  for (const c of dateStr) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return h >>> 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
