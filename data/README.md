# Heritage (Tier 3) seed — `heritage.csv`

Tier 3 eligibility (a parent or grandparent born on the island) is hand-curated
and **owner-verified** — it is the game's moat and cannot be auto-derived. The
loader (`scripts/ingest/heritage.mjs`) validates and loads this file; the
content here is the curation surface.

## Status: candidate seed, pending owner verification

The rows currently in `heritage.csv` are a small, **QID-verified candidate
set** (7 entries) the agent assembled to exercise the loader and demonstrate the
format. They are genuine heritage cases (parent/grandparent born on the island,
not the player), each with a Wikidata QID confirmed against the entity's
identity and a citation. QIDs were verified via the Wikidata EntityData
endpoint; parentage claims still need the owner's sign-off.

**Launch gate (owner):** the plan's Definition of Done requires **≥30
owner-verified entries**, concentrated on the otherwise-dead cells — Haiti×MLB,
DR×NFL, WNBA columns, Jamaica×NBA. Reaching that threshold is deliberate
curation work reserved for the owner (Backcourt): each entry's parentage claim
must be checked against a citable source before it ships. Extend this file and
verify each row, then rerun `npm run ingest:heritage`.

**Curation starting point:** `heritage-candidates-wikidata.csv` holds ~13
machine-derived candidates — athletes whose parent's birthplace Wikidata records
inside a pool island (from a SPARQL query over parent/grandparent birthplaces).
They are a **verification queue, not verified**: some may be birthplace-record
gaps (a player born on the island but missing a P17 country claim) rather than
true heritage, so each still needs the owner's check before moving into
`heritage.csv`. Same columns, so a verified row copies straight across.

## Format

`qid,espncricinfo_id,name,island,league,justification,source_url`

- Provide **either** `qid` (Wikidata) **or** `espncricinfo_id` — a name-only row
  is rejected (name-match is a curator disambiguation step, not a load-time
  join).
- `island` is a pool code from `shared/islands.mjs` (e.g. `HT`, `DO`, `JM`).
- `league` is a code from `shared/leagues.mjs` (e.g. `MLB`, `NBA`, `NFL`).
- `justification` and `source_url` are **required** for every row and are stored
  as the eligibility's justification and citation.
- Quote any field containing a comma.

The loader upserts a Tier 3 `eligibility` row **and** a `stints` row per entry —
heritage players are usually absent from the birthplace-keyed Wikidata ingest,
so without the stint the target cell stays dead.
