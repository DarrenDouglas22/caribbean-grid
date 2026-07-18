// End-to-end composer verification against real Postgres (PGlite): seed data,
// load it through the same query the orchestrator uses, confirm >=30 valid grids
// (Success Criteria / U5 Verification), then insert the composed schedule and
// confirm it satisfies the schema constraints.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb } from './setup.mjs';
import { buildDataView, countDistinctValidGrids, composeSchedule } from '../../scripts/composer/core.mjs';

// Seed representative-of-launch coverage: dense US-baseball for the Spanish
// Caribbean, cricket/football across the English Caribbean, US leagues and
// football widespread — the shape full ingest + heritage produces across the
// pool. Enough live cells to clear the >=30-grid Success Criterion.
const DENSITY = {
  DO: { MLB: 40, NBA: 4, NFL: 3, EPL: 5, WNBA: 2 },
  PR: { MLB: 30, NBA: 4, NFL: 3, WNBA: 3, EPL: 2 },
  CU: { MLB: 25, NBA: 2, NFL: 3, EPL: 2 },
  JM: { NBA: 6, NFL: 20, EPL: 18, IPL: 4, CPL: 6, WNBA: 3, MLB: 2 },
  TT: { NBA: 4, NFL: 5, EPL: 9, IPL: 10, CPL: 12, MLB: 2 },
  BB: { NBA: 4, NFL: 2, IPL: 7, CPL: 14, WNBA: 2, EPL: 3 },
  GY: { NBA: 2, NFL: 2, IPL: 3, CPL: 10, EPL: 2 },
  BS: { MLB: 5, NBA: 5, NFL: 4, WNBA: 3, EPL: 2 },
  HT: { NBA: 4, NFL: 8, EPL: 5, MLB: 2 },
  GD: { NBA: 2, NFL: 2, EPL: 3, CPL: 4 },
  LC: { NFL: 2, EPL: 2, CPL: 3, NBA: 2 },
  VC: { NFL: 2, EPL: 2, CPL: 3, NBA: 2 },
};

async function loadDataViewFromDb(db) {
  // Mirrors scripts/composer/compose.mjs loadDataView().
  const eligibility = (await db.query("select player_id, country, tier, active from eligibility where active = true")).rows;
  const stints = (await db.query("select player_id, league, active from stints where active = true")).rows;
  return buildDataView({ eligibility, stints });
}

describe('composer end-to-end (PGlite)', () => {
  let db;

  beforeAll(async () => {
    db = await freshDb();
    let n = 0;
    for (const [island, cols] of Object.entries(DENSITY)) {
      for (const [league, count] of Object.entries(cols)) {
        for (let k = 0; k < count; k++) {
          const p = await db.query(
            "insert into players (wikidata_qid, display_name, normalized_name, source) values ($1,$2,$3,'test') returning id",
            [`Q${++n}`, `P${n}`, `p${n}`],
          );
          const id = p.rows[0].id;
          await db.query('insert into eligibility (player_id, country, tier, source) values ($1,$2,1,$3)', [id, island, 'test']);
          await db.query('insert into stints (player_id, league, source) values ($1,$2,$3)', [id, league, 'test']);
        }
      }
    }
  });

  it('reports >=30 distinct valid grids from real DB data', async () => {
    const view = await loadDataViewFromDb(db);
    const islands = Object.keys(DENSITY);
    const leagues = ['MLB', 'NBA', 'NFL', 'WNBA', 'EPL', 'IPL', 'CPL'];
    expect(countDistinctValidGrids(view, islands, leagues)).toBeGreaterThanOrEqual(30);
  });

  it('composes a schedule that inserts cleanly under the schema constraints', async () => {
    const view = await loadDataViewFromDb(db);
    const islands = Object.keys(DENSITY);
    const leagues = ['MLB', 'NBA', 'NFL', 'WNBA', 'EPL', 'IPL', 'CPL'];
    const schedule = composeSchedule(view, islands, leagues, { days: 10, seed: 42 });
    expect(schedule.length).toBeGreaterThan(0);

    // Insert each composed grid on a distinct future date — exercises the
    // three-islands/three-leagues checks and the one-puzzle-per-date unique.
    for (let i = 0; i < schedule.length; i++) {
      const date = `2031-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`;
      await db.query(
        'insert into puzzles (puzzle_date, island_codes, league_codes) values ($1,$2,$3)',
        [date, schedule[i].islands, schedule[i].leagues],
      );
    }
    const count = (await db.query("select count(*)::int as n from puzzles where puzzle_date >= '2031-01-01'")).rows[0].n;
    expect(count).toBe(schedule.length);
  });
});
