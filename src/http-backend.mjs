// Frontend adapter for the serverless API (Neon-backed). Mirrors the demo
// backend's shape so the UI is backend-agnostic. Base URL comes from
// VITE_API_URL (e.g. "/api" when the frontend and functions share an origin on
// Vercel, or an absolute "https://<app>.vercel.app/api" when the static site is
// hosted separately).
const API = (import.meta.env?.VITE_API_URL ?? '/api').replace(/\/$/, '');

export async function getPuzzle() {
  const r = await fetch(`${API}/get-puzzle`);
  if (!r.ok) throw new Error('get_puzzle_failed');
  const data = await r.json();
  return data && data.puzzle_id ? data : null;
}

export async function searchPlayers(q) {
  const r = await fetch(`${API}/search-players?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error('search_failed');
  return r.json();
}

export async function checkGuess({ deviceId, cell, playerId }) {
  const r = await fetch(`${API}/check-guess`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, cell, playerId }),
  });
  if (!r.ok) throw new Error('check_guess_failed'); // caller must not consume a guess
  return r.json();
}

export async function recordEvent({ deviceId, event, puzzleDate }) {
  try {
    await fetch(`${API}/record-event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, event, puzzleDate }),
    });
  } catch {
    /* analytics is best-effort */
  }
}
