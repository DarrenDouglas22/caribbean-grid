// Tier 2 national-team sources. Each entry grants Tier 2 eligibility for its
// island to every P54 member of the team, regardless of birthplace (that is the
// point of Tier 2 — it catches heritage internationals the birthplace filter
// misses, e.g. England-born Jamaica footballers in the EPL).
//
// QID verification: Q912881 (West Indies cricket) is confirmed. The football
// national-team QIDs below are the well-known ones; the ingest logs any team
// returning zero members so a wrong or missing QID surfaces on the first run
// (see wikidata.mjs). Extend this table as coverage is confirmed — it is the
// single place national-team scope is declared.

export const NATIONAL_TEAMS = [
  // West Indies cricket represents the English-speaking Caribbean collectively.
  // The transform maps each capped player to their home island via birthplace;
  // see wikidata-transform (WI caps without a pool birthplace are recorded but
  // not island-attributed).
  { qid: 'Q912881', island: 'WI', sport: 'cricket', name: 'West Indies cricket team' },

  // Senior football (soccer) national teams, one per pool island.
  { qid: 'Q80531', island: 'JM', sport: 'soccer', name: 'Jamaica national football team' },
  { qid: 'Q726835', island: 'TT', sport: 'soccer', name: 'Trinidad and Tobago national football team' },
  { qid: 'Q842587', island: 'HT', sport: 'soccer', name: 'Haiti national football team' },
  { qid: 'Q734266', island: 'CU', sport: 'soccer', name: 'Cuba national football team' },
  { qid: 'Q747483', island: 'BB', sport: 'soccer', name: 'Barbados national football team' },
  { qid: 'Q916546', island: 'GY', sport: 'soccer', name: 'Guyana national football team' },
  { qid: 'Q734763', island: 'DO', sport: 'soccer', name: 'Dominican Republic national football team' },
  { qid: 'Q1349611', island: 'GD', sport: 'soccer', name: 'Grenada national football team' },
  { qid: 'Q844948', island: 'LC', sport: 'soccer', name: 'Saint Lucia national football team' },
  { qid: 'Q736950', island: 'SR', sport: 'soccer', name: 'Suriname national football team' },
  { qid: 'Q1155006', island: 'CW', sport: 'soccer', name: 'Curacao national football team' },
];
