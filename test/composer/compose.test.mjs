import { describe, it, expect } from 'vitest';
import {
  buildDataView,
  cellAnswerCount,
  passesGuardrail,
  gridIsValid,
  enumerateValidGrids,
  countDistinctValidGrids,
  composeSchedule,
  findDeadPuzzles,
} from '../../scripts/composer/core.mjs';

// Synthetic data view: enough islands/leagues that many valid grids exist.
// Players are integers; eligibility/stints reference them.
function makeView({ dead = [] } = {}) {
  const islands = ['JM', 'DO', 'TT', 'BB', 'HT', 'GY'];
  const leagues = ['MLB', 'NBA', 'NFL', 'EPL', 'IPL', 'CPL'];
  const eligibility = [];
  const stints = [];
  let pid = 1;
  const deadSet = new Set(dead.map(([i, l]) => `${i}|${l}`));
  for (const island of islands) {
    for (const league of leagues) {
      if (deadSet.has(`${island}|${league}`)) continue;
      // two players per cell so every live cell clears the >=2 target
      for (let k = 0; k < 2; k++) {
        const id = pid++;
        eligibility.push({ player_id: id, country: island, tier: 1, active: true });
        stints.push({ player_id: id, league, active: true });
      }
    }
  }
  return { view: buildDataView({ eligibility, stints }), islands, leagues };
}

describe('passesGuardrail (AE3)', () => {
  it('rejects an all-cricket column set', () => {
    expect(passesGuardrail(['IPL', 'CPL', 'IPL'])).toBe(false);
  });
  it('rejects an all-US column set', () => {
    expect(passesGuardrail(['MLB', 'NBA', 'NFL'])).toBe(false);
  });
  it('rejects an all-international column set', () => {
    expect(passesGuardrail(['EPL', 'IPL', 'CPL'])).toBe(false);
  });
  it('accepts a mixed set with a US and an international league across >=2 sports', () => {
    expect(passesGuardrail(['MLB', 'NBA', 'EPL'])).toBe(true);
  });
});

describe('cellAnswerCount', () => {
  it('counts distinct players eligible for the island and in the league', () => {
    const { view } = makeView();
    expect(cellAnswerCount(view, 'JM', 'MLB')).toBe(2);
  });
  it('returns 0 for a dead cell', () => {
    const { view } = makeView({ dead: [['HT', 'MLB']] });
    expect(cellAnswerCount(view, 'HT', 'MLB')).toBe(0);
  });
});

describe('gridIsValid (AE3)', () => {
  it('rejects a grid containing a zero-answer cell', () => {
    const { view } = makeView({ dead: [['HT', 'MLB']] });
    expect(gridIsValid(view, ['HT', 'DO', 'JM'], ['MLB', 'NBA', 'EPL'])).toBe(false);
  });
  it('accepts a fully-live grid that passes the guardrail', () => {
    const { view } = makeView();
    expect(gridIsValid(view, ['JM', 'DO', 'TT'], ['MLB', 'NBA', 'EPL'])).toBe(true);
  });
});

describe('enumeration', () => {
  it('excludes a league whose cells are all below the floor for the island trio', () => {
    // Kill every NFL cell for the JM/DO/TT trio; NFL must not appear in a valid
    // grid over just those islands.
    const { view, leagues } = makeView({
      dead: [['JM', 'NFL'], ['DO', 'NFL'], ['TT', 'NFL']],
    });
    const grids = enumerateValidGrids(view, ['JM', 'DO', 'TT'], leagues);
    expect(grids.every((g) => !g.leagues.includes('NFL'))).toBe(true);
  });

  it('reports >=30 distinct valid grids on a healthy pool', () => {
    const { view, islands, leagues } = makeView();
    expect(countDistinctValidGrids(view, islands, leagues)).toBeGreaterThanOrEqual(30);
  });
});

describe('composeSchedule', () => {
  it('is deterministic: same data + seed -> same schedule', () => {
    const { view, islands, leagues } = makeView();
    const a = composeSchedule(view, islands, leagues, { days: 8, seed: 42 });
    const b = composeSchedule(view, islands, leagues, { days: 8, seed: 42 });
    expect(a).toEqual(b);
  });

  it('never repeats an exact grid within the rotation window (hard rule)', () => {
    const { view, islands, leagues } = makeView();
    const schedule = composeSchedule(view, islands, leagues, { days: 14, seed: 7, window: 7 });
    const seen = [];
    for (const grid of schedule) {
      const key = `${[...grid.islands].sort().join(',')}#${[...grid.leagues].sort().join(',')}`;
      for (const prior of seen.slice(-7)) expect(prior).not.toBe(key);
      seen.push(key);
    }
  });

  it('fills the requested days when enough distinct valid grids exist', () => {
    const { view, islands, leagues } = makeView();
    const schedule = composeSchedule(view, islands, leagues, { days: 14, seed: 7 });
    expect(schedule).toHaveLength(14);
  });

  it('minimizes cell reuse — consecutive days share no cell on a healthy pool', () => {
    const { view, islands, leagues } = makeView();
    const schedule = composeSchedule(view, islands, leagues, { days: 6, seed: 7 });
    for (let i = 1; i < schedule.length; i++) {
      const prev = new Set();
      for (const isl of schedule[i - 1].islands) for (const lg of schedule[i - 1].leagues) prev.add(`${isl}|${lg}`);
      for (const isl of schedule[i].islands) for (const lg of schedule[i].leagues) {
        expect(prev.has(`${isl}|${lg}`)).toBe(false);
      }
    }
  });
});

describe('findDeadPuzzles (revalidation)', () => {
  it('flags only the future puzzle whose eligibility was invalidated', () => {
    const { view: healthy } = makeView();
    const puzzles = [
      { puzzle_date: '2026-08-01', island_codes: ['JM', 'DO', 'TT'], league_codes: ['MLB', 'NBA', 'EPL'] },
      { puzzle_date: '2026-08-02', island_codes: ['BB', 'GY', 'HT'], league_codes: ['MLB', 'IPL', 'NBA'] },
    ];
    expect(findDeadPuzzles(puzzles, healthy)).toEqual([]);

    // Now a correction kills HT×MLB; only the second puzzle depends on it.
    const { view: broken } = makeView({ dead: [['HT', 'MLB']] });
    const dead = findDeadPuzzles(puzzles, broken);
    expect(dead.map((p) => p.puzzle_date)).toEqual(['2026-08-02']);
  });
});
