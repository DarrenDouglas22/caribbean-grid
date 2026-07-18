// The four operations, expressed over any pg-compatible client (a node-postgres
// pool client, or PGlite in tests). The SQL functions (get_puzzle,
// search_players, check_guess, record_event) live in the migrations and do the
// real work — these handlers are the thin call layer the serverless endpoints
// and the tests share. Security property is preserved: only these four
// operations are exposed, and none returns the answer corpus.

export async function getPuzzle(client) {
  const r = await client.query('select * from get_puzzle()');
  return r.rows[0] ?? null; // null = no puzzle today
}

export async function searchPlayers(client, q) {
  if (!q || !q.trim()) return [];
  const r = await client.query('select * from search_players($1)', [q]);
  return r.rows;
}

// Wrapped in a transaction so the per-IP throttle inside check_guess can read
// the forwarded client IP via a transaction-local setting (the SQL reads
// current_setting('request.headers')). Insert + count + throttle all commit
// atomically, matching the single-transaction rarity guarantee.
export async function checkGuess(client, { deviceId, cell, playerId, ip }) {
  await client.query('begin');
  try {
    if (ip) {
      await client.query("select set_config('request.headers', $1, true)", [
        JSON.stringify({ 'x-forwarded-for': ip }),
      ]);
    }
    const r = await client.query('select check_guess($1,$2,$3) as res', [deviceId, cell, playerId]);
    await client.query('commit');
    return r.rows[0].res;
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}

export async function recordEvent(client, { deviceId, event, puzzleDate }) {
  await client.query('select record_event($1,$2,$3)', [deviceId, event, puzzleDate]);
  return { ok: true };
}
