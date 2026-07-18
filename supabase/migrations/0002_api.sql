-- U6 — the client-facing API surface. Everything the browser can reach is a
-- SECURITY DEFINER function; RLS denies direct table access so the answer
-- corpus (eligibility, stints) never leaves the server (KTD2).

-- ---------------------------------------------------------------------------
-- Lock down every table: enable RLS with no anon policies = deny by default.
-- The anon role reaches data only through the functions granted below.
-- ---------------------------------------------------------------------------
alter table players          enable row level security;
alter table aliases          enable row level security;
alter table stints           enable row level security;
alter table eligibility      enable row level security;
alter table puzzles          enable row level security;
alter table guesses          enable row level security;
alter table events           enable row level security;
alter table request_throttle enable row level security;

-- Eastern Caribbean puzzle day (UTC-4, no DST) — KTD8. Puerto Rico observes AST
-- year-round, so it is a stable proxy for the canonical puzzle timezone.
create or replace function puzzle_today()
returns date language sql stable as $$
  select (now() at time zone 'America/Puerto_Rico')::date;
$$;

-- ---------------------------------------------------------------------------
-- get_puzzle() — today's grid only. Future-dated puzzles are never returned
-- (spoiler protection for the pre-composed schedule).
-- ---------------------------------------------------------------------------
create or replace function get_puzzle()
returns table (puzzle_id bigint, puzzle_date date, island_codes text[], league_codes text[])
language sql security definer set search_path = public stable as $$
  select id, puzzle_date, island_codes, league_codes
  from puzzles
  where puzzle_date = puzzle_today();
$$;

-- Minimal accent folder mirroring scripts/ingest/normalize.mjs so the stored
-- normalized_name and the query fold identically (KTD4). Kept dependency-free
-- (no unaccent extension needed on the free tier). Defined before its callers
-- because Postgres validates SQL function bodies at creation.
create or replace function unaccent_lite(txt text)
returns text language sql immutable as $$
  select translate(
    txt,
    'àáâãäåèéêëìíîïòóôõöùúûüñçýÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÑÇÝ',
    'aaaaaaeeeeiiiiooooouuuuncyyAAAAAAEEEEIIIIOOOOOUUUUNCY'
  );
$$;

-- ---------------------------------------------------------------------------
-- search_players(q) — accent-insensitive autocomplete over player names and
-- aliases. The client never selects the tables directly; this is the only
-- name-bearing surface it can read.
-- ---------------------------------------------------------------------------
create or replace function search_players(q text)
returns table (player_id bigint, display_name text)
language sql security definer set search_path = public stable as $$
  with needle as (
    select lower(regexp_replace(unaccent_lite(coalesce(q, '')), '\s+', ' ', 'g')) as n
  )
  select distinct p.id, p.display_name
  from players p
  left join aliases a on a.player_id = p.id, needle
  where needle.n <> ''
    and (p.normalized_name like '%' || needle.n || '%'
      or a.normalized_name like '%' || needle.n || '%')
  order by p.display_name
  limit 12;
$$;

-- ---------------------------------------------------------------------------
-- Per-IP throttle (KTD2). Reads the gateway-supplied client IP from PostgREST
-- request headers — never a client parameter. Raises when the rolling window
-- limit is exceeded. Returns silently otherwise.
-- ---------------------------------------------------------------------------
create or replace function enforce_ip_throttle(p_limit int default 120, p_window interval default '1 minute')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ip inet;
  v_headers json;
  v_hits int;
begin
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;
  if v_headers is null then
    return; -- no gateway headers (e.g. direct DB call in tests) — skip throttle
  end if;
  v_ip := coalesce(
    split_part(v_headers ->> 'x-forwarded-for', ',', 1),
    v_headers ->> 'x-real-ip'
  )::inet;
  if v_ip is null then
    return;
  end if;

  insert into request_throttle (ip, window_start, hits)
    values (v_ip, now(), 1)
  on conflict (ip) do update set
    window_start = case when request_throttle.window_start < now() - p_window then now() else request_throttle.window_start end,
    hits = case when request_throttle.window_start < now() - p_window then 1 else request_throttle.hits + 1 end;

  select hits into v_hits from request_throttle where ip = v_ip;
  if v_hits > p_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- check_guess — validate the cell against today's puzzle, enforce the hard
