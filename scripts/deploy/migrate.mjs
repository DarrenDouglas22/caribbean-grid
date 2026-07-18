#!/usr/bin/env node
// Apply the SQL migrations to any hosted Postgres — a freed Supabase project, or
// any other Postgres (Neon, etc.). Makes U10's "apply migrations" step one
// command once a database exists.
//
//   DATABASE_URL=postgres://user:pass@host:5432/db node scripts/deploy/migrate.mjs
//
// For Supabase, DATABASE_URL is the connection string from Project Settings ->
// Database. Migrations are idempotent-friendly (create-or-replace functions);
// the table DDL runs once on a fresh database.

import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from '../lib/env.mjs';

const MIGRATIONS = dirname(fileURLToPath(import.meta.url)) + '/../../supabase/migrations';

async function main() {
  loadEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Set DATABASE_URL to your Postgres connection string.');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      process.stdout.write(`Applying ${f} ... `);
      await client.query(readFileSync(resolve(MIGRATIONS, f), 'utf8'));
      console.log('ok');
    }
    console.log(`Applied ${files.length} migrations.`);
    console.log('Next: `npm run ingest:wikidata && npm run ingest:heritage && npm run compose -- --days 14`');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
