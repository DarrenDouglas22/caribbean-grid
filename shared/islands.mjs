// KTD9 — the canonical island pool. Single source of truth consumed by the
// ingest filters, the composer's trio enumeration, and the share card's flag
// mapping so the three can never drift.
//
// `resolve` records how a birthplace maps to this territory in Wikidata:
//   'P17'   — birthplace's country (P17) is the territory itself (sovereign states)
//   'P131*' — birthplace sits inside the territory via administrative
//             containment (P131*); non-sovereign territories whose P17 is the
//             parent nation (US, UK, Netherlands, France).
//
// Pool changes are owner sign-off — island scope is eligibility scope.

export const ISLANDS = [
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲', qid: 'Q766', resolve: 'P17' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺', qid: 'Q241', resolve: 'P17' },
  { code: 'BB', name: 'Barbados', flag: '🇧🇧', qid: 'Q244', resolve: 'P17' },
  { code: 'TT', name: 'Trinidad & Tobago', flag: '🇹🇹', qid: 'Q754', resolve: 'P17' },
  { code: 'BS', name: 'Bahamas', flag: '🇧🇸', qid: 'Q778', resolve: 'P17' },
  { code: 'PR', name: 'Puerto Rico', flag: '🇵🇷', qid: 'Q1183', resolve: 'P131*' },
  { code: 'AG', name: 'Antigua & Barbuda', flag: '🇦🇬', qid: 'Q781', resolve: 'P17' },
  { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴', qid: 'Q786', resolve: 'P17' },
  { code: 'SX', name: 'Sint Maarten', flag: '🇸🇽', qid: 'Q26273', resolve: 'P131*' },
  { code: 'KY', name: 'Cayman Islands', flag: '🇰🇾', qid: 'Q5785', resolve: 'P131*' },
  { code: 'VI', name: 'US Virgin Islands', flag: '🇻🇮', qid: 'Q11703', resolve: 'P131*' },
  { code: 'VG', name: 'British Virgin Islands', flag: '🇻🇬', qid: 'Q25305', resolve: 'P131*' },
  { code: 'GD', name: 'Grenada', flag: '🇬🇩', qid: 'Q769', resolve: 'P17' },
  { code: 'LC', name: 'St Lucia', flag: '🇱🇨', qid: 'Q760', resolve: 'P17' },
  { code: 'CW', name: 'Curaçao', flag: '🇨🇼', qid: 'Q25279', resolve: 'P131*' },
  { code: 'AW', name: 'Aruba', flag: '🇦🇼', qid: 'Q21203', resolve: 'P131*' },
  { code: 'GY', name: 'Guyana', flag: '🇬🇾', qid: 'Q734', resolve: 'P17' },
  { code: 'KN', name: 'St Kitts & Nevis', flag: '🇰🇳', qid: 'Q763', resolve: 'P17' },
  { code: 'HT', name: 'Haiti', flag: '🇭🇹', qid: 'Q790', resolve: 'P17' },
  { code: 'VC', name: 'St Vincent & the Grenadines', flag: '🇻🇨', qid: 'Q757', resolve: 'P17' },
  { code: 'DM', name: 'Dominica', flag: '🇩🇲', qid: 'Q784', resolve: 'P17' },
  { code: 'SR', name: 'Suriname', flag: '🇸🇷', qid: 'Q730', resolve: 'P17' },
];

const BY_CODE = new Map(ISLANDS.map((i) => [i.code, i]));
const BY_QID = new Map(ISLANDS.map((i) => [i.qid, i]));

export function islandByCode(code) {
  return BY_CODE.get(code);
}

export function islandByQid(qid) {
  return BY_QID.get(qid);
}

export function flagFor(code) {
  const island = BY_CODE.get(code);
  return island ? island.flag : '🏳️';
}

export const ISLAND_CODES = ISLANDS.map((i) => i.code);
