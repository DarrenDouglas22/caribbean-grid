// Thin wrappers over the four RPCs (U6). The client only ever calls these —
// never a table select.
import { assertClient } from './supabase.mjs';

export async function getPuzzle() {
  const db = assertClient();
  const { data, error } = await db.rpc('get_puzzle');
  if (error) throw error;
  return data && data.length ? data[0] : null; // null = no puzzle today
}

export async function searchPlayers(q) {
  const db = assertClient();
  const { data, error } = await db.rpc('search_players', { q });
  if (error) throw error;
  return data ?? [];
}

export async function checkGuess({ deviceId, cell, playerId }) {
  const db = assertClient();
  const { data, error } = await db.rpc('check_guess', {
    p_device_id: deviceId,
    p_cell: cell,
    p_player_id: playerId,
  });
  if (error) throw error; // network / server error — caller must NOT consume a guess
  return data;
}

export async function recordEvent({ deviceId, event, puzzleDate }) {
  const db = assertClient();
  // Analytics is best-effort — never let it break gameplay.
  try {
    await db.rpc('record_event', { p_device_id: deviceId, p_event: event, p_puzzle_date: puzzleDate });
  } catch {
    /* ignore */
  }
}
