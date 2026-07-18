// In-process Postgres (PGlite, WASM — no Docker) with the real migrations
// applied. Lets the schema constraints (U1) and the RPCs/RLS (U6/U9) be
// verified as part of `npm test`, not just against a live Supabase stack.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const MIGRATIONS = dirname(fileURLToPath(import.meta.url)) + '/../../supabase/migrations';

export async function freshDb() {
  const db = new PGlite();
  // Supabase pre-creates the `anon` role with schema usage; mirror that so the
  // grants in 0002 apply and RLS role-separation can be exercised.
  await db.exec('create role anon nologin;');
  await db.exec('grant usage on schema public to anon;');
  for (const f of ['0001_schema.sql', '0002_api.sql', '0003_analytics.sql']) {
    await db.exec(readFileSync(resolve(MIGRATIONS, f), 'utf8'));
  }
  // Mirror Supabase's default table grants to anon so RLS (enabled with no
  // policies) is what actually gates access — the deny is a 0-row result, not a
  // raw permission error. This makes the RLS test model production behavior.
  await db.exec('grant select on all tables in schema public to anon;');
  return db;
}

// Seed a player with optional eligibility/stint rows. Returns the player id.
export async function seedPlayer(db, { qid, name, normalized, eligibility = [], stints = [] }) {
  const p = await db.query(
    'insert into players (wikidata_qid, display_name, normalized_name, source) values ($1,$2,$3,$4) returning id',
    [qid, name, normalized, 'test'],
  );
  const id = p.rows[0].id;
  for (const e of eligibility) {
    await db.query(
      'insert into eligibility (player_id, country, tier, justification, citation, source) values ($1,$2,$3,$4,$5,$6)',
      [id, e.country, e.tier, e.justification ?? null, e.citation ?? null, 'test'],
    );
  }
  for (const s of stints) {
    await db.query('insert into stints (player_id, league, source) values ($1,$2,$3)', [id, s, 'test']);
  }
  return id;
}

export async function seedPuzzle(db, { islands, leagues }) {
  const r = await db.query(
    'insert into puzzles (puzzle_date, island_codes, league_codes) values (puzzle_today(), $1, $2) returning id',
    [islands, leagues],
  );
  return r.rows[0].id;
}

// Call an RPC as the anon role (models the browser). Returns the JSON/rows.
export async function asAnon(db, fn) {
  await db.exec('set role anon;');
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}
