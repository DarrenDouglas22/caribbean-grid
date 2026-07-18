// Pure composer/validator core — no DB, no I/O. Operates on an in-memory data
// view of eligibility + stints and produces valid grids. This is the tested
// heart of U5; compose.mjs is the thin DB orchestrator around it.

import { US_LEAGUES, INTL_LEAGUES, leagueByCode } from '../../shared/leagues.mjs';

// ---------------------------------------------------------------------------
// Data view — index active eligibility (island -> player set) and active stints
// (league -> player set) so a cell's answer count is a set intersection.
// ---------------------------------------------------------------------------
export function buildDataView({ eligibility, stints }) {
  const byIsland = new Map();
  const byLeague = new Map();
  for (const e of eligibility) {
    if (e.active === false) continue;
    if (!byIsland.has(e.country)) byIsland.set(e.country, new Set());
    byIsland.get(e.country).add(e.player_id);
  }
  for (const s of stints) {
    if (s.active === false) continue;
    if (!byLeague.has(s.league)) byLeague.set(s.league, new Set());
    byLeague.get(s.league).add(s.player_id);
  }
  return { byIsland, byLeague };
}

export function cellAnswerCount(view, island, league) {
  const islanders = view.byIsland.get(island);
  const leaguers = view.byLeague.get(league);
  if (!islanders || !leaguers) return 0;
  // Iterate the smaller set.
  const [small, big] = islanders.size <= leaguers.size ? [islanders, leaguers] : [leaguers, islanders];
  let n = 0;
  for (const id of small) if (big.has(id)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Guardrail — every daily grid spans >=2 sports, includes >=1 US league and
// >=1 international league, so neither audience faces an unattemptable grid.
// ---------------------------------------------------------------------------
export function passesGuardrail(leagueCodes) {
  if (leagueCodes.length !== 3) return false;
  const sports = new Set(leagueCodes.map((c) => leagueByCode(c)?.sport));
  if (sports.size < 2) return false;
  const hasUs = leagueCodes.some((c) => US_LEAGUES.includes(c));
  const hasIntl = leagueCodes.some((c) => INTL_LEAGUES.includes(c));
  return hasUs && hasIntl;
}

export function gridIsValid(view, islands, leagues, { floor = 1 } = {}) {
  if (!passesGuardrail(leagues)) return false;
  for (const island of islands) {
    for (const league of leagues) {
      if (cellAnswerCount(view, island, league) < floor) return false;
    }
  }
  return true;
}

// Difficulty score: reward a mix of one dense anchor region and some sparse
// cells (higher spread = more interesting). Pure function of the cell counts.
export function scoreGrid(view, islands, leagues) {
  const counts = [];
  for (const island of islands) {
    for (const league of leagues) counts.push(cellAnswerCount(view, island, league));
  }
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  return max - min; // spread
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------
export function* combinations(items, k) {
  const n = items.length;
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map((i) => items[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

// All valid grids over the given island and league pools.
export function enumerateValidGrids(view, islandCodes, leagueCodes, { floor = 1 } = {}) {
  const grids = [];
  const leagueTrios = [...combinations(leagueCodes, 3)].filter(passesGuardrail);
  for (const islands of combinations(islandCodes, 3)) {
    for (const leagues of leagueTrios) {
      if (gridIsValid(view, islands, leagues, { floor })) {
        grids.push({ islands, leagues, score: scoreGrid(view, islands, leagues) });
      }
    }
  }
  return grids;
}

export function countDistinctValidGrids(view, islandCodes, leagueCodes, opts) {
  return enumerateValidGrids(view, islandCodes, leagueCodes, opts).length;
}

// ---------------------------------------------------------------------------
// Deterministic scheduling with rotation memory
// ---------------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellKey(island, league) {
  return `${island}|${league}`;
}
function gridKey({ islands, leagues }) {
  return `${[...islands].sort().join(',')}#${[...leagues].sort().join(',')}`;
}

// Compose `days` grids deterministically. Rotation memory forbids repeating an
// exact grid, or reusing any (island, league) cell pair, within `window` days.
// Returns [{ islands, leagues }] in schedule order.
export function composeSchedule(view, islandCodes, leagueCodes, { days, seed = 1, window = 7, floor = 1 } = {}) {
  const rand = mulberry32(seed);
  const candidates = enumerateValidGrids(view, islandCodes, leagueCodes, { floor });
  // Deterministic shuffle: sort by score desc, then by a seeded jitter.
  const decorated = candidates.map((g) => ({ g, j: rand() }));
  decorated.sort((a, b) => b.g.score - a.g.score || a.j - b.j);
  const ordered = decorated.map((d) => d.g);

  const schedule = [];
  const usedGridKeys = [];
  const usedCells = []; // array of Set<cellKey> per scheduled day, windowed

  for (let day = 0; day < days; day++) {
    const windowGrids = new Set(usedGridKeys.slice(-window));
    const windowCells = new Set();
    for (const set of usedCells.slice(-window)) for (const c of set) windowCells.add(c);

    const pick = ordered.find((grid) => {
      if (windowGrids.has(gridKey(grid))) return false;
      for (const island of grid.islands) {
        for (const league of grid.leagues) {
          if (windowCells.has(cellKey(island, league))) return false;
        }
      }
      return true;
    });
    if (!pick) break; // ran out of non-repeating grids within the window
    schedule.push({ islands: pick.islands, leagues: pick.leagues });
    usedGridKeys.push(gridKey(pick));
    const cells = new Set();
    for (const island of pick.islands) for (const league of pick.leagues) cells.add(cellKey(island, league));
    usedCells.push(cells);
  }
  return schedule;
}

// Revalidation: given already-composed future puzzles and the current data
// view, return the puzzles whose cells no longer all meet the floor.
export function findDeadPuzzles(puzzles, view, { floor = 1 } = {}) {
  return puzzles.filter(
    (p) => !gridIsValid(view, p.island_codes, p.league_codes, { floor }),
  );
}
