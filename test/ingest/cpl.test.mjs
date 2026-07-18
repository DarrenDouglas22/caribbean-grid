import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  extractSquad,
  mergeSquads,
  buildCplRows,
  buildCplEligibility,
} from '../../scripts/ingest/cpl-transform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const match = JSON.parse(
  readFileSync(resolve(HERE, '../fixtures/cpl-match.json'), 'utf8'),
);

describe('extractSquad', () => {
  it('yields the expected squad list from a fixture match', () => {
    const squad = extractSquad(match);
    const names = squad.map((p) => p.name).sort();
    expect(names).toEqual(['Colin Munro', 'Jason Holder', 'Kieron Pollard', 'Rahkeem Cornwall']);
    expect(squad.find((p) => p.name === 'Jason Holder').cricsheetId).toBe('cs-holder');
  });
});

describe('mergeSquads', () => {
  it('dedupes a player appearing in two matches by cricsheet id', () => {
    const merged = mergeSquads([extractSquad(match), extractSquad(match)]);
    expect(merged).toHaveLength(4);
  });
});

describe('buildCplRows', () => {
  const register = new Map([
    ['cs-pollard', 'espn-pollard'],
    ['cs-holder', 'espn-holder'],
    ['cs-cornwall', 'espn-cornwall'],
    // Colin Munro deliberately absent — a register entry with no ESPNcricinfo id.
  ]);
  const opts = { sourceUrl: 'https://cricsheet.org/downloads/cpl_json.zip' };

  it('creates a player + CPL stint per resolved player', () => {
    const squad = extractSquad(match);
    const { players, stints } = buildCplRows(squad, register, opts);
    expect(players).toHaveLength(3);
    expect(stints.every((s) => s.league === 'CPL')).toBe(true);
    expect(players.find((p) => p.espncricinfo_id === 'espn-holder').display_name).toBe('Jason Holder');
  });

  it('logs (skips) a player with no ESPNcricinfo id rather than failing', () => {
    const squad = extractSquad(match);
    const { skipped } = buildCplRows(squad, register, opts);
    expect(skipped.map((p) => p.name)).toEqual(['Colin Munro']);
  });

  it('stamps the source url on every row (R11)', () => {
    const { players, stints } = buildCplRows(extractSquad(match), register, opts);
    for (const row of [...players, ...stints]) expect(row.source).toBe(opts.sourceUrl);
  });
});

describe('buildCplEligibility', () => {
  const opts = { sourceUrl: 'https://cricsheet.org/downloads/cpl_json.zip' };

  it('gives a T&T-born player CPL Tier 1 eligibility for Trinidad & Tobago', () => {
    const birthplaces = new Map([
      ['espn-pollard', { countryQid: 'Q754', adminAreaQids: [] }], // T&T
    ]);
    const { eligibility } = buildCplEligibility(birthplaces, opts);
    expect(eligibility).toEqual([
      { espncricinfo_id: 'espn-pollard', country: 'TT', tier: 1, source: opts.sourceUrl },
    ]);
  });

  it('gives an overseas import a stint but no eligibility (non-Caribbean birthplace)', () => {
    const birthplaces = new Map([
      ['espn-munro', { countryQid: 'Q408', adminAreaQids: [] }], // Australia
    ]);
    expect(buildCplEligibility(birthplaces, opts).eligibility).toEqual([]);
  });
});
