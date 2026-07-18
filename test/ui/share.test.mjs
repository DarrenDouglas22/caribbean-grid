import { describe, it, expect } from 'vitest';
import { buildShareText, rarityLine, SITE_URL } from '../../src/share.mjs';
import { ISLANDS, flagFor } from '../../shared/islands.mjs';

describe('flag mapping', () => {
  it('has a distinct (non-fallback) flag for every island in the pool', () => {
    for (const island of ISLANDS) {
      expect(flagFor(island.code)).toBe(island.flag);
      expect(flagFor(island.code)).not.toBe('🏳️');
    }
  });

  it('includes PR, GY and BB flags specifically', () => {
    expect(flagFor('PR')).toBe('🇵🇷');
    expect(flagFor('GY')).toBe('🇬🇾');
    expect(flagFor('BB')).toBe('🇧🇧');
  });
});

describe('buildShareText', () => {
  const base = {
    puzzleDate: '2026-07-17',
    islands: ['JM', 'DO', 'TT'],
    outcomes: [
      'correct', 'incorrect', 'unattempted',
      'correct', 'correct', 'unattempted',
      'incorrect', 'unattempted', 'correct',
    ],
    guesses: [{ correct: true, rarity: 12, cell: 'JM|MLB' }, { correct: true, rarity: 4, cell: 'DO|NBA' }],
  };

  it('maps each outcome to a distinct square', () => {
    const text = buildShareText(base);
    expect(text).toContain('🟩'); // correct
    expect(text).toContain('🟥'); // incorrect
    expect(text).toContain('⬛'); // unattempted
  });

  it('labels each row with its island flag', () => {
    const text = buildShareText(base);
    const rows = text.split('\n');
    expect(rows.find((l) => l.startsWith('🇯🇲'))).toBeTruthy();
    expect(rows.find((l) => l.startsWith('🇩🇴'))).toBeTruthy();
    expect(rows.find((l) => l.startsWith('🇹🇹'))).toBeTruthy();
  });

  it('reports the solved count and includes the site link', () => {
    const text = buildShareText(base);
    expect(text).toContain('4/9'); // four 'correct' outcomes
    expect(text).toContain(SITE_URL);
  });

  it('rarity summary matches the completed game state (rarest pick)', () => {
    expect(rarityLine(base.guesses)).toBe('Rarest pick: 4%');
  });

  it('handles a card with no rarity data', () => {
    expect(rarityLine([{ correct: true, rarity: null }])).toBe('Rarest pick: —');
  });
});