-- per-device cap and duplicate rule, insert, and compute correctness + tier +
-- rarity in one transaction. Rarity is computed from the pre-insert state.
-- Cell is "ISLAND|LEAGUE".
-- ---------------------------------------------------------------------------
create or replace function check_guess(p_device_id uuid, p_cell text, p_player_id bigint)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_puzzle    puzzles%rowtype;
  v_island    text := split_part(p_cell, '|', 1);
  v_league    text := split_part(p_cell, '|', 2);
  v_count     int;
  v_correct   boolean;
  v_tier      smallint;
  v_just      text;
  v_denom     int;
  v_numer     int;
  v_rarity    numeric;
  v_inserted  boolean;
begin
  perform enforce_ip_throttle();

  select * into v_puzzle from puzzles where puzzle_date = puzzle_today();
  if not found then
    return json_build_object('rejected', true, 'reason', 'no_puzzle');
  end if;

  -- Cell must belong to today's grid (spoiler / probe protection).
  if not (v_island = any (v_puzzle.island_codes) and v_league = any (v_puzzle.league_codes)) then
    return json_build_object('rejected', true, 'reason', 'invalid_cell');
  end if;

  -- Hard per-device cap.
  select count(*) into v_count from guesses where puzzle_id = v_puzzle.id and device_id = p_device_id;
  if v_count >= 9 then
    return json_build_object('rejected', true, 'reason', 'no_guesses_left');
  end if;

  -- Correctness + lowest tier.
  v_correct :=
    exists (select 1 from eligibility e where e.player_id = p_player_id and e.country = v_island and e.active)
    and exists (select 1 from stints s where s.player_id = p_player_id and s.league = v_league and s.active);
  select tier, justification into v_tier, v_just
    from eligibility
    where player_id = p_player_id and country = v_island and active
    order by tier asc
    limit 1;

  -- Rarity from pre-insert state.
  select count(distinct device_id) into v_denom from guesses where puzzle_id = v_puzzle.id;
  select count(distinct device_id) into v_numer
    from guesses where puzzle_id = v_puzzle.id and player_id = p_player_id and correct;
  if v_denom > 0 and v_numer > 0 then
    v_rarity := round((v_numer::numeric / v_denom) * 100, 1);
  else
    v_rarity := null; -- first solve today
  end if;

  -- Insert; duplicate athlete for this device is rejected without consuming a
  -- guess (unique constraint makes this race-safe).
  insert into guesses (puzzle_id, device_id, player_id, cell, correct)
    values (v_puzzle.id, p_device_id, p_player_id, p_cell, v_correct)
  on conflict (puzzle_id, device_id, player_id) do nothing;
  get diagnostics v_count = row_count;
  v_inserted := v_count > 0;
  if not v_inserted then
    return json_build_object('rejected', true, 'reason', 'duplicate_player');
  end if;

  select 9 - count(*) into v_count from guesses where puzzle_id = v_puzzle.id and device_id = p_device_id;

  return json_build_object(
    'rejected', false,
    'correct', v_correct,
    'tier', case when v_correct then v_tier else null end,
    'justification', case when v_correct and v_tier = 3 then v_just else null end,
    'rarity', case when v_correct then v_rarity else null end,
    'remaining_guesses', v_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_event — anonymous analytics write. Server-side dedupe on
-- (device, event, puzzle_date); the CHECK constraint (0001) rejects fabricated
-- event types.
-- ---------------------------------------------------------------------------
create or replace function record_event(p_device_id uuid, p_event text, p_puzzle_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into events (device_id, event, puzzle_date)
    values (p_device_id, p_event, p_puzzle_date)
  on conflict (device_id, event, puzzle_date) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the anon role may execute the RPCs and nothing else.
-- ---------------------------------------------------------------------------
grant execute on function get_puzzle()                              to anon;
grant execute on function search_players(text)                     to anon;
grant execute on function check_guess(uuid, text, bigint)          to anon;
grant execute on function record_event(uuid, text, date)           to anon;
revoke execute on function enforce_ip_throttle(int, interval)      from anon;
revoke execute on function unaccent_lite(text)                     from anon;
revoke execute on function puzzle_today()                          from anon;
