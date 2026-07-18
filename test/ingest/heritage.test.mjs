import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseCsv, parseHeritageCsv, buildHeritageRows } from '../../scripts/ingest/heritage-loader.mjs';

const HEADER = 'qid,espncricinfo_id,name,island,league,justification,source_url';

describe('parseCsv', () => {
  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('a,"b,c",d\n');
    expect(rows[0]).toEqual(['a', 'b,c', 'd']);
  });
});

describe('parseHeritageCsv validation', () => {
  it('rejects a row missing the source url', () => {
    const csv = `${HEADER}\nQ1,,Player One,HT,MLB,mother born in Port-au-Prince,`;
    const { rows, errors } = parseHeritageCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toMatch(/source_url/);
  });

  it('rejects a row missing the justification', () => {
    const csv = `${HEADER}\nQ1,,Player One,HT,MLB,,https://example.com`;
    expect(parseHeritageCsv(csv).errors[0].reason).toMatch(/justification/);
  });

  it('rejects a row missing the league', () => {
    const csv = `${HEADER}\nQ1,,Player One,HT,,mother born in Haiti,https://example.com`;
    expect(parseHeritageCsv(csv).errors[0].reason).toMatch(/league/);
  });

  it('rejects a name-only row (no QID or ESPNcricinfo id)', () => {
    const csv = `${HEADER}\n,,Player One,HT,MLB,mother born in Haiti,https://example.com`;
    expect(parseHeritageCsv(csv).errors[0].reason).toMatch(/name-only/);
  });

  it('rejects an unknown island', () => {
    const csv = `${HEADER}\nQ1,,Player One,ZZ,MLB,mother born there,https://example.com`;
    expect(parseHeritageCsv(csv).errors[0].reason).toMatch(/island/);
  });

  it('accepts a well-formed row', () => {
    const csv = `${HEADER}\nQ1,,Player One,HT,MLB,"mother born in Port-au-Prince, Haiti",https://example.com`;
    const { rows, errors } = parseHeritageCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({ qid: 'Q1', island: 'HT', league: 'MLB' });
  });
});

describe('buildHeritageRows', () => {
  it('creates player, tier-3 eligibility (with justification + citation), and a stint', () => {
    const csv = `${HEADER}\nQ7,,Heritage Star,HT,MLB,father born in Cap-Haitien,https://cite.example/x`;
    const { rows } = parseHeritageCsv(csv);
    const { players, eligibility, stints } = buildHeritageRows(rows);
    expect(players[0]).toMatchObject({ wikidata_qid: 'Q7', normalized_name: 'heritage star' });
    expect(eligibility[0]).toMatchObject({
      wikidata_qid: 'Q7', country: 'HT', tier: 3,
      justification: 'father born in Cap-Haitien', citation: 'https://cite.example/x',
    });
    expect(stints[0]).toMatchObject({ wikidata_qid: 'Q7', league: 'MLB' });
  });

  it('keys an ESPNcricinfo-only row on espncricinfo_id', () => {
    const csv = `${HEADER}\n,espn-42,Cricket Heritage,GY,CPL,grandparent from Georgetown,https://cite.example/y`;
    const { rows } = parseHeritageCsv(csv);
    const { players } = buildHeritageRows(rows);
    expect(players[0]).toMatchObject({ wikidata_qid: null, espncricinfo_id: 'espn-42' });
  });
});

describe('shipped candidate seed', () => {
  it('parses with zero validation errors', () => {
    const HERE = dirname(fileURLToPath(import.meta.url));
    const csv = readFileSync(resolve(HERE, '../../data/heritage.csv'), 'utf8');
    const { errors } = parseHeritageCsv(csv);
    expect(errors).toEqual([]);
  });
});
