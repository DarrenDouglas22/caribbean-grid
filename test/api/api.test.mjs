// U6 integration tests — exercise the RPCs and RLS against a running Supabase
// stack. These require `supabase start` (or a cloud project) reachable via
// SUPABASE_URL + SUPABASE_SERVICE_KEY (and a separate anon key). They SELF-SKIP
// when that environment is not present, so `npm run test:integration` is safe to
// run anywhere — it simply reports skipped when no stack is configured.
//
// To run: supabase start && supabase db reset, then
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_KEY=... SUPABASE_ANON_KEY=... \
//   npm run test:integration

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const enabled = Boolean(URL && SERVICE && ANON);

const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe.skipIf(!enabled)('U6 game API', () => {
  let admin;
  let anon;
  let puzzleId;
  let players = {};

  beforeAll(async () => {
    admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
    anon = createClient(URL, ANON, { auth: { persistSession: false } });

    // Seed independent fixture data (not the ingest units): two islands x two
    // leagues, a heritage-only cell, and today's puzzle.
    const ins = async (table, rows, onConflict) =>
      (await admin.from(table).upsert(rows, { onConflict }).select()).data;

    const p = await ins('players', [
      { wikidata_qid: 'QT1', display_name: 'Félix Sánchez', normalized_name: 'felix sanchez', source: 'test' },
      { wikidata_qid: 'QT2', display_name: 'Heritage Star', normalized_name: 'heritage star', source: 'test' },
    ], 'wikidata_qid');
    players = Object.fromEntries(p.map((r) => [r.wikidata_qid, r.id]));

    await ins('stints', [
      { player_id: players.QT1, league: 'MLB', source: 'test' },
      { player_id: players.QT2, league: 'MLB', source: 'test' },
    ], 'player_id,league');
    await ins('eligibility', [
      { player_id: players.QT1, country: 'DO', tier: 1, source: 'test' },
      { player_id: players.QT2, country: 'HT', tier: 3, justification: 'father born in Haiti', citation: 'https://x', source: 'test' },
    ], 'player_id,country,tier');

    const today = (await admin.rpc('puzzle_today')).data;
    const pz = await admin.from('puzzles')
      .upsert({ puzzle_date: today, island_codes: ['DO', 'HT', 'JM'], league_codes: ['MLB', 'NBA', 'EPL'] }, { onConflict: 'puzzle_date' })
      .select();
    puzzleId = pz.data[0].id;
  });

  it('anon cannot select eligibility or stints (RLS denial)', async () => {
    const e = await anon.from('eligibility').select('*');
    const s = await anon.from('stints').select('*');
    expect((e.data ?? []).length).toBe(0);
    expect((s.data ?? []).length).toBe(0);
  });

  it('AE2: search_players folds accents', async () => {
    const r = await anon.rpc('search_players', { q: 'felix sanchez' });
    expect(r.data.map((x) => x.display_name)).toContain('Félix Sánchez');
    const r2 = await anon.rpc('search_players', { q: 'sanchez' });
    expect(r2.data.map((x) => x.player_id)).toContain(players.QT1);
  });

  it('AE1: heritage-only cell returns tier 3 with justification', async () => {
    const r = await anon.rpc('check_guess', { p_device_id: uuid(1), p_cell: 'HT|MLB', p_player_id: players.QT2 });
    expect(r.data.correct).toBe(true);
    expect(r.data.tier).toBe(3);
    expect(r.data.justification).toMatch(/Haiti/);
  });

  it('first guess of the day returns null rarity (first-solve path)', async () => {
    const r = await anon.rpc('check_guess', { p_device_id: uuid(2), p_cell: 'DO|MLB', p_player_id: players.QT1 });
    expect(r.data.correct).toBe(true);
    expect(r.data.rarity).toBeNull();
  });

  it('duplicate athlete for a device is rejected without consuming a guess', async () => {
    await anon.rpc('check_guess', { p_device_id: uuid(3), p_cell: 'DO|MLB', p_player_id: players.QT1 });
    const dup = await anon.rpc('check_guess', { p_device_id: uuid(3), p_cell: 'DO|MLB', p_player_id: players.QT1 });
    expect(dup.data.rejected).toBe(true);
    expect(dup.data.reason).toBe('duplicate_player');
  });

  it('a cell not in today\'s puzzle is rejected', async () => {
    const r = await anon.rpc('check_guess', { p_device_id: uuid(4), p_cell: 'BB|IPL', p_player_id: players.QT1 });
    expect(r.data.rejected).toBe(true);
    expect(r.data.reason).toBe('invalid_cell');
  });

  it('the tenth guess from a device is rejected server-side', async () => {
    const dev = uuid(5);
    // Nine distinct players would be needed for nine accepted guesses; here we
    // assert the cap path by pre-filling nine guess rows directly, then probing.
    for (let i = 0; i < 9; i++) {
      const p = await admin.from('players')
        .upsert({ wikidata_qid: `QCAP${i}`, display_name: `Cap ${i}`, normalized_name: `cap ${i}`, source: 'test' }, { onConflict: 'wikidata_qid' })
        .select();
      await admin.from('guesses').upsert({
        puzzle_id: puzzleId, device_id: dev, player_id: p.data[0].id, cell: 'DO|MLB', correct: false,
      }, { onConflict: 'puzzle_id,device_id,player_id' });
    }
    const r = await anon.rpc('check_guess', { p_device_id: dev, p_cell: 'DO|MLB', p_player_id: players.QT1 });
    expect(r.data.rejected).toBe(true);
    expect(r.data.reason).toBe('no_guesses_left');
  });
});
