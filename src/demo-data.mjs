// Demo fixture so the game is playable without a Supabase backend (preview
// mode). This is a hand-authored sample grid — not live data — used only when no
// backend is configured. Every cell is solvable; two cells show heritage (Tier
// 3) answers so the tier badges and justification are visible.

export const DEMO_PUZZLE = {
  puzzle_date: '2026-07-17',
  island_codes: ['JM', 'TT', 'BB'],
  league_codes: ['NBA', 'EPL', 'CPL'],
};

// cell "ISLAND|LEAGUE" -> answers. tier 1 born there, 3 heritage.
export const DEMO_ANSWERS = {
  'JM|NBA': [
    { name: 'Patrick Ewing', tier: 1, rarity: 62 },
    { name: 'Roy Hibbert', tier: 3, justification: 'Father is Jamaican', rarity: 9 },
  ],
  'JM|EPL': [
    { name: 'Raheem Sterling', tier: 1, rarity: 71 },
    { name: 'Leon Bailey', tier: 1, rarity: 34 },
  ],
  'JM|CPL': [
    { name: 'Andre Russell', tier: 1, rarity: 58 },
    { name: 'Chris Gayle', tier: 1, rarity: 66 },
    { name: 'Rovman Powell', tier: 1, rarity: 21 },
  ],
  'TT|NBA': [
    { name: 'Carl Herrera', tier: 1, rarity: 12 },
  ],
  'TT|EPL': [
    { name: 'Dwight Yorke', tier: 1, rarity: 55 },
    { name: 'Kenwyne Jones', tier: 1, rarity: 28 },
  ],
  'TT|CPL': [
    { name: 'Kieron Pollard', tier: 1, rarity: 61 },
    { name: 'Dwayne Bravo', tier: 1, rarity: 47 },
    { name: 'Sunil Narine', tier: 1, rarity: 44 },
  ],
  'BB|NBA': [
    { name: 'Andrew Wiggins', tier: 3, justification: 'Mother is Barbadian', rarity: 15 },
  ],
  'BB|EPL': [
    { name: 'Emmerson Boyce', tier: 1, rarity: 8 },
  ],
  'BB|CPL': [
    { name: 'Jason Holder', tier: 1, rarity: 52 },
    { name: 'Jofra Archer', tier: 1, rarity: 49 },
    { name: 'Kyle Mayers', tier: 1, rarity: 31 },
  ],
};

// A few decoys so the autocomplete has plausible wrong answers too.
const DECOYS = ['Usain Bolt', 'Brian Lara', 'Rihanna Fenty', 'Marcus Rashford', 'LeBron James', 'Shai Gilgeous-Alexander'];

// Flat player list for autocomplete: every answer + decoys, deduped, each with a
// stable id.
export const DEMO_PLAYERS = (() => {
  const names = new Set();
  for (const answers of Object.values(DEMO_ANSWERS)) for (const a of answers) names.add(a.name);
  for (const d of DECOYS) names.add(d);
  return [...names].map((name, i) => ({ player_id: i + 1, display_name: name }));
})();

export const DEMO_NAME_BY_ID = new Map(DEMO_PLAYERS.map((p) => [p.player_id, p.display_name]));
