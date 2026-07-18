# Caribbean Grid

A daily Caribbean sports grid puzzle — **islands × professional leagues**. Name
an athlete who matches both the island (row) and the league (column). Nine
guesses, one grid a day, shareable emoji result. Backcourt's daily-habit
audience engine.

- **Rows:** 22 Caribbean territories (see `shared/islands.mjs`).
- **Columns:** MLB, NBA, NFL, WNBA, EPL, IPL, CPL (see `shared/leagues.mjs`).
- **Eligibility tiers:** born there (T1), senior national-team cap (T2),
  heritage — parent/grandparent born there (T3, hand-verified).

Mobile-first vanilla-JS SPA (Vite) on GitHub Pages; Supabase Postgres backend
with all answer data behind security-definer RPCs and RLS.

## Privacy

The game uses an **anonymous device identifier** (a random UUID in
localStorage) and collects **no personal information** — no accounts, no email,
no IP or user-agent stored with analytics.

---

## Local development

```bash
npm install
cp .env.example .env      # fill in your Supabase URL + anon key
npm run dev               # Vite dev server
npm test                  # unit suites (no DB needed)
```

Install the secret-scanning pre-commit hook once (blocks committing the service
key or a `.env`):

```bash
git config core.hooksPath scripts/hooks
```

## Database

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker.

```bash
supabase start           # local Postgres + PostgREST
supabase db reset        # apply migrations in supabase/migrations/
```

Migrations, in order:

1. `0001_schema.sql` — tables + invariant constraints.
2. `0002_api.sql` — RPCs (`get_puzzle`, `search_players`, `check_guess`,
   `record_event`), RLS deny-by-default, per-IP throttle.
3. `0003_analytics.sql` — D1/D7 return views.

Integration tests run against the local stack and self-skip without it:

```bash
supabase start && supabase db reset
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=<service-key> SUPABASE_ANON_KEY=<anon-key> \
npm run test:integration
```

---

## Operating cadence (runbook)

All ingest/compose scripts run **locally** with the **service key** in `.env`
(never deployed, never committed — KTD3).

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

> No new scripts or tooling for curation — the runbook is README prose only.
> Automated curator tooling is deferred per the Product Contract.

### 4. Read the metrics

Query the D1/D7 return views (the north-star metric) with the service key:

```sql
select * from d1_return order by cohort_date desc;
select * from d7_return order by cohort_date desc;
select * from daily_funnel order by puzzle_date desc;
```

---

## Deploy

- **Frontend:** GitHub Actions (`.github/workflows/deploy.yml`) builds with Vite
  and publishes to GitHub Pages on push to `main`. Set repository secrets
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — never hardcode them.
- **Backend:** create a Supabase cloud project and apply the migrations
  (`supabase db push`).
- **Custom domain (later):** a coordinated change — set Vite `base` to `/`
  (build with `BASE_PATH=/`) **and** update `SITE_URL` in `src/share.mjs`
  together, then configure the Pages custom domain.

---

## Testing

```bash
npm test                 # unit suites: normalize, transforms, composer, state, share, analytics
npm run test:integration # RPC/RLS integration (needs a running Supabase stack; self-skips otherwise)
```
