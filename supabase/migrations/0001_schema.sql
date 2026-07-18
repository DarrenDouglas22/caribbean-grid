-- U1 — Caribbean Grid base schema.
--
-- The invariants ingest and gameplay depend on live in DDL, not application
-- code, because curators get direct database access. Every ingested row carries
-- a `source`. Competition-agnostic by design: any league (and, later, any
-- Games) is an ordinary `stints` row.

-- ---------------------------------------------------------------------------
-- players — one row per human. Two nullable-but-unique natural keys; at least
-- one is required so the three ingest paths (Wikidata, CPL, heritage) can never
-- mint the same person twice.
-- ---------------------------------------------------------------------------
create table players (
  id               bigint generated always as identity primary key,
  wikidata_qid     text unique,
  espncricinfo_id  text unique,
  display_name     text not null,
  normalized_name  text not null,
  source           text not null,
  created_at       timestamptz not null default now(),
  constraint players_has_natural_key
    check (wikidata_qid is not null or espncricinfo_id is not null)
);

create index players_normalized_name_idx on players (normalized_name text_pattern_ops);

-- ---------------------------------------------------------------------------
-- aliases — alternate spellings ("also known as"), normalized the same way as
-- players so autocomplete matches either form.
-- ---------------------------------------------------------------------------
create table aliases (
  id               bigint generated always as identity primary key,
  player_id        bigint not null references players (id) on delete cascade,
  alias            text not null,
  normalized_name  text not null,
  source           text not null,
  unique (player_id, normalized_name)
);

create index aliases_normalized_name_idx on aliases (normalized_name text_pattern_ops);

-- ---------------------------------------------------------------------------
-- stints — league membership. Competition-agnostic: (player, league) is the
-- unit. `active` supports soft-invalidation on ingest reruns.
-- ---------------------------------------------------------------------------
create table stints (
  id          bigint generated always as identity primary key,
  player_id   bigint not null references players (id) on delete restrict,
  league      text not null,
  source      text not null,
  active      boolean not null default true,
  unique (player_id, league)
);

-- ---------------------------------------------------------------------------
-- eligibility — island qualification with tier. Tier 3 (heritage) rows must
-- carry a justification and citation. Corrections soft-invalidate via `active`;
-- rows are never deleted because played puzzles reference this data.
-- ---------------------------------------------------------------------------
create table eligibility (
  id             bigint generated always as identity primary key,
  player_id      bigint not null references players (id) on delete restrict,
  country        text not null,          -- island code from shared/islands.mjs
  tier           smallint not null,
  justification  text,                   -- required for tier 3
  citation       text,                   -- required for tier 3
  source         text not null,
  active         boolean not null default true,
  unique (player_id, country, tier),
  constraint eligibility_tier_range check (tier between 1 and 3),
  constraint eligibility_tier3_documented
    check (tier <> 3 or (justification is not null and citation is not null))
);

-- ---------------------------------------------------------------------------
-- puzzles — one grid per calendar day. `island_codes` / `league_codes` are the
-- row and column axes (length-3 arrays). One puzzle per date.
-- ---------------------------------------------------------------------------
create table puzzles (
  id            bigint generated always as identity primary key,
  puzzle_date   date not null unique,
  island_codes  text[] not null,
  league_codes  text[] not null,
  created_at    timestamptz not null default now(),
  constraint puzzles_three_islands check (array_length(island_codes, 1) = 3),
  constraint puzzles_three_leagues check (array_length(league_codes, 1) = 3)
);

-- ---------------------------------------------------------------------------
-- guesses — one row per submitted guess. (puzzle, device, player) unique makes
-- the "one athlete per puzzle per device" rule race-safe at the DB. `cell` is
-- the "<island>|<league>" coordinate the guess targeted.
-- ---------------------------------------------------------------------------
create table guesses (
  id           bigint generated always as identity primary key,
  puzzle_id    bigint not null references puzzles (id) on delete restrict,
  device_id    uuid not null,
  player_id    bigint not null references players (id) on delete restrict,
  cell         text not null,
  correct      boolean not null,
  created_at   timestamptz not null default now(),
  unique (puzzle_id, device_id, player_id)
);

create index guesses_puzzle_device_idx on guesses (puzzle_id, device_id);

-- ---------------------------------------------------------------------------
-- events — anonymous analytics. No IP, no user-agent. Event type constrained;
-- (device, event, puzzle_date) unique gives server-side dedupe. See U9 for the
-- CHECK on event type and the D1/D7 views (added in 0003).
-- ---------------------------------------------------------------------------
create table events (
  id           bigint generated always as identity primary key,
  device_id    uuid not null,
  event        text not null,
  puzzle_date  date not null,
  created_at   timestamptz not null default now(),
  unique (device_id, event, puzzle_date),
  constraint events_type check (event in ('open', 'complete', 'share'))
);

-- ---------------------------------------------------------------------------
-- request throttle — a rolling per-IP counter for check_guess (KTD2). The RPC
-- reads the gateway-supplied client IP from PostgREST request headers and
-- rate-checks here. Never a client-supplied parameter.
-- ---------------------------------------------------------------------------
create table request_throttle (
  ip           inet not null,
  window_start timestamptz not null default now(),
  hits         integer not null default 0,
  primary key (ip)
);
