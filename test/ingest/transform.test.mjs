import { describe, it, expect } from 'vitest';
import {
  qidFromUri,
  resolveIsland,
  foldLeagueBindings,
  buildLeagueRows,
  buildNationalTeamRows,
  buildWiCricketRows,
} from '../../scripts/ingest/wikidata-transform.mjs';

const uri = (q) => `http://www.wikidata.org/entity/${q}`;

describe('qidFromUri', () => {
  it('extracts the QID from an entity URI', () => {
    expect(qidFromUri(uri('Q1189'))).toBe('Q1189');
  });
  it('returns null for empty input', () => {
    expect(qidFromUri(null)).toBeNull();
  });
});

describe('resolveIsland', () => {
  it('maps a sovereign island via direct P17 country (DR)', () => {
    expect(resolveIsland({ countryQid: 'Q786', adminAreaQids: [] })).toBe('DO');
  });

  it('maps Puerto Rico via the P131* admin path, not P17 (US)', () => {
    // A PR-born player has P17 = United States; PR only resolves via P131*.
    expect(
      resolveIsland({ countryQid: 'Q30', adminAreaQids: ['Q1183'] }),
    ).toBe('PR');
  });

  it('does not attribute a US-born mainlander to any island', () => {
    expect(resolveIsland({ countryQid: 'Q30', adminAreaQids: ['Q99'] })).toBeNull();
  });

  it('prefers the sovereign direct match', () => {
    expect(resolveIsland({ countryQid: 'Q766', adminAreaQids: [] })).toBe('JM');
  });
});

describe('foldLeagueBindings', () => {
  it('collapses row-per-adminArea into one record per player, unioning admin areas and aliases', () => {
    const bindings = [
      { player: uri('Q1'), playerLabel: 'A Player', altLabel: 'AP', countryDirect: uri('Q30'), adminArea: uri('Q1183') },
      { player: uri('Q1'), playerLabel: 'A Player', altLabel: 'The AP', countryDirect: uri('Q30'), adminArea: uri('Q99') },
    ];
    const folded = foldLeagueBindings(bindings);
    expect(folded.size).toBe(1);
    const rec = folded.get('Q1');
    expect([...rec.adminAreaQids].sort()).toEqual(['Q1183', 'Q99']);
    expect(rec.aliases.has('AP')).toBe(true);
    expect(rec.aliases.has('The AP')).toBe(true);
  });
});

describe('buildLeagueRows', () => {
  const opts = { leagueCode: 'MLB', sourceUrl: 'https://query.wikidata.org/#mlb' };

  it('produces one player row and one stint per player (no duplicates on repeat QID)', () => {
    const bindings = [
      { player: uri('Q2'), playerLabel: 'Robinson Canó', altLabel: '', countryDirect: uri('Q786'), adminArea: uri('Q786') },
      { player: uri('Q2'), playerLabel: 'Robinson Canó', altLabel: '', countryDirect: uri('Q786'), adminArea: uri('Q3707') },
    ];
    const { players, stints } = buildLeagueRows(bindings, opts);
    expect(players).toHaveLength(1);
    expect(stints).toHaveLength(1);
    expect(players[0].normalized_name).toBe('robinson cano');
    expect(stints[0]).toMatchObject({ wikidata_qid: 'Q2', league: 'MLB' });
  });

  it('assigns Tier 1 eligibility from birthplace', () => {
    const bindings = [
      { player: uri('Q3'), playerLabel: 'DR Player', altLabel: '', countryDirect: uri('Q786'), adminArea: '' },
    ];
    const { eligibility } = buildLeagueRows(bindings, opts);
    expect(eligibility).toEqual([
      { wikidata_qid: 'Q3', country: 'DO', tier: 1, source: opts.sourceUrl },
    ]);
  });

  it('stamps the source URL on every row (R11)', () => {
    const bindings = [
      { player: uri('Q4'), playerLabel: 'X', altLabel: 'Y', countryDirect: uri('Q766'), adminArea: '' },
    ];
    const { players, aliases, stints, eligibility } = buildLeagueRows(bindings, opts);
    for (const row of [...players, ...aliases, ...stints, ...eligibility]) {
      expect(row.source).toBe(opts.sourceUrl);
    }
  });

  it('records an alias distinct from the display name', () => {
    const bindings = [
      { player: uri('Q5'), playerLabel: 'Vladimir Guerrero Jr.', altLabel: 'Vlad Jr.', countryDirect: uri('Q786'), adminArea: '' },
    ];
    const { aliases } = buildLeagueRows(bindings, opts);
    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toMatchObject({ wikidata_qid: 'Q5', normalized_name: 'vlad jr.' });
  });
});

describe('buildNationalTeamRows', () => {
  it('grants Tier 2 for the team island to each member, deduped', () => {
    const bindings = [
      { player: uri('Q10'), playerLabel: 'Footballer' },
      { player: uri('Q10'), playerLabel: 'Footballer' },
      { player: uri('Q11'), playerLabel: 'Other' },
    ];
    const { eligibility } = buildNationalTeamRows(bindings, {
      island: 'JM',
      sourceUrl: 'https://query.wikidata.org/#jm-football',
    });
    expect(eligibility).toEqual([
      { wikidata_qid: 'Q10', country: 'JM', tier: 2, source: 'https://query.wikidata.org/#jm-football' },
      { wikidata_qid: 'Q11', country: 'JM', tier: 2, source: 'https://query.wikidata.org/#jm-football' },
    ]);
  });
});

describe('buildWiCricketRows', () => {
  const opts = { sourceUrl: 'https://query.wikidata.org/#wi-cricket' };

  it('attributes each WI cap to their home island via birthplace', () => {
    // A Barbados-born cricketer gets Tier 2 for Barbados (test-scenario).
    const bindings = [
      { player: uri('Q20'), countryDirect: uri('Q244'), adminArea: uri('Q244') },
    ];
    const { eligibility } = buildWiCricketRows(bindings, opts);
    expect(eligibility).toEqual([
      { wikidata_qid: 'Q20', country: 'BB', tier: 2, source: opts.sourceUrl },
    ]);
  });

  it('skips a cap with no pool birthplace', () => {
    const bindings = [{ player: uri('Q21'), countryDirect: uri('Q145'), adminArea: '' }];
    expect(buildWiCricketRows(bindings, opts).eligibility).toEqual([]);
  });
});
