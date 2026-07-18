// Game orchestrator (U7). Wires the grid, autocomplete, guess counter, rules
// modal, streak display, and (on completion) the share card. Owns the guess
// flow and every interaction state: targeting, in-flight spinner, network-error
// retry (never consuming a guess), duplicate rejection, no-puzzle, and the
// read-only completed view.
import { el, clear } from './dom.mjs';
import { createState } from './state.mjs';
import { getPuzzle, checkGuess } from './api.mjs';
import { createGrid } from './grid.mjs';
import { createAutocomplete } from './autocomplete.mjs';
import { buildShareText, copyShare } from './share.mjs';
import { rulesModal } from './rules.mjs';
import { createAnalytics } from './analytics.mjs';

const app = document.getElementById('app');
const state = createState();

function banner(text, kind = 'info') {
  const b = el('div', { class: `banner ${kind}`, role: 'status', text });
  return b;
}

function noPuzzleView() {
  clear(app);
  app.appendChild(el('div', { class: 'screen center' }, [
    el('h1', { text: 'Caribbean Grid' }),
    el('p', { class: 'muted', text: 'No puzzle today — come back tomorrow.' }),
  ]));
}

async function start() {
  let puzzle;
  try {
    puzzle = await getPuzzle();
  } catch {
    noPuzzleView();
    return;
  }
  if (!puzzle) { noPuzzleView(); return; }

  const puzzleDate = puzzle.puzzle_date;
  const deviceId = state.deviceId();
  const analytics = createAnalytics({ deviceId });
  analytics.logOpen(puzzleDate);

  let game = state.loadGame(puzzleDate);

  clear(app);
  const header = el('header', { class: 'app-header' }, [
    el('h1', { text: 'Caribbean Grid' }),
    el('button', { class: 'link-btn', text: 'How to play', onclick: () => rulesModal() }),
  ]);
  const counter = el('div', { class: 'counter', role: 'status' });
  const streakEl = el('div', { class: 'streak' });
  const msg = el('div', { class: 'msg', role: 'status', 'aria-live': 'polite' });

  const grid = createGrid({
    islands: puzzle.island_codes,
    leagues: puzzle.league_codes,
    onTarget: () => { autocomplete.setEnabled(!game.completed); autocomplete.focus(); },
  });
  const autocomplete = createAutocomplete({ onPick: submitGuess });

  const footer = el('div', { class: 'footer' });
  app.append(header, counter, streakEl, grid.root, autocomplete.root, msg, footer);

  restore();
  renderCounter();
  renderStreak();

  function renderCounter() {
    clear(counter);
    counter.appendChild(el('span', { text: `${game.remaining} guesses left` }));
  }
  function renderStreak() {
    const s = state.streakInfo();
    clear(streakEl);
    if (s.count > 0) streakEl.appendChild(el('span', { text: `Streak: ${s.count}` }));
  }
  function setMsg(text, kind = 'info') { clear(msg); if (text) msg.appendChild(banner(text, kind)); }

  // Rebuild the board from saved state (mid-game reload / completed revisit).
  function restore() {
    for (const g of game.guesses) {
      if (g.correct) grid.fillCorrect(g.cell, g);
      else grid.markIncorrect(g.cell);
    }
    if (game.completed) finish(false);
  }

  async function submitGuess({ playerId, displayName }) {
    if (game.completed) return;
    const cell = grid.activeCell();
    if (!cell) { setMsg('Tap a cell first, then type a name.'); return; }
    if (state.hasGuessed(game, playerId)) { setMsg('Already guessed in this puzzle.', 'warn'); return; }

    grid.setPending(cell, true);
    autocomplete.setEnabled(false);
    let res;
    try {
      res = await checkGuess({ deviceId, cell, playerId });
    } catch {
      grid.setPending(cell, false);
      autocomplete.setEnabled(true);
      setMsg("Couldn't reach the server — try again.", 'warn'); // no guess consumed
      return;
    }
    autocomplete.setEnabled(true);
    grid.setPending(cell, false);

    if (res.rejected) {
      // Server-side guard fired; mirror the message, consume nothing.
      const map = {
        duplicate_player: 'Already guessed in this puzzle.',
        no_guesses_left: 'No guesses left.',
        invalid_cell: 'That athlete/cell is not part of today\'s grid.',
        no_puzzle: 'No puzzle today — come back tomorrow.',
      };
      setMsg(map[res.reason] ?? 'Guess rejected.', 'warn');
      return;
    }

    // Accepted — consume a guess and reflect the outcome.
    const record = { playerId, displayName, cell, correct: res.correct, tier: res.tier, rarity: res.rarity };
    game = state.recordGuess(game, record);
    if (res.correct) {
      grid.fillCorrect(cell, record);
      setMsg('');
    } else {
      grid.markIncorrect(cell);
      setMsg('Not a match — try another.', 'warn');
    }
    renderCounter();

    const solvedAll = grid.outcomes().filter((o) => o === 'correct').length === 9;
    if (solvedAll || game.remaining === 0) {
      game = state.markCompleted(game);
      finish(true);
    }
  }

  function finish(justCompleted) {
    autocomplete.setEnabled(false);
    autocomplete.root.style.display = 'none';
    if (justCompleted) {
      state.recordCompletion(puzzleDate);
      analytics.logComplete(puzzleDate);
      renderStreak();
    }
    clear(footer);
    const shareBtn = el('button', {
      class: 'share-btn',
      text: 'Share result',
      onclick: async () => {
        const text = buildShareText({
          puzzleDate,
          islands: puzzle.island_codes,
          outcomes: grid.outcomes(),
          guesses: game.guesses,
        });
        await copyShare(text);
        analytics.logShare(puzzleDate);
        setMsg('Copied — paste it anywhere.');
      },
    });
    footer.appendChild(shareBtn);
  }
}

start();
