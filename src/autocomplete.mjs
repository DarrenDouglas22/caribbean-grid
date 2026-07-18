// Debounced autocomplete against search_players. Renders a results dropdown with
// three distinguishable states: in-flight (keeps prior results visible with a
// spinner), zero matches ("No players found"), and results. Selection fires the
// onPick callback with { playerId, displayName }.
import { el, clear } from './dom.mjs';
import { searchPlayers } from './backend.mjs';

const DEBOUNCE_MS = 200;

export function createAutocomplete({ onPick }) {
  const input = el('input', {
    class: 'ac-input',
    type: 'text',
    placeholder: 'Name an athlete...',
    autocomplete: 'off',
    aria: { label: 'Guess an athlete', autocomplete: 'list' },
  });
  const spinner = el('span', { class: 'ac-spinner', 'aria-hidden': 'true' });
  const list = el('ul', { class: 'ac-list', role: 'listbox' });
  const root = el('div', { class: 'ac' }, [el('div', { class: 'ac-field' }, [input, spinner]), list]);

  let timer = null;
  let seq = 0;
  let enabled = true;

  function renderResults(rows) {
    clear(list);
    if (rows.length === 0) {
      list.appendChild(el('li', { class: 'ac-empty', text: 'No players found' }));
      return;
    }
    for (const row of rows) {
      list.appendChild(
        el('li', {
          class: 'ac-item',
          role: 'option',
          text: row.display_name,
          onclick: () => {
            if (!enabled) return;
            onPick({ playerId: row.player_id, displayName: row.display_name });
            input.value = '';
            clear(list);
          },
        }),
      );
    }
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) { clear(list); root.classList.remove('loading'); return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      root.classList.add('loading'); // spinner; prior results stay visible
      try {
        const rows = await searchPlayers(q);
        if (mine === seq) renderResults(rows);
      } catch {
        if (mine === seq) { clear(list); list.appendChild(el('li', { class: 'ac-empty', text: 'Search unavailable' })); }
      } finally {
        if (mine === seq) root.classList.remove('loading');
      }
    }, DEBOUNCE_MS);
  });

  function setEnabled(v) {
    enabled = v;
    input.disabled = !v;
    if (!v) clear(list);
  }

  function focus() { input.focus(); }

  return { root, setEnabled, focus };
}
