// Verify the serverless API handlers against real Postgres (PGlite), the same
// way the RPCs are verified — so the Neon + serverless backend has the same
// behavioral guarantees the Supabase path had (AE1/AE2/AE4, throttle plumbing).
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, seedPlayer, seedPuzzle } from './setup.mjs';
import * as h from '../../api/_handlers.mjs';

const dev = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe('serverless handlers (PGlite)', () => {
  let db; let felix; let heritage;

  beforeAll(async () => {
    db = await freshDb();
    await seedPuzzle(db, { islands: ['DO', 'HT', 'JM'], leagues: ['MLB', 'NBA', 'EPL'] });
    felix = await seedPlayer(db, {
      qid: 'QF', name: 'Félix Sánchez', normalized: 'felix sanchez',
      eligibility: [{ country: 'DO', tier: 1 }], stints: ['MLB'],
    });
    heritage = await seedPlayer(db, {
      qid: 'QH', name: 'Heritage Star', normalized: 'heritage star',
      eligibility: [{ country: 'HT', tier: 3, justification: 'father born in Haiti', citation: 'https://x' }],
      stints: ['MLB'],
    });
  });

  it('getPuzzle returns today only', async () => {
    const p = await h.getPuzzle(db);
    expect(p.island_codes).toEqual(['DO', 'HT', 'JM']);
  });

  it('AE2: searchPlayers folds accents', async () => {
    const rows = await h.searchPlayers(db, 'felix sanchez');
    expect(rows.map((r) => r.display_name)).toContain('Félix Sánchez');
    expect(await h.searchPlayers(db, '')).toEqual([]);
  });

  it('AE1: checkGuess returns tier 3 + justification for a heritage cell', async () => {
    const res = await h.checkGuess(db, { deviceId: dev(1), cell: 'HT|MLB', playerId: heritage });
    expect(res.correct).toBe(true);
    expect(res.tier).toBe(3);
    expect(res.justification).toMatch(/Haiti/);
  });

  it('checkGuess with a forwarded IP still succeeds (throttle plumbing)', async () => {
    const res = await h.checkGuess(db, { deviceId: dev(2), cell: 'DO|MLB', playerId: felix, ip: '203.0.113.7' });
    expect(res.correct).toBe(true);
  });

  it('checkGuess rejects a cell not in today\'s puzzle', async () => {
    const res = await h.checkGuess(db, { deviceId: dev(3), cell: 'BB|IPL', playerId: felix });
    expect(res.rejected).toBe(true);
    expect(res.reason).toBe('invalid_cell');
  });

  it('recordEvent inserts and dedupes', async () => {
    const today = (await db.query('select puzzle_today() as d')).rows[0].d;
    await h.recordEvent(db, { deviceId: dev(4), event: 'open', puzzleDate: today });
    await h.recordEvent(db, { deviceId: dev(4), event: 'open', puzzleDate: today });
    const n = (await db.query("select count(*)::int as n from events where event='open'")).rows[0].n;
    expect(n).toBe(1);
  });
});
