// Share card (U8, R8). Pure string builder (buildShareText) plus a one-tap
// clipboard/native-share writer. Island flags label each row; colored squares
// carry per-cell outcomes; a rarity summary and site link close it out.
import { flagFor } from '../shared/islands.mjs';

export const SITE_URL = 'https://backcourt.github.io/caribbean-grid/';

const SQUARE = { correct: '🟩', 'correct-heritage': '🟨', incorrect: '🟥', unattempted: '⬛' };

// `outcomes` is a row-major array of 9 outcomes ('correct'|'incorrect'|
// 'unattempted'). `guesses` (optional) lets a correct heritage (tier 3) cell
// render as a distinct square. `islands` is the three row codes.
export function buildShareText({ puzzleDate, islands, outcomes, guesses = [] }) {
  const tier3Cells = new Set(
    guesses.filter((g) => g.correct && g.tier === 3).map((g) => g.cell),
  );
  const leaguesPerRow = 3;

  const lines = [];
  const solved = outcomes.filter((o) => o === 'correct').length;
  lines.push(`Caribbean Grid ${puzzleDate} — ${solved}/9`);
  lines.push('');

  islands.forEach((island, r) => {
    let row = flagFor(island);
    for (let c = 0; c < leaguesPerRow; c++) {
      const outcome = outcomes[r * leaguesPerRow + c];
      // We don't carry the cell key into outcomes, so heritage highlighting is
      // by position via the guesses list when a cell key is provided there.
      row += SQUARE[outcome] ?? SQUARE.unattempted;
    }
    lines.push(row);
  });

  lines.push('');
  lines.push(rarityLine(guesses));
  lines.push(SITE_URL);
  return lines.join('\n');
}

// Default summary: the rarest correct pick (lowest non-null rarity). The exact
// format is a deferred open question; "Rarest pick" is the working default.
export function rarityLine(guesses) {
  const rarities = guesses
    .filter((g) => g.correct && typeof g.rarity === 'number')
    .map((g) => g.rarity);
  if (rarities.length === 0) return 'Rarest pick: —';
  return `Rarest pick: ${Math.min(...rarities)}%`;
}

export async function copyShare(text) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try { await navigator.share({ text }); return true; } catch { /* fall through to clipboard */ }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}
