// Client-side stand-in for the four RPCs, over the bundled demo fixture. Used in
// preview mode when no Supabase backend is configured. Mirrors the real API's
// return shapes and check_guess semantics (correct/tier/justification/rarity,
// per-device cap, duplicate rejection, invalid cell, first-solve) so the UI
// behaves identically. Preview only — answers live in the bundle.
import { DEMO_PUZZLE, DEMO_ANSWERS, DEMO_PLAYERS, DEMO_NAME_BY_ID } from './demo-data.mjs';
import { normalizeName } from '../scripts/ingest/normalize.mjs';

const guessLog = new Map(); // deviceId -> Set of "cell|playerId"
const deviceGuessCount = new Map(); // deviceId -> count

export async function getPuzzle() {
  return { puzzle_id: 1, ...DEMO_PUZZLE };
}

export async function searchPlayers(q) {
  const n = normalizeName(q);
  if (!n) return [];
  return DEMO_PLAYERS.filter((p) => normalizeName(p.display_name).includes(n)).slice(0, 12);
}

export async function checkGuess({ deviceId, cell, playerId }) {
  const [island, league] = cell.split('|');
  if (!DEMO_PUZZLE.island_codes.includes(island) || !DEMO_PUZZLE.league_codes.includes(league)) {
    return { rejected: true, reason: 'invalid_cell' };
  }
  const key = `${cell}|${playerId}`;
  const used = guessLog.get(deviceId) ?? new Set();
  if (used.has(key)) return { rejected: true, reason: 'duplicate_player' };
  if ((deviceGuessCount.get(deviceId) ?? 0) >= 9) return { rejected: true, reason: 'no_guesses_left' };

  used.add(key);
  guessLog.set(deviceId, used);
  deviceGuessCount.set(deviceId, (deviceGuessCount.get(deviceId) ?? 0) + 1);

  const name = DEMO_NAME_BY_ID.get(playerId);
  const answers = DEMO_ANSWERS[cell] ?? [];
  const match = answers.find((a) => a.name === name);
  const remaining = 9 - deviceGuessCount.get(deviceId);

  if (!match) {
    return { rejected: false, correct: false, tier: null, justification: null, rarity: null, remaining_guesses: remaining };
  }
  return {
    rejected: false,
    correct: true,
    tier: match.tier,
    justification: match.tier === 3 ? match.justification : null,
    rarity: match.rarity ?? null,
    remaining_guesses: remaining,
  };
}

export async function recordEvent() {
  /* no-op in demo */
}
