/**
 * Internal US address parse + standardize for Filter / skip-trace exports.
 * No third-party geocoder required for embedded city/state/zip recovery.
 */

'use strict';

const STATE_NAME_TO_ABBR = Object.freeze({
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN',
  texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC'
});

const STATE_ABBRS = new Set(Object.values(STATE_NAME_TO_ABBR));

/** Street suffix → USPS preferred abbreviation (export style). */
const STREET_SUFFIX = Object.freeze({
  street: 'St', streets: 'St', st: 'St', str: 'St',
  avenue: 'Ave', avenues: 'Ave', ave: 'Ave', av: 'Ave',
  boulevard: 'Blvd', blvd: 'Blvd', boul: 'Blvd',
  drive: 'Dr', drives: 'Dr', dr: 'Dr', drv: 'Dr',
  road: 'Rd', roads: 'Rd', rd: 'Rd',
  lane: 'Ln', lanes: 'Ln', ln: 'Ln',
  court: 'Ct', courts: 'Ct', ct: 'Ct',
  circle: 'Cir', circles: 'Cir', cir: 'Cir', crcl: 'Cir',
  place: 'Pl', places: 'Pl', pl: 'Pl',
  terrace: 'Ter', terr: 'Ter', ter: 'Ter',
  highway: 'Hwy', hwy: 'Hwy',
  parkway: 'Pkwy', pkwy: 'Pkwy',
  trail: 'Trl', trl: 'Trl',
  way: 'Way',
  loop: 'Loop',
  path: 'Path',
  pike: 'Pike',
  alley: 'Aly', aly: 'Aly',
  square: 'Sq', sq: 'Sq',
  crossing: 'Xing', xing: 'Xing',
  cove: 'Cv', cv: 'Cv',
  creek: 'Crk', crk: 'Crk',
  ridge: 'Rdg', rdg: 'Rdg',
  point: 'Pt', pt: 'Pt',
  run: 'Run',
  pass: 'Pass',
  bend: 'Bend',
  row: 'Row',
  walk: 'Walk',
  plaza: 'Plz', plz: 'Plz',
  expressway: 'Expy', expy: 'Expy',
  freeway: 'Fwy', fwy: 'Fwy',
  turnpike: 'Tpke', tpke: 'Tpke'
});

const DIR_EXPAND = Object.freeze({
  n: 'N', north: 'N',
  s: 'S', south: 'S',
  e: 'E', east: 'E',
  w: 'W', west: 'W',
  ne: 'NE', 'north east': 'NE', northeast: 'NE',
  nw: 'NW', 'north west': 'NW', northwest: 'NW',
  se: 'SE', 'south east': 'SE', southeast: 'SE',
  sw: 'SW', 'south west': 'SW', southwest: 'SW'
});

const SMALL_WORDS = new Set(['of', 'the', 'and', 'at', 'on', 'in', 'to', 'for', 'a', 'an']);

