// Regression guard: in the absence of a Supabase backend the app must fall back
// to the demo backend AND every UI entry point must route through the selector
// (a direct import from api.mjs throws in demo mode — the bug that made search
// return nothing on the deployed preview).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isDemo, searchPlayers, getPuzzle, checkGuess } from '../../src/backend.mjs';

const SRC = dirname(fileURLToPath(import.meta.url)) + '/../../src';

describe('backend selector (no Supabase env)', () => {
  it('falls back to demo mode', () => {
    expect(isDemo).toBe(true);
  });

  it('demo search returns matches (the reported bug: nothing showed up)', async () => {
    const rows = await searchPlayers('gayle');
    expect(rows.map((r) => r.display_name)).toContain('Chris Gayle');
  });

  it('demo getPuzzle and checkGuess work through the selector', async () => {
    const p = await getPuzzle();
    expect(p.island_codes).toHaveLength(3);
    const roy = (await searchPlayers('hibbert'))[0];
    const res = await checkGuess({ deviceId: 'd', cell: 'JM|NBA', playerId: roy.player_id });
    expect(res.correct).toBe(true);
    expect(res.tier).toBe(3);
  });
});

describe('UI modules route through the backend selector, never api.mjs directly', () => {
  // api.mjs throws without a Supabase client, so any UI module importing its
  // RPC functions directly breaks demo mode. Enforce the selector indirection.
  for (const file of ['autocomplete.mjs', 'main.mjs', 'analytics.mjs']) {
    it(`${file} does not import RPCs from ./api.mjs`, () => {
      const text = readFileSync(resolve(SRC, file), 'utf8');
      const badImport = /import\s*\{[^}]*\}\s*from\s*['"]\.\/api\.mjs['"]/.test(text);
      expect(badImport).toBe(false);
    });
  }
});
