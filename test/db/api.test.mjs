// U6 API verification against real SQL in PGlite: RPC behavior and RLS. These
// cover the Acceptance Examples and the U6 test scenarios at the database level
// (the live-Supabase HTTP suite in test/api/ additionally covers PostgREST).
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, seedPlayer, seedPuzzle, asAnon } from './setup.mjs';

const dev = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

async function checkGuess(db, deviceId, cell, playerId) {
  const r = await db.query('select check_guess($1,$2,$3) as res', [deviceId, cell, playerId]);
  return r.rows[0].res;
}

describe('U6 game API (PGlite)', () => {
  let db;
  let felix; let heritage; let dual;

  beforeAll(async () => {
    db = await freshDb();
    // Puzzle with DO/HT/JM x MLB/NBA/EPL.
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
    // Qualifies at tier 1 AND tier 2 for JM — should display as tier 1.
    dual = await seedPlayer(db, {
      qid: 'QDL', name: 'Dual Tier', normalized: 'dual tier',
      eligibility: [{ country: 'JM', tier: 2 }, { country: 'JM', tier: 1 }], stints: ['EPL'],
    });
  });

  it('AE2: search_players folds accents and matches substrings', async () => {
    const exact = await asAnon(db, () => db.query("select * from search_players('felix sanchez')"));
    expect(exact.rows.map((r) => r.display_name)).toContain('Félix Sánchez');
    const partial = await asAnon(db, () => db.query("select * from search_players('sanchez')"));
    expect(partial.rows.map((r) => r.player_id)).toContain(felix);
  });

  it('AE1: heritage-only cell returns tier 3 with justification', async () => {
    const res = await checkGuess(db, dev(1), 'HT|MLB', heritage);
    expect(res.correct).toBe(true);
    expect(res.tier).toBe(3);
    expect(res.justification).toMatch(/Haiti/);
  });

  it('a player eligible at tier 1 and tier 2 displays as tier 1', async () => {
    const res = await checkGuess(db, dev(2), 'JM|EPL', dual);
    expect(res.correct).toBe(true);
    expect(res.tier).toBe(1);
  });

  it('first guess of the day returns null rarity (first-solve path)', async () => {
    const fresh = await freshDb();
    await seedPuzzle(fresh, { islands: ['DO', 'HT', 'JM'], leagues: ['MLB', 'NBA', 'EPL'] });
    const id = await seedPlayer(fresh, { qid: 'QF', name: 'F', normalized: 'f', eligibility: [{ country: 'DO', tier: 1 }], stints: ['MLB'] });
    const r = await fresh.query('select check_guess($1,$2,$3) as res', [dev(1), 'DO|MLB', id]);
    expect(r.rows[0].res.correct).toBe(true);
    expect(r.rows[0].res.rarity).toBeNull();
  });

  it('AE4: rarity is prior-correct-devices / distinct-guessing-devices (1/25 = 4%)', async () => {
    const d2 = await freshDb();
    const pid = await seedPuzzle(d2, { islands: ['DO', 'HT', 'JM'], leagues: ['MLB', 'NBA', 'EPL'] });
    const star = await seedPlayer(d2, { qid: 'QS', name: 'Star', normalized: 'star', eligibility: [{ country: 'DO', tier: 1 }], stints: ['MLB'] });
    const other = await seedPlayer(d2, { qid: 'QO', name: 'Other', normalized: 'other', eligibility: [{ country: 'DO', tier: 1 }], stints: ['MLB'] });
    // Device 1 correctly guessed the star; devices 2..25 each have a guess.
    await d2.query('insert into guesses (puzzle_id, device_id, player_id, cell, correct) values ($1,$2,$3,$4,true)', [pid, dev(1), star, 'DO|MLB']);
    for (let i = 2; i <= 25; i++) {
      await d2.query('insert into guesses (puzzle_id, device_id, player_id, cell, correct) values ($1,$2,$3,$4,true)', [pid, dev(i), other, 'DO|MLB']);
    }
    // Device 26 now guesses the star -> 1 prior correct / 25 distinct devices.
    const r = await d2.query('select check_guess($1,$2,$3) as res', [dev(26), 'DO|MLB', star]);
    expect(Number(r.rows[0].res.rarity)).toBe(4);
  });

  it('duplicate athlete for a device is rejected without consuming a guess', async () => {
    const d = dev(50);
    await checkGuess(db, d, 'DO|MLB', felix);
    const dup = await checkGuess(db, d, 'DO|MLB', felix);
    expect(dup.rejected).toBe(true);
    expect(dup.reason).toBe('duplicate_player');
  });

  it('the tenth guess from a device is rejected server-side', async () => {
    const d3 = await freshDb();
    const pid = await seedPuzzle(d3, { islands: ['DO', 'HT', 'JM'], leagues: ['MLB', 'NBA', 'EPL'] });
    const target = await seedPlayer(d3, { qid: 'QT', name: 'T', normalized: 't', eligibility: [{ country: 'DO', tier: 1 }], stints: ['MLB'] });
    const d = dev(60);
    for (let i = 0; i < 9; i++) {
      const filler = await seedPlayer(d3, { qid: `QX${i}`, name: `X${i}`, normalized: `x${i}`, stints: ['MLB'] });
      await d3.query('insert into guesses (puzzle_id, device_id, player_id, cell, correct) values ($1,$2,$3,$4,false)', [pid, d, filler, 'DO|MLB']);
    }
    const r = await d3.query('select check_guess($1,$2,$3) as res', [d, 'DO|MLB', target]);
    expect(r.rows[0].res.reason).toBe('no_guesses_left');
  });

  it('a cell not in today\'s puzzle is rejected', async () => {
    const res = await checkGuess(db, dev(70), 'BB|IPL', felix);
    expect(res.rejected).toBe(true);
    expect(res.reason).toBe('invalid_cell');
  });

  it('a wrong guess is recorded, returns incorrect, and reveals nothing', async () => {
    const res = await checkGuess(db, dev(80), 'HT|NBA', felix); // felix is DO/MLB, not HT/NBA
    expect(res.rejected).toBe(false);
    expect(res.correct).toBe(false);
    expect(res.tier).toBeNull();
    expect(res.justification).toBeNull();
  });

  it('anon cannot select eligibility or stints (RLS denial)', async () => {
    const e = await asAnon(db, () => db.query('select * from eligibility'));
    const s = await asAnon(db, () => db.query('select * from stints'));
    expect(e.rows).toHaveLength(0);
    expect(s.rows).toHaveLength(0);
  });
});

