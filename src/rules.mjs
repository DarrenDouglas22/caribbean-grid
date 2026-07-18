// The eligibility rules modal (R9) — always reachable from the header. Shows the
// three tiers so a first-time player from IG Stories understands what counts.
import { el } from './dom.mjs';

const TIERS = [
  ['Born there', 'The athlete was born in the country. (Tier 1)'],
  ['National team', 'The athlete has played for the country\'s senior national team — e.g. West Indies cricket, or a football national team. (Tier 2)'],
  ['Heritage 🔸', 'A parent or grandparent was born there. Hand-verified. (Tier 3)'],
];

export function rulesModal() {
  const close = () => backdrop.remove();

  const dialog = el('div', { class: 'modal', role: 'dialog', aria: { modal: 'true', label: 'How to play' } }, [
    el('h2', { text: 'How to play' }),
    el('p', { text: 'Name an athlete who matches both the island (row) and the league (column). You get 9 guesses. Any of these count:' }),
    el('ul', { class: 'tiers' }, TIERS.map(([name, desc]) =>
      el('li', {}, [el('strong', { text: name }), el('span', { text: ` — ${desc}` })]))),
    el('button', { class: 'modal-close', text: 'Got it', onclick: close }),
  ]);

  const backdrop = el('div', {
    class: 'backdrop',
    onclick: (e) => { if (e.target === backdrop) close(); },
  }, [dialog]);

  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  document.body.appendChild(backdrop);
}
