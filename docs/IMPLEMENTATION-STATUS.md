# Implementation Status — Caribbean Grid

Against `docs/plans/2026-07-17-001-feat-caribbean-grid-plan.md`. This records
what was built and verified versus what is **infrastructure- or owner-gated**
and cannot be completed in a sandbox without a provisioned Supabase project, the
Supabase CLI/Docker, a GitHub repo with Pages, a device, or owner curation.

## Environment

The build ran with Node 25, npm, and git available — but **no Supabase CLI, no
Docker, no psql, no cloud project, and no GitHub remote**. That bounds automated
verification to everything that does not require a live database, browser device,
or owner-in-the-loop.

## Built and verified (all 10 units)

| Unit | Built | Verified here |
|---|---|---|
| U1 Scaffold + schema | ✅ migration, config, shared island/league constants, git repo | `node --check`; schema DDL reviewed. Applying it needs Supabase (see gated). |
| U2 Wikidata ingest | ✅ normalize, transform, orchestrator, DB layer | **22 unit tests** (normalize + transform) green |
| U3 CPL ingest | ✅ transform, orchestrator, fixture | **7 unit tests** green |
| U4 Heritage loader | ✅ CSV parser, validation, row builder, orchestrator, candidate seed | **10 unit tests** green; seed parses clean |
| U5 Composer/validator | ✅ full pure core + orchestrator | **15 unit tests** green (AE3, ≥30 grids, determinism, rotation, revalidation) |
| U6 Game API | ✅ RPCs, RLS, throttle SQL | Integration tests written; **self-skip** without a live stack |
| U7 Game UI | ✅ grid, autocomplete, state, rules, styles | **10 state tests** green; **Vite production build succeeds** |
| U8 Share card | ✅ pure builder + clipboard | **7 unit tests** green (all-22 flag map) |
| U9 Analytics | ✅ D1/D7 views + client dedupe | **4 unit tests** green |
| U10 Launch ops | ✅ README runbook, Pages workflow, secret-scan hook | Hook **verified to block** a service-key leak; build green |

**Totals:** 75 unit tests pass (`npm test`), integration suite self-skips
cleanly, `npm run build` succeeds, every `.mjs` passes `node --check`.

One design correction made under "use judgment on details the plan leaves open":
the plan's rotation rule ("avoid repeating an island+league cell pair within the
window") is infeasible as a hard ban at a daily cadence and silently under-filled
the schedule. It is now a hard ban on exact-grid repeats plus a soft
cell-reuse minimization with adjacent-day freshness — the schedule fills every
day the valid-grid pool supports. See the composer fix commit.

## Infrastructure-gated (needs a provisioned stack — cannot run in sandbox)

These are **built and ready** but require external infrastructure to execute:

1. **Apply migrations** (`supabase db reset`) — needs Supabase CLI + Docker.
2. **U6 integration tests** (`npm run test:integration`) — need a running
   Supabase stack; they self-skip today and will run once one is reachable.
3. **Live ingest** (`npm run ingest:*`) — needs the service key + a real DB, plus
   the Cricsheet CPL archive downloaded for U3.
4. **`compose --validate` ≥30 on real data** — the composer proves ≥30 on a
   healthy pool in tests, but the real count depends on live-ingested density.
5. **Production deploy** (Supabase cloud + GitHub Pages + repository secrets) —
   owner infrastructure.
6. **Manual mobile checklist** (U7/U8) and **share paste into IG Stories /
   WhatsApp** — need a device and human eyes.

## Owner-gated (curation / product decisions)

1. **Heritage seed ≥30 owner-verified** (U4 DoD) — `data/heritage.csv` ships a
   5-entry QID-verified candidate set; reaching ≥30 verified entries on the dead
   cells is owner curation (`data/README.md`). Fabricating QIDs was deliberately
   avoided.
2. **National-team QIDs** (U2) — West Indies cricket (Q912881) is confirmed; the
   football national-team QIDs are the well-known ones and the ingest logs any
   team returning zero members so a wrong QID surfaces on the first run.
3. **Two deferred design decisions** remain in the plan's Open Questions: the v1
   accessibility bar and the exact share-card rarity-summary format (a working
   default — "Rarest pick" — ships).

## Definition of Done — status

- ✅ All 10 units built; all non-infra verification green.
- ⛔ Four Acceptance Examples on **production** — needs deploy (AE logic is
  covered by the self-skipping integration tests + unit tests).
- ⛔ Success Criteria on production data — needs live ingest + deploy.
- ⛔ Heritage ≥30 owner-verified — owner curation.
- ✅ Repo clean; runbook covers ingest, composing, curation, metrics.
