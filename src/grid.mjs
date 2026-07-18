// The 3x3 grid. Tap a cell to target it (tap-to-target interaction model), then
// type in the autocomplete. The active cell shows a spinner while a guess is in
// flight. Cells render one of: empty, targeted, in-flight, correct (tier badge +
// rarity), incorrect. Correct/incorrect use the same grammar as the share card.
import { el, clear } from './dom.mjs';
import { flagFor } from '../shared/islands.mjs';

const TIER_LABEL = { 1: 'Born', 2: 'Capped', 3: 'Heritage' };

export function createGrid({ islands, leagues, onTarget }) {
  const cellNodes = new Map(); // "island|league" -> node
  const attempted = new Set(); // cells guessed wrong at least once
  let active = null;

  const table = el('table', { class: 'grid', role: 'grid' });

  // Header row: blank corner + league columns.
  const head = el('tr', {}, [el('th', { class: 'corner', 'aria-hidden': 'true' })]);
  for (const league of leagues) head.appendChild(el('th', { class: 'col-head', scope: 'col', text: league }));
  table.appendChild(head);

  for (const island of islands) {
    const row = el('tr');
    row.appendChild(el('th', { class: 'row-head', scope: 'row' }, [
      el('span', { class: 'flag', text: flagFor(island), 'aria-hidden': 'true' }),
      el('span', { class: 'row-code', text: island }),
    ]));
    for (const league of leagues) {
      const key = `${island}|${league}`;
      const cell = el('td', {
        class: 'cell',
        role: 'gridcell',
        tabindex: '0',
        aria: { label: `${island} and ${league}` },
        onclick: () => target(key),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); target(key); } },
      });
      cellNodes.set(key, cell);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  function target(key) {
    const cell = cellNodes.get(key);
    if (!cell || cell.classList.contains('filled')) return;
    if (active) cellNodes.get(active)?.classList.remove('targeted');
    active = key;
    cell.classList.add('targeted');
    onTarget(key);
  }

  function activeCell() { return active; }

  function setPending(key, pending) {
    cellNodes.get(key)?.classList.toggle('pending', pending);
  }

  function fillCorrect(key, { displayName, tier, rarity }) {
    const cell = cellNodes.get(key);
    if (!cell) return;
    clear(cell);
    cell.classList.remove('targeted', 'pending');
    cell.classList.add('filled', 'correct', `tier-${tier}`);
    cell.appendChild(el('span', { class: 'ans-name', text: displayName }));
    cell.appendChild(el('span', { class: 'ans-tier', text: TIER_LABEL[tier] ?? '' }));
    cell.appendChild(el('span', { class: 'ans-rarity', text: rarity == null ? 'First solve!' : `${rarity}%` }));
    if (active === key) active = null;
  }

  function markIncorrect(key) {
    const cell = cellNodes.get(key);
    attempted.add(key);
    cell?.classList.remove('pending');
    cell?.classList.add('was-wrong');
    setTimeout(() => cell?.classList.remove('was-wrong'), 600);
  }

  function outcomes() {
    // For the share card: per-cell outcome in row-major order. correct if
    // solved, incorrect if attempted but never solved, else unattempted.
    const result = [];
    for (const island of islands) {
      for (const league of leagues) {
        const key = `${island}|${league}`;
        const cell = cellNodes.get(key);
        if (cell.classList.contains('correct')) result.push('correct');
        else if (attempted.has(key)) result.push('incorrect');
        else result.push('unattempted');
      }
    }
    return result;
  }

  return { root: table, target, activeCell, setPending, fillCorrect, markIncorrect, outcomes };
}
