# Caribbean Grid — Brainstorm Kickoff Handoff

**Role for you (Claude Code):** Brainstorm partner → prototype. Nothing below is final except the core concept. Challenge assumptions, propose alternatives, then converge on a buildable v1.

---

## Core Concept (locked)

A daily Immaculate Grid-style puzzle: **Caribbean island countries × professional leagues** (rows × columns). Player fills 9 cells with athletes matching both criteria. Possible third axis later: stat achievements (e.g., "All-Star", "30+ HR season").

**Formula:** existing database + constraint + daily cadence + shareable result. We build the game loop, not the data layer.

**Strategic role:** Audience growth engine for Backcourt (Caribbean sports media brand, ~5k IG) — daily-habit-forming, not one-off. Same role as J·A JAM but stickier. Every obscure answer = a content post.

## Working Decisions (challenge these)

1. **Grid axes v1:** Countries (JM, DR, BS, TT, PR, HT, CU...) × Leagues (MLB, NBA, NFL; maybe WNBA, EPL). MLB = density anchor (DR has 800+ all-time players).
2. **Eligibility tiers** (the make-or-break rule, shown on every puzzle):
   - Tier 1: Born in country — auto-verifiable (Wikidata)
   - Tier 2: National team appearance — verifiable (FIBA/FIFA/WBC rosters)
   - Tier 3: Parent born there ("heritage" 🔸) — hand-curated. **This table is the moat.**
3. **Validator-first:** No grid ships unless every cell has ≥1 valid answer. Script before UI.
4. **Rarity score:** % of players who guessed each answer (share hook, same as original).

## Stack (default, not mandate)

- Single-page web app (vanilla JS or lightweight framework — J·A JAM precedent)
- Supabase: `players`, `eligibility(player, country, tier)`, `stints(player, league)`, `puzzles`, `guesses`
- Data ingest: Wikidata SPARQL (birthplace + sport + teams), Baseball-Reference born-by-country pages for validation
- Design schema so **Olympic Grid** (countries × sports/Games — the v2 spinoff) reuses it by swapping `stints` for sports

## Brainstorm Agenda (your job)

1. **Data feasibility spike:** Draft the Wikidata SPARQL query for Tier 1. How many players per country×league cell actually exist? Which cells are dead?
2. **Grid design:** Fixed 3×3 daily? Rotating countries? Difficulty curve across the week?
3. **Guess input UX:** Autocomplete against player table — how to handle name variants/accents?
4. **Heritage data:** Best workflow to hand-curate Tier 3 (seed list → verify → tag)?
5. **Share mechanic:** Emoji grid à la Wordle? What makes this one distinct?
6. **Risks:** Sports Reference ToS at scale; "Immaculate Grid" trade dress — how different must naming/visuals be?

## Constraints

- Lean: v1 target ≈ 1 day of focused build time
- Free/open data sources only (Wikidata, Cricsheet-class openness preferred; scrape-tolerant sources flagged as risk)
- Mobile-first (IG audience arrives from Stories)
- Caribbean-original identity — no borrowed IP (J·A JAM lesson)

## Out of Scope (v1)

Stat-based cells, accounts/auth beyond anon streaks, monetization, Olympic Grid.
