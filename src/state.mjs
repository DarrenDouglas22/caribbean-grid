// Client state: anonymous device id, per-puzzle game progress, and streaks —
// all in localStorage, no accounts (R6). Streaks and day-boundaries key off the
// puzzle date the SERVER returns (KTD8), never the device clock, so diaspora
// players in different timezones share one puzzle day.
//
// Storage is injected so this module is testable without a browser. In the app
// it defaults to window.localStorage.

const DEVICE_KEY = 'cg:device';
const GAME_PREFIX = 'cg:game:';
const STREAK_KEY = 'cg:streak';

function defaultStorage() {
  if (typeof localStorage !== 'undefined') return localStorage;
  // In-memory fallback (tests / SSR).
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function newUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // RFC4122-ish fallback.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function createState(storage = defaultStorage()) {
  function deviceId() {
    let id = storage.getItem(DEVICE_KEY);
    if (!id) {
      id = newUuid();
      storage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function loadGame(puzzleDate) {
    const raw = storage.getItem(GAME_PREFIX + puzzleDate);
    if (raw) {
      try { return JSON.parse(raw); } catch { /* fall through */ }
    }
    return { puzzleDate, guesses: [], remaining: 9, completed: false };
  }

  function saveGame(game) {
    storage.setItem(GAME_PREFIX + game.puzzleDate, JSON.stringify(game));
  }

  // Record a resolved guess (correct or not). Duplicate players and an
  // exhausted board are no-ops — the caller must not call this on a rejected or
  // failed (network error) guess, so a failure never consumes a guess.
  function recordGuess(game, guess) {
    if (game.completed) return game;
    if (game.guesses.some((g) => g.playerId === guess.playerId)) return game;
    game.guesses.push(guess);
    game.remaining = Math.max(0, 9 - game.guesses.length);
    if (game.remaining === 0) game.completed = true;
    saveGame(game);
    return game;
  }

  function hasGuessed(game, playerId) {
    return game.guesses.some((g) => g.playerId === playerId);
  }

  function markCompleted(game) {
    game.completed = true;
    saveGame(game);
    return game;
  }

  function streakInfo() {
    const raw = storage.getItem(STREAK_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch { /* fall through */ }
    }
    return { count: 0, lastDate: null };
  }

  // Advance the streak on completing `puzzleDate`. Consecutive puzzle days
  // increment; a gap resets to 1; re-completing the same day is idempotent.
  function recordCompletion(puzzleDate) {
    const s = streakInfo();
    if (s.lastDate === puzzleDate) return s;
    const next = s.lastDate === prevPuzzleDate(puzzleDate)
      ? { count: s.count + 1, lastDate: puzzleDate }
      : { count: 1, lastDate: puzzleDate };
    storage.setItem(STREAK_KEY, JSON.stringify(next));
    return next;
  }

  return {
    deviceId, loadGame, saveGame, recordGuess, hasGuessed, markCompleted,
    streakInfo, recordCompletion,
  };
}

export function prevPuzzleDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
