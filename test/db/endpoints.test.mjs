// Integration test of the serverless endpoint layer (api/*.js) end-to-end
// against real Postgres (PGlite): request parsing, method handling, response
// shaping, and CORS — the glue between the fetch adapter and the SQL. _db.mjs's
// withClient is mocked to run against a shared PGlite instance so the endpoints
// exercise the real handlers and real SQL without a hosted database.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { freshDb, seedPlayer, seedPuzzle } from './setup.mjs';

const holder = vi.hoisted(() => ({ db: null }));

vi.mock('../../api/_db.mjs', () => ({
  withClient: (fn) => fn(holder.db),
  cors: () => {},
  clientIp: (req) => req.headers?.['x-forwarded-for'] ?? null,
}));

const { default: getPuzzle } = await import('../../api/get-puzzle.js');
const { default: searchPlayers } = await import('../../api/search-players.js');
const { default: checkGuess } = await import('../../api/check-guess.js');
const { default: recordEvent } = await import('../../api/record-event.js');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
    end() { this.ended = true; return this; },
  };
}
const dev = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe('serverless endpoints (PGlite, end-to-end)', () => {
  let felix; let heritage;

  beforeAll(async () => {
    holder.db = await freshDb();
    await seedPuzzle(holder.db, { islands: ['DO', 'HT', 'JM'], leagues: ['MLB', 'NBA', 'EPL'] });
    felix = await seedPlayer(holder.db, {
      qid: 'QF', name: 'Félix Sánchez', normalized: 'felix sanchez',
      eligibility: [{ country: 'DO', tier: 1 }], stints: ['MLB'],
    });
    heritage = await seedPlayer(holder.db, {
      qid: 'QH', name: 'Heritage Star', normalized: 'heritage star',
      eligibility: [{ country: 'HT', tier: 3, justification: 'father born in Haiti', citation: 'https://x' }],
      stints: ['MLB'],
    });
  });

  it('GET /get-puzzle returns today\'s grid as JSON', async () => {
    const res = mockRes();
    await getPuzzle({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.island_codes).toEqual(['DO', 'HT', 'JM']);
  });

  it('OPTIONS preflight returns 204 (CORS)', async () => {
    const res = mockRes();
    await getPuzzle({ method: 'OPTIONS', headers: {} }, res);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });

  it('GET /search-players parses the q param (AE2)', async () => {
    const res = mockRes();
    await searchPlayers({ method: 'GET', headers: {}, query: { q: 'sanchez' } }, res);
    expect(res.body.map((r) => r.player_id)).toContain(felix);
  });

  it('POST /check-guess parses the body and returns the AE1 heritage result', async () => {
    const res = mockRes();
    await checkGuess({
      method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' },
      body: { deviceId: dev(1), cell: 'HT|MLB', playerId: heritage },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.tier).toBe(3);
    expect(res.body.justification).toMatch(/Haiti/);
  });

  it('POST /check-guess with a missing field returns 400', async () => {
    const res = mockRes();
    await checkGuess({ method: 'POST', headers: {}, body: { deviceId: dev(2) } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('POST /check-guess rejects a non-POST method with 405', async () => {
    const res = mockRes();
    await checkGuess({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('POST /record-event inserts and returns 204', async () => {
    const today = (await holder.db.query('select puzzle_today() as d')).rows[0].d;
    const res = mockRes();
    await recordEvent({ method: 'POST', headers: {}, body: { deviceId: dev(3), event: 'open', puzzleDate: today } }, res);
    expect(res.statusCode).toBe(204);
    const n = (await holder.db.query("select count(*)::int as n from events where event='open'")).rows[0].n;
    expect(n).toBe(1);
  });
});
