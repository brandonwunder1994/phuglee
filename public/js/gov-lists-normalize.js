/* Government Lists — pure render-time normalization + de-duplication.
   Runs in the browser (window.GLNormalize) and in Node (module.exports).
   No data-file mutations: this only reshapes catalog rows in memory. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GLNormalize = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const STATE_NAME_TO_CODE = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
    florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
    indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
    maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
    minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
    nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
    'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
    'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
    pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
    vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
    wisconsin: 'WI', wyoming: 'WY',
    'puerto rico': 'PR', guam: 'GU', 'american samoa': 'AS',
    'u.s. virgin islands': 'VI', 'us virgin islands': 'VI',
    'virgin islands': 'VI', 'northern mariana islands': 'MP'
  };

  const VALID_CODES = new Set(Object.values(STATE_NAME_TO_CODE).concat(['DC']));

  function normalizeState(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    if (raw.length === 2) {
      const up = raw.toUpperCase();
      return VALID_CODES.has(up) ? up : up;
    }
    const key = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const direct = STATE_NAME_TO_CODE[raw.toLowerCase()];
    if (direct) return direct;
    if (STATE_NAME_TO_CODE[key]) return STATE_NAME_TO_CODE[key];
    return raw;
  }

  const VERIFY_RANK = { verified: 4, pdf_only: 3, email_only: 2, unverified: 1 };

  function verifyRank(status) {
    return VERIFY_RANK[status] || 0;
  }

  // Fields backfilled onto the surviving row from the weaker duplicate.
  const FILL_FIELDS = ['county', 'contactEmail', 'url', 'notes', 'requestTemplate', 'cadence', 'lastVerified'];

  function mergeKey(src, normState) {
    const city = String(src.city || '').trim().toLowerCase();
    const county = String(src.county || '').trim().toLowerCase();
    const place = city || (county ? county + '#county' : '');
    return place + '|' + normState + '|' + String(src.listType || '');
  }

  // Collapse rows that describe the same list at the same place. Keeps the row
  // with the strongest verifyStatus; backfills missing fields from the other.
  function mergeSources(sources, listTypePriority) {
    const list = Array.isArray(sources) ? sources : [];
    const map = new Map();
    const order = [];

    for (const s of list) {
      if (!s || s.isPlaybook) continue;
      const normState = normalizeState(s.state);
      const row = Object.assign({}, s, { state: normState });
      const key = mergeKey(s, normState);

      if (!map.has(key)) {
        map.set(key, row);
        order.push(key);
        continue;
      }

      const existing = map.get(key);
      const keepNew = verifyRank(row.verifyStatus) > verifyRank(existing.verifyStatus);
      const winner = keepNew ? row : existing;
      const loser = keepNew ? existing : row;

      for (const f of FILL_FIELDS) {
        if (!(winner[f] && String(winner[f]).trim()) && loser[f] && String(loser[f]).trim()) {
          winner[f] = loser[f];
        }
      }
      map.set(key, winner);
    }

    const out = order.map((k) => map.get(k));
    if (listTypePriority) {
      out.sort((a, b) => {
        const pa = listTypePriority[a.listType] || 99;
        const pb = listTypePriority[b.listType] || 99;
        if (pa !== pb) return pa - pb;
        return String(a.city || a.county || '').localeCompare(String(b.city || b.county || ''));
      });
    }
    return out;
  }

  return { normalizeState, mergeSources };
});