describe('U9 analytics (PGlite)', () => {
  it('record_event dedupes on (device, event, day) and feeds the D1 view', async () => {
    const db = await freshDb();
    const today = (await db.query('select puzzle_today() as d')).rows[0].d;
    const next = (await db.query("select (puzzle_today() + 1) as d")).rows[0].d;

    // Device 1 opens today and tomorrow (returns); device 2 opens only today.
    await db.query('select record_event($1,$2,$3)', [dev(1), 'open', today]);
    await db.query('select record_event($1,$2,$3)', [dev(1), 'open', today]); // dup, ignored
    await db.query('select record_event($1,$2,$3)', [dev(1), 'open', next]);
    await db.query('select record_event($1,$2,$3)', [dev(2), 'open', today]);

    const opens = await db.query("select count(*)::int as n from events where event='open' and puzzle_date=$1", [today]);
    expect(opens.rows[0].n).toBe(2); // dedupe held

    const d1 = await db.query('select cohort_size, returned, rate from d1_return where cohort_date=$1', [today]);
    expect(d1.rows[0].cohort_size).toBe(2);
    expect(d1.rows[0].returned).toBe(1); // only device 1 returned
  });

  it('rejects a fabricated event type (CHECK constraint)', async () => {
    const db = await freshDb();
    await expect(
      db.query('select record_event($1,$2,puzzle_today())', [dev(1), 'hacked']),
    ).rejects.toBeTruthy();
  });
});
