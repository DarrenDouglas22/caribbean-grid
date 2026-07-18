import { describe, it, expect } from 'vitest';
import { createState, prevPuzzleDate } from '../../src/state.mjs';

// A fresh Map-backed storage stub per test — no DOM required.
function stubStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

describe('deviceId', () => {
  it('mints once and persists', () => {
    const s = createState(stubStorage());
    const a = s.deviceId();
    expect(a).toMatch(/[0-9a-f-]{36}/);
    expect(s.deviceId()).toBe(a);
  });
});

describe('streaks', () => {
  it('increments on consecutive-day completion', () => {
    const s = createState(stubStorage());
    expect(s.recordCompletion('2026-07-15').count).toBe(1);
    expect(s.recordCompletion('2026-07-16').count).toBe(2);
    expect(s.recordCompletion('2026-07-17').count).toBe(3);
  });

  it('resets after a missed day', () => {
    const s = createState(stubStorage());
    s.recordCompletion('2026-07-15');
    s.recordCompletion('2026-07-16');
    expect(s.recordCompletion('2026-07-18').count).toBe(1); // skipped the 17th
  });

  it('is idempotent for the same day (no double-count)', () => {
    const s = createState(stubStorage());
    s.recordCompletion('2026-07-16');
    expect(s.recordCompletion('2026-07-16').count).toBe(1);
  });

  it('survives reload (persisted in storage)', () => {
    const storage = stubStorage();
    createState(storage).recordCompletion('2026-07-16');
    const reloaded = createState(storage);
    expect(reloaded.streakInfo()).toEqual({ count: 1, lastDate: '2026-07-16' });
  });

  it('keys off the server puzzle date, not the device clock', () => {
    // The same puzzle date completed regardless of "device time" stays one day.
    const s = createState(stubStorage());
    s.recordCompletion('2026-07-16'); // player in Kingston
    expect(s.recordCompletion('2026-07-16').count).toBe(1); // same player after local midnight in London
  });
});

describe('game progress', () => {
  it('records guesses and disables input at nine', () => {
    const s = createState(stubStorage());
    let g = s.loadGame('2026-07-17');
    for (let i = 0; i < 9; i++) g = s.recordGuess(g, { playerId: i + 1, cell: 'DO|MLB', correct: false });
    expect(g.remaining).toBe(0);
    expect(g.completed).toBe(true);
  });

  it('restores filled cells and remaining guesses on reload', () => {
    const storage = stubStorage();
    const s = createState(storage);
    let g = s.loadGame('2026-07-17');
    g = s.recordGuess(g, { playerId: 1, cell: 'DO|MLB', correct: true, tier: 1 });
    g = s.recordGuess(g, { playerId: 2, cell: 'HT|MLB', correct: false });
    const reloaded = createState(storage).loadGame('2026-07-17');
    expect(reloaded.guesses).toHaveLength(2);
    expect(reloaded.remaining).toBe(7);
  });

  it('does not consume a guess on a duplicate player', () => {
    const s = createState(stubStorage());
    let g = s.loadGame('2026-07-17');
    g = s.recordGuess(g, { playerId: 1, cell: 'DO|MLB', correct: true });
    g = s.recordGuess(g, { playerId: 1, cell: 'DO|MLB', correct: true });
    expect(g.guesses).toHaveLength(1);
    expect(g.remaining).toBe(8);
    expect(s.hasGuessed(g, 1)).toBe(true);
  });
});

describe('prevPuzzleDate', () => {
  it('steps back one calendar day across a month boundary', () => {
    expect(prevPuzzleDate('2026-08-01')).toBe('2026-07-31');
  });
});
