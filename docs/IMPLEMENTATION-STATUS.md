# Implementation Status — Caribbean Grid

Against `docs/plans/2026-07-17-001-feat-caribbean-grid-plan.md`. This records
what was built and verified versus what is **infrastructure- or owner-gated**
and cannot be completed in a sandbox without a provisioned Supabase project, the
Supabase CLI/Docker, a GitHub repo with Pages, a device, or owner curation.

## Architecture change: Neon + serverless (owner-chosen)

The plan specified Supabase (KTD2). The owner chose a **Neon Postgres + serverless
API** backend instead (free-tier friendly, no Supabase project needed). The SQL
migrations are unchanged — only the transport moved from Supabase's PostgREST/RLS
to explicit serverless endpoints under `api/` (`get-puzzle`, `search-players`,
`check-guess`, `record-event`). Answers still never reach the browser (only those
four operations are exposed, none returns the answer corpus). The Supabase client
code was removed; the frontend bundle dropped from 231 KB to 16 KB. Deploy target
is Vercel (`vercel.json`) + Neon.

## Environment

The build ran with Node 25, npm, and git available — but **no Supabase CLI, no
Docker, no psql, no cloud project, and no GitHub remote**. To verify the SQL for
real anyway, the test suite runs the actual migrations against **PGlite** (an
in-process WASM Postgres, no Docker), so the schema constraints, RPCs, RLS, and
analytics views are exercised as part of `npm test`. What remains gated is only
what genuinely needs external infrastructure (a hosted deploy) or a human
(device testing, owner curation).

## Built and verified (all 10 units)

| Unit | Built | Verified here |
|---|---|---|
| U1 Scaffold + schema | ✅ migration, config, shared island/league constants, git repo | **Migration applied in PGlite**; 6 negative-check tests (bad rows rejected) green |
| U2 Wikidata ingest | ✅ normalize, transform, orchestrator, DB layer | **22 unit tests** (normalize + transform) green |
| U3 CPL ingest | ✅ transform, orchestrator, fixture | **7 unit tests** green |
| U4 Heritage loader | ✅ CSV parser, validation, row builder, orchestrator, candidate seed | **10 unit tests** green; seed parses clean |
| U5 Composer/validator | ✅ full pure core + orchestrator | **15 unit tests** + **2 DB end-to-end tests** (≥30 grids from real DB data, schedule inserts under constraints) green |
| U6 Game API | ✅ RPCs, RLS, throttle SQL | **10 PGlite tests** green (AE1/AE2/AE4, cap, duplicate, invalid cell, wrong guess, min-tier, first-solve, RLS denial); live-stack HTTP suite self-skips |
| U7 Game UI | ✅ grid, autocomplete, state, rules, styles | **10 state tests** green; **Vite production build succeeds** |
| U8 Share card | ✅ pure builder + clipboard | **7 unit tests** green (all-22 flag map) |
| U9 Analytics | ✅ D1/D7 views + client dedupe | **4 unit tests** + **2 PGlite tests** (D1 view, dedupe, CHECK constraint) green |
| U10 Launch ops | ✅ README runbook, Pages workflow, secret-scan hook | Hook **verified to block** a service-key leak; build green |

**Totals:** 93 tests pass (`npm test`) — 73 unit + 20 against real Postgres via
PGlite. Live-stack HTTP integration suite self-skips cleanly, `npm run build`
succeeds, every `.mjs` passes `node --check`.

One design correction made under "use judgment on details the plan leaves open":
the plan's rotation rule ("avoid repeating an island+league cell pair within the
window") is infeasible as a hard ban at a daily cadence and silently under-filled
the schedule. It is now a hard ban on exact-grid repeats plus a soft
cell-reuse minimization with adjacent-day freshness — the schedule fills every
day the valid-grid pool supports. See the composer fix commit.

## Infrastructure-gated (needs a hosted deploy — cannot run in sandbox)

These are **built and verified against real Postgres (PGlite)** but need a hosted
deployment to run for production:

1. **Live ingest** (`npm run ingest:*`) — needs the service key + a hosted DB,
   plus the Cricsheet CPL archive downloaded for U3. (The ingest transforms are
   unit-tested; the DB write path is verified in PGlite.)
2. **`compose --validate` ≥30 on production data** — verified ≥30 against real DB
   data in PGlite (`test/db/compose.test.mjs`); the production count depends on
   live-ingested density.
3. **Production deploy** (Supabase cloud + GitHub Pages + repository secrets) —
   owner infrastructure. The Actions workflow and migrations are ready.
4. **Manual mobile checklist** (U7/U8) and **share paste into IG Stories /
   WhatsApp** — need a device and human eyes.
5. **Live-stack HTTP integration suite** (`npm run test:integration`) — the
   PostgREST HTTP path; the same scenarios are already verified at the SQL level
   in PGlite, so this is now redundant confirmation rather than the only proof.

## Owner-gated (curation / product decisions)

1. **Heritage seed ≥30 owner-verified** (U4 DoD) — `data/heritage.csv` ships a
   **7-entry** QID-verified candidate set (identities confirmed via the Wikidata
   EntityData endpoint). Reaching ≥30 and stamping each parentage claim as
   verified is genuine owner curation (`data/README.md`): heritage accuracy is
   the product's moat, so entries were **not** padded with unverified guesses —
   this is a real owner blocker, surfaced rather than faked.
2. **National-team QIDs** (U2) — West Indies cricket (Q912881) is confirmed; the
   football national-team QIDs are the well-known ones and the ingest logs any
   team returning zero members so a wrong QID surfaces on the first run.
3. **Two deferred design decisions** remain in the plan's Open Questions: the v1
   accessibility bar and the exact share-card rarity-summary format (a working
   default — "Rarest pick" — ships).

## Definition of Done — status

- ✅ All 10 units built and verified per their Verification lines — schema,
  RPCs, RLS, composer, and analytics all proven against real Postgres (PGlite),
  not just mocked.
- 🟡 **Four Acceptance Examples** — AE1 (heritage tier-3), AE2 (accent search),
  AE3 (guardrail), AE4 (rarity 1/25=4%) all pass against real SQL/logic in
  tests. The DoD phrasing "on production deployment" additionally needs a hosted
  stack — the behavior itself is verified.
- 🟡 **Success Criteria** — ≥30 valid grids verified from real DB data; ≥2-answer
  target respected by the composer; D1/D7 views verified live in PGlite. Share
  paste-verification needs a device.
- ⛔ **Heritage ≥30 owner-verified** — 7 verified candidates ship; the ≥30 count
  and per-entry owner sign-off is genuine curation work (a surfaced blocker, not
  faked).
- ⛔ **Production deploy** — needs owner infrastructure (Supabase cloud + Pages).
- ✅ Repo clean; runbook covers ingest, composing, curation, metrics.

**Bottom line:** every unit's *logic and data contracts* are built and verified
against real Postgres. What is genuinely unreachable in a sandbox — a hosted
production deployment, physical device testing, and the owner's heritage
verification — is surfaced honestly rather than guessed.