function collapseWs(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleCaseWord(word, index) {
  const raw = String(word || '');
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (/^\d/.test(raw)) return raw.toUpperCase() === raw ? raw : raw;
  if (/^(ne|nw|se|sw|[nsew])$/i.test(raw)) return raw.toUpperCase();
  if (index > 0 && SMALL_WORDS.has(lower)) return lower;
  if (/^[A-Z]{2,}$/.test(raw) && raw.length <= 3) return raw;
  // Keep mixed unit tokens like 9th, McDonald-ish handled simply
  if (/^\d+(st|nd|rd|th)$/i.test(raw)) {
    return raw.replace(/(st|nd|rd|th)$/i, (m) => m.toLowerCase());
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCaseCity(city) {
  const c = collapseWs(city);
  if (!c) return '';
  // Preserve hyphenated Mentor-on-the-Lake style
  return c
    .split(/(\s|-)/)
    .map((part, i, arr) => {
      if (part === ' ' || part === '-') return part;
      // "on" / "the" mid hyphenated city
      const prev = arr[i - 1];
      if (prev === '-' && SMALL_WORDS.has(part.toLowerCase())) return part.toLowerCase();
      return titleCaseWord(part, i === 0 ? 0 : 1);
    })
    .join('');
}

/**
 * Normalize state to USPS 2-letter. Accepts full name, abbr, or junk like "LONGVIEW, TEXAS 75602".
 * Returns { state, zipFromState?, cityFromState? }.
 */
function normalizeState(raw) {
  let text = collapseWs(raw);
  if (!text || text === '**') return { state: '' };

  // Embedded "CITY, STATE ZIP" dumped into State column
  const embedded = text.match(/^([A-Za-z .'-]+),\s*([A-Za-z .]+)\s+(\d{5})(?:-\d{4})?$/i);
  if (embedded) {
    const st = normalizeStateToken(embedded[2]);
    return {
      state: st,
      cityFromState: titleCaseCity(embedded[1]),
      zipFromState: embedded[3]
    };
  }

  // "LONGVIEW, TX 7:" style truncation
  const trunc = text.match(/^([A-Za-z .'-]+),\s*([A-Z]{2})\b/i);
  if (trunc && /,/i.test(text)) {
    return {
      state: normalizeStateToken(trunc[2]),
      cityFromState: titleCaseCity(trunc[1])
    };
  }

  return { state: normalizeStateToken(text) };
}

function normalizeStateToken(raw) {
  const text = collapseWs(raw).replace(/\./g, '');
  if (!text) return '';
  const upper = text.toUpperCase();
  if (upper.length === 2 && STATE_ABBRS.has(upper)) return upper;
  const fromName = STATE_NAME_TO_ABBR[text.toLowerCase()];
  return fromName || '';
}

function extractZip(text) {
  const m = String(text || '').match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : '';
}

/**
 * Pull street / city / state / zip out of a single-line address when present.
 */
function parseEmbeddedAddress(streetRaw, hints = {}) {
  let street = collapseWs(streetRaw);
  let city = collapseWs(hints.city || '');
  let stateInfo = normalizeState(hints.state || '');
  let state = stateInfo.state;
  let zip = extractZip(hints.zip || hints.postalCode || hints.postal || '') || stateInfo.zipFromState || '';
  // Prefer city recovered from a corrupted State cell (e.g. "LONGVIEW, TEXAS 75602")
  if (stateInfo.cityFromState) city = stateInfo.cityFromState;

  if (!street) {
    return { street: '', city, state, zip, junk: true, reason: 'empty_street' };
  }

  // Obvious non-address junk
  if (/^\d+\s+of\s+\d+$/i.test(street)) {
    return { street: '', city, state, zip, junk: true, reason: 'page_marker' };
  }
  if (/^P\d+[A-Z]?-\d+$/i.test(street)) {
    return { street: '', city, state, zip, junk: true, reason: 'parcel_id' };
  }
  if (/^CE-\d+/i.test(street) && street.length > 80) {
    // Try to salvage first street-like token after a case id
    const salvaged = street.match(/\bCE-\d+[A-Z0-9-]*\s+(\d+\s+[A-Za-z0-9 .'-]+?)(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4}|\s+CE-|$)/i);
    if (salvaged) {
      street = collapseWs(salvaged[1]);
    } else {
      return { street: '', city, state, zip, junk: true, reason: 'case_blob' };
    }
  }

  // Strip leading parcel / case prefixes: "050-010532 Jeannette Rd, ..."
  street = street.replace(/^(?:\d{2,3}-\d{4,}\s+)+/i, '');
  street = street.replace(/^(?:CE-\d+[A-Z0-9-]*\s+)/i, '');

  // Pattern: "123 Main St, City, ST 12345" or "123 Main St, City, State, 12345"
  const full =
    street.match(
      /^(.+?),\s*([A-Za-z .'-]+),\s*([A-Za-z.]{2,}(?:\s+[A-Za-z.]+)?),?\s+(\d{5})(?:-\d{4})?\s*$/i
    ) ||
    street.match(
      /^(.+?),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*$/i
    );

  if (full) {
    street = collapseWs(full[1]);
    city = titleCaseCity(full[2]) || city;
    state = normalizeStateToken(full[3]) || state;
    zip = full[4] || zip;
  } else {
    // "123 Main St, City, ST" (no zip)
    const noZip = street.match(/^(.+?),\s*([A-Za-z .'-]+),\s*([A-Za-z.]{2,}(?:\s+[A-Za-z.]+)?)\s*$/i);
    if (noZip && normalizeStateToken(noZip[3])) {
      street = collapseWs(noZip[1]);
      city = titleCaseCity(noZip[2]) || city;
      state = normalizeStateToken(noZip[3]) || state;
    } else {
      let handled = false;

      // "854 Courting Ln Nw Lilburn, Georgia, 30047"
      const suffixAlt = Object.keys(STREET_SUFFIX).join('|');
      const dirAlt = 'N|S|E|W|NE|NW|SE|SW|North|South|East|West|Northwest|Northeast|Southwest|Southeast';
      const jammed = street.match(
        new RegExp(
          `^(\\d+\\s+.+?\\b(?:${suffixAlt})\\b(?:\\s+(?:${dirAlt}))?)\\s+([A-Za-z .'-]{2,}),\\s*([A-Za-z.]{2,}(?:\\s+[A-Za-z.]+)?),?\\s+(\\d{5})(?:-\\d{4})?\\s*$`,
          'i'
        )
      );
      if (jammed && normalizeStateToken(jammed[3])) {
        street = collapseWs(jammed[1]);
        city = titleCaseCity(jammed[2]) || city;
        state = normalizeStateToken(jammed[3]) || state;
        zip = jammed[4] || zip;
        handled = true;
      }

      // Split on known city token when street still contains "… City, State ZIP"
      if (!handled && city) {
        const cityRe = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const splitOnCity = street.match(
          new RegExp(
            `^(.+?)\\s+${cityRe}\\s*,\\s*([A-Za-z.]{2,}(?:\\s+[A-Za-z.]+)?),?\\s+(\\d{5})(?:-\\d{4})?\\s*$`,
            'i'
          )
        );
        if (splitOnCity && normalizeStateToken(splitOnCity[2])) {
          street = collapseWs(splitOnCity[1]);
          state = normalizeStateToken(splitOnCity[2]) || state;
          zip = splitOnCity[3] || zip;
          handled = true;
        }
      }

      if (!handled) {
        // Trailing ", City, State ZIP" already mirrored in columns — strip duplicate tail
        if (city && state) {
          const cityRe = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const stateName = Object.keys(STATE_NAME_TO_ABBR).find((k) => STATE_NAME_TO_ABBR[k] === state) || '';
          const stateRe = stateName
            ? `(?:${state}|${stateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`
            : state;
          const tail = new RegExp(
            `,\\s*${cityRe}\\s*,\\s*${stateRe}\\s*(?:\\d{5}(?:-\\d{4})?)?\\s*$`,
            'i'
          );
          if (tail.test(street)) {
            const z = extractZip(street);
            if (z) zip = zip || z;
            street = collapseWs(street.replace(tail, ''));
          }
        }
        // Bare trailing zip on otherwise clean street
        const trailZip = street.match(/^(.*?)[,\s]+(\d{5})(?:-\d{4})?\s*$/);
        if (trailZip && !/,/.test(trailZip[1])) {
          street = collapseWs(trailZip[1]);
          zip = zip || trailZip[2];
        } else if (!zip) {
          const z = extractZip(street);
          if (z) {
            zip = z;
            street = collapseWs(
              street.replace(new RegExp(`\\b${z}(?:-\\d{4})?\\b`), '').replace(/,\s*$/, '')
            );
          }
        }
      }
    }
  }

  street = standardizeStreet(street);
  city = titleCaseCity(city);
  state = normalizeStateToken(state);
  zip = extractZip(zip) || '';

  const looksAddress = /^\d+[A-Za-z]?\b/.test(street) && street.length >= 5;
  if (!looksAddress) {
    return { street, city, state, zip, junk: true, reason: 'no_street_number' };
  }

  return { street, city, state, zip, junk: false, reason: '' };
}

function standardizeStreet(raw) {
  let s = collapseWs(raw)
    .replace(/[|]+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*$/g, '');

  // Normalize & intersections lightly
  s = s.replace(/\s+&\s+/g, ' & ');

  const parts = s.split(/\s+/);
  if (!parts.length) return '';

  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    let token = parts[i].replace(/^[,\.]+|[,\.]+$/g, '');
    if (!token) continue;
    const lower = token.toLowerCase().replace(/\./g, '');

    if (i === 0 && /^\d+[A-Za-z]?$/.test(token)) {
      out.push(token.toUpperCase());
      continue;
    }

    if (DIR_EXPAND[lower] && (i === 1 || i === parts.length - 1 || i === parts.length - 2)) {
      out.push(DIR_EXPAND[lower]);
      continue;
    }

    if (STREET_SUFFIX[lower] && i === parts.length - 1) {
      out.push(STREET_SUFFIX[lower]);
      continue;
    }

    // Unit designators
    if (/^(apt|apartment|unit|ste|suite|bldg|building|#)$/i.test(lower)) {
      const label = lower === '#' ? '#' : titleCaseWord(lower === 'apartment' ? 'Apt' : lower === 'suite' ? 'Ste' : lower === 'building' ? 'Bldg' : lower, 0);
      out.push(label);
      continue;
    }

    out.push(titleCaseWord(token, i));
  }

  return collapseWs(out.join(' '));
}

/**
 * Normalize one Filter / enrichment row into skip-trace columns.
 * @param {object} row
 * @returns {{ streetAddress: string, city: string, state: string, zip: string, junk: boolean, reason: string, sourceStreet: string }}
 */
function normalizeAddressRow(row = {}) {
  const sourceStreet = String(row['Street Address'] || row.streetAddress || row.address || '').trim();
  const parsed = parseEmbeddedAddress(sourceStreet, {
    city: row.City || row.city,
    state: row.State || row.state,
    zip: row['Postal Code'] || row['Zip Code'] || row.zip || row.postalCode
  });

  return {
    streetAddress: parsed.street,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    junk: Boolean(parsed.junk),
    reason: parsed.reason || '',
    sourceStreet
  };
}

function isCompleteAddress(row) {
  return Boolean(
    row &&
      String(row.streetAddress || '').trim() &&
      String(row.city || '').trim() &&
      String(row.state || '').trim() &&
      /^\d{5}$/.test(String(row.zip || '').trim())
  );
}

module.exports = {
  STATE_NAME_TO_ABBR,
  normalizeState,
  normalizeStateToken,
  normalizeAddressRow,
  parseEmbeddedAddress,
  standardizeStreet,
  titleCaseCity,
  extractZip,
  isCompleteAddress
};
