# Caribbean Grid

A daily Caribbean sports grid puzzle — **islands × professional leagues**. Name
an athlete who matches both the island (row) and the league (column). Nine
guesses, one grid a day, shareable emoji result. Backcourt's daily-habit
audience engine.

- **Rows:** 22 Caribbean territories (see `shared/islands.mjs`).
- **Columns:** MLB, NBA, NFL, WNBA, EPL, IPL, CPL (see `shared/leagues.mjs`).
- **Eligibility tiers:** born there (T1), senior national-team cap (T2),
  heritage — parent/grandparent born there (T3, hand-verified).

Mobile-first vanilla-JS SPA (Vite). Backend is **Neon Postgres + a small
serverless API** (Vercel functions): the four operations — `get-puzzle`,
`search-players`, `check-guess`, `record-event` — are the only surface the
browser can reach, and none returns the answer corpus, so answers stay
server-side. Without a backend the app runs in **demo mode** (a bundled sample
grid) so it is always previewable.

> **Architecture note:** the plan originally specified Supabase (KTD2). Per the
> owner's choice, the backend is Neon + serverless functions instead. The SQL
> migrations are unchanged (standard Postgres); only the transport moved from
> Supabase's PostgREST/RLS to explicit serverless endpoints.

## Privacy

The game uses an **anonymous device identifier** (a random UUID in
localStorage) and collects **no personal information** — no accounts, no email,
no IP or user-agent stored with analytics.

---

## Local development

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL (Neon) once you have one
npm run dev               # Vite dev server (demo mode until VITE_API_URL is set)
npm test                  # all suites, incl. real-Postgres tests via PGlite (no Docker)
```

Install the secret-scanning pre-commit hook once (blocks committing secrets or a
`.env`):

```bash
git config core.hooksPath scripts/hooks
```

## Database

Standard Postgres. The migrations under `supabase/migrations/` (named for
history; portable to any Postgres) apply to Neon via the one-command applier:

```bash
DATABASE_URL=postgres://... npm run deploy:migrate
```

Migrations, in order:

1. `0001_schema.sql` — tables + invariant constraints.
2. `0002_api.sql` — SQL functions (`get_puzzle`, `search_players`,
   `check_guess`, `record_event`), RLS deny-by-default, per-IP throttle.
3. `0003_analytics.sql` — D1/D7 return views.

The migrations, functions, RLS, and analytics views are verified in the test
suite against real Postgres (PGlite, in-process — no Docker). Just run
`npm test`.

---

## Deploy (Neon + Vercel)

1. **Create a free Neon project** → copy the `DATABASE_URL` from Connection
   Details.
2. **Set up the schema and data locally** (put `DATABASE_URL` in `.env` first):

   ```bash
   npm run deploy:migrate                                   # apply migrations
   npm run ingest:wikidata && npm run ingest:heritage       # load players + eligibility
   npm run compose -- --validate                            # expect >=30 valid grids
   npm run compose -- --days 14 --seed 42                   # fill 2 weeks of puzzles
   ```

   (CPL is optional — see the runbook for the Cricsheet download.)
3. **Deploy to Vercel:** import the GitHub repo in Vercel and set the
   `DATABASE_URL` environment variable (the same Neon string). `vercel.json`
   already sets `VITE_API_URL=/api` and `BASE_PATH=/` for the build, and serves
   the `api/*.js` functions. The Vercel URL is the live game.

**Preview with no backend:** the app is playable in demo mode on any static host
(e.g. GitHub Pages) with no database — useful for UX review.

---

## Operating cadence (runbook)

All ingest/compose scripts run **locally** with `DATABASE_URL` in `.env` (never
deployed, never committed).

### 1. Ingest (weekly-ish)

```bash
npm run ingest:wikidata          # MLB/NBA/NFL/WNBA/EPL/IPL + Tier 2 national teams
npm run ingest:cpl               # CPL squads (needs the Cricsheet files below)
npm run ingest:heritage          # curated Tier 3 seed (data/heritage.csv)
```

CPL ingest expects the Cricsheet archive extracted first:

```bash
mkdir -p scripts/ingest/.cache/cpl
# download cpl_json.zip and the people register from https://cricsheet.org/downloads/
unzip cpl_json.zip -d scripts/ingest/.cache/cpl
# place people.csv at scripts/ingest/.cache/people.csv
```

**Always follow an ingest or heritage change with revalidation** — compose-time
validity does not survive data changes:

```bash
npm run compose -- --revalidate
```

### 2. Compose puzzles (keep 2+ weeks of runway)

```bash
npm run compose -- --validate           # report the distinct-valid-grid count (target >=30)
npm run compose -- --days 14 --seed 42  # fill 14 open future days
```

Check the runway regularly — if the schedule runs out, the app shows a
"no puzzle today" state (it should never fire in practice). Puzzles at or before
today, or with guesses, are immutable; the composer only fills open future
dates.

### 3. Heritage curation (owner-gated)

`data/heritage.csv` is the moat. Each Tier 3 entry needs a parentage claim
verified against a citable source **before it ships** — see `data/README.md`.
The launch gate is **≥30 owner-verified entries** concentrated on the otherwise
dead cells (Haiti×MLB, DR×NFL, WNBA columns, Jamaica×NBA).
`data/heritage-candidates-wikidata.csv` holds a machine-derived verification
queue to work from.

### 4. Read the metrics

Query the D1/D7 return views (the north-star metric):

```sql
select * from d1_return order by cohort_date desc;
select * from d7_return order by cohort_date desc;
select * from daily_funnel order by puzzle_date desc;
```

---

## Testing

```bash
npm test   # unit suites + real-Postgres (PGlite) verification of schema,
           # SQL functions, RLS, serverless handlers, composer, and analytics
```
