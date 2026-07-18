-- U9 — daily-return instrumentation. The events table, its type CHECK, and the
-- (device, event, puzzle_date) dedupe constraint live in 0001; record_event
-- lives in 0002. This migration adds the D1/D7 return views the owner reads.
--
-- Implausible devices (guesses but no open event, per KTD7) are excluded by
-- construction: these views are built from `open` events, so a device that
-- never opened simply has no row and cannot inflate a denominator.

-- Distinct (device, puzzle_date) opens — the plausible-activity base.
create or replace view analytics_opens as
  select distinct device_id, puzzle_date
  from events
  where event = 'open';

-- D1 return: of the devices that opened on a given puzzle day, the fraction that
-- also opened the next puzzle day.
create or replace view d1_return as
  select
    o.puzzle_date as cohort_date,
    count(distinct o.device_id) as cohort_size,
    count(distinct r.device_id) as returned,
    round(count(distinct r.device_id)::numeric / nullif(count(distinct o.device_id), 0), 3) as rate
  from analytics_opens o
  left join analytics_opens r
    on r.device_id = o.device_id and r.puzzle_date = o.puzzle_date + 1
  group by o.puzzle_date
  order by o.puzzle_date;

-- D7 return: opened again exactly seven puzzle days later.
create or replace view d7_return as
  select
    o.puzzle_date as cohort_date,
    count(distinct o.device_id) as cohort_size,
    count(distinct r.device_id) as returned,
    round(count(distinct r.device_id)::numeric / nullif(count(distinct o.device_id), 0), 3) as rate
  from analytics_opens o
  left join analytics_opens r
    on r.device_id = o.device_id and r.puzzle_date = o.puzzle_date + 7
  group by o.puzzle_date
  order by o.puzzle_date;

-- Completion funnel per day — a supporting metric (opens vs completes).
create or replace view daily_funnel as
  select
    puzzle_date,
    count(distinct device_id) filter (where event = 'open') as opens,
    count(distinct device_id) filter (where event = 'complete') as completes,
    count(distinct device_id) filter (where event = 'share') as shares
  from events
  group by puzzle_date
  order by puzzle_date;

-- Views inherit RLS from the underlying tables (events denies anon). The owner
-- reads them with the service key; no grant to anon.
