// U1 schema verification — the invariant constraints reject bad rows. These are
// the "negative checks" from U1's Verification line, run for real in PGlite.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb } from './setup.mjs';

describe('U1 schema invariants', () => {
  let db;
  beforeAll(async () => { db = await freshDb(); });

  const expectReject = async (sql, params) => {
    await expect(db.query(sql, params)).rejects.toBeTruthy();
  };

  it('rejects a player with neither natural key', async () => {
    await expectReject(
      "insert into players (display_name, normalized_name, source) values ('X','x','test')",
    );
  });

  it('rejects a tier-4 eligibility (tier out of range)', async () => {
    const p = await db.query("insert into players (wikidata_qid, display_name, normalized_name, source) values ('QA','A','a','test') returning id");
    await expectReject(
      'insert into eligibility (player_id, country, tier, source) values ($1, $2, 4, $3)',
      [p.rows[0].id, 'JM', 'test'],
    );
  });

  it('rejects a tier-3 eligibility without justification and citation', async () => {
    const p = await db.query("insert into players (wikidata_qid, display_name, normalized_name, source) values ('QB','B','b','test') returning id");
    await expectReject(
      'insert into eligibility (player_id, country, tier, source) values ($1, $2, 3, $3)',
      [p.rows[0].id, 'HT', 'test'],
    );
  });

  it('rejects a second puzzle on the same date', async () => {
    await db.query("insert into puzzles (puzzle_date, island_codes, league_codes) values ('2030-01-01', array['JM','DO','TT'], array['MLB','NBA','EPL'])");
    await expectReject("insert into puzzles (puzzle_date, island_codes, league_codes) values ('2030-01-01', array['BB','GY','HT'], array['MLB','IPL','NBA'])");
  });

  it('rejects a duplicate stint (player, league)', async () => {
    const p = await db.query("insert into players (wikidata_qid, display_name, normalized_name, source) values ('QC','C','c','test') returning id");
    await db.query('insert into stints (player_id, league, source) values ($1, $2, $3)', [p.rows[0].id, 'MLB', 'test']);
    await expectReject('insert into stints (player_id, league, source) values ($1, $2, $3)', [p.rows[0].id, 'MLB', 'test']);
  });

  it('accepts a well-formed tier-3 eligibility with justification + citation', async () => {
    const p = await db.query("insert into players (wikidata_qid, display_name, normalized_name, source) values ('QD','D','d','test') returning id");
    await expect(db.query(
      'insert into eligibility (player_id, country, tier, justification, citation, source) values ($1,$2,3,$3,$4,$5)',
      [p.rows[0].id, 'HT', 'father born in Haiti', 'https://x', 'test'],
    )).resolves.toBeTruthy();
  });
});
