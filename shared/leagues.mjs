// The column pool. `sport` drives the sport-mix guardrail; `bloc` splits the
// pool into the US leagues and the international leagues so every grid can be
// forced to span both (KTD, composer guardrail).
//
// `source` records how the league's rosters are ingested:
//   'wikidata' — P54 team membership where the team's P118 league is `qid`
//   'cricsheet' — squads parsed from Cricsheet match data (CPL has no usable
//                 Wikidata squad coverage)

export const LEAGUES = [
  { code: 'MLB', name: 'Major League Baseball', qid: 'Q1163715', sport: 'baseball', bloc: 'us', source: 'wikidata' },
  { code: 'NBA', name: 'National Basketball Association', qid: 'Q155223', sport: 'basketball', bloc: 'us', source: 'wikidata' },
  { code: 'NFL', name: 'National Football League', qid: 'Q1215884', sport: 'american-football', bloc: 'us', source: 'wikidata' },
  { code: 'WNBA', name: "Women's National Basketball Association", qid: 'Q2593221', sport: 'basketball', bloc: 'us', source: 'wikidata' },
  { code: 'EPL', name: 'Premier League', qid: 'Q9448', sport: 'soccer', bloc: 'intl', source: 'wikidata' },
  { code: 'IPL', name: 'Indian Premier League', qid: 'Q396412', sport: 'cricket', bloc: 'intl', source: 'wikidata' },
  { code: 'CPL', name: 'Caribbean Premier League', qid: 'Q5039412', sport: 'cricket', bloc: 'intl', source: 'cricsheet' },
];

const BY_CODE = new Map(LEAGUES.map((l) => [l.code, l]));

export function leagueByCode(code) {
  return BY_CODE.get(code);
}

export const LEAGUE_CODES = LEAGUES.map((l) => l.code);
export const US_LEAGUES = LEAGUES.filter((l) => l.bloc === 'us').map((l) => l.code);
export const INTL_LEAGUES = LEAGUES.filter((l) => l.bloc === 'intl').map((l) => l.code);
