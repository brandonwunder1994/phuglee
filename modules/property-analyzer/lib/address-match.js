/**
 * Shared address identity for dedupe (client + server).
 * Same property must never re-enter the scan queue or re-scan.
 */

const STREET_ABBR = {
  street: 'st', st: 'st', avenue: 'ave', ave: 'ave', road: 'rd', rd: 'rd',
  drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln', boulevard: 'blvd', blvd: 'blvd',
  court: 'ct', ct: 'ct', circle: 'cir', cir: 'cir', way: 'way', place: 'pl', pl: 'pl',
  terrace: 'ter', ter: 'ter', trail: 'trl', trl: 'trl', parkway: 'pkwy', pkwy: 'pkwy',
  highway: 'hwy', hwy: 'hwy', north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw'
};

const STATE_MAP = {
  texas: 'tx', florida: 'fl', georgia: 'ga', ohio: 'oh', colorado: 'co',
  arizona: 'az', 'north carolina': 'nc', wyoming: 'wy', california: 'ca',
  indiana: 'in', tennessee: 'tn', alabama: 'al', mississippi: 'ms',
  louisiana: 'la', missouri: 'mo', oklahoma: 'ok', kansas: 'ks',
  nebraska: 'ne', 'south carolina': 'sc', virginia: 'va', 'west virginia': 'wv',
  michigan: 'mi', illinois: 'il', wisconsin: 'wi', minnesota: 'mn', iowa: 'ia',
  arkansas: 'ar', kentucky: 'ky', pennsylvania: 'pa', 'new york': 'ny',
  'new jersey': 'nj', massachusetts: 'ma', connecticut: 'ct', maryland: 'md',
  washington: 'wa', oregon: 'or', nevada: 'nv', utah: 'ut', 'new mexico': 'nm',
  montana: 'mt', idaho: 'id', 'north dakota': 'nd', 'south dakota': 'sd'
};

function normToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[#.,/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addressMatchKey(r) {
  if (!r || typeof r !== 'object') return '';
  const streetPart = normToken(r.street || String(r.address || '').split(',')[0] || '')
    .replace(/\b([a-z0-9]+)\b/g, (m) => STREET_ABBR[m] || m);
  const city = normToken(r.city || '');
  let state = normToken(r.state || '');
  if (state.length > 2) {
    state = STATE_MAP[state] || state.slice(0, 2);
  }
  const zip = normToken(r.postal || r.zip || '').replace(/\s+/g, '').slice(0, 5);
  if (!streetPart) return '';
  return [streetPart, city, state, zip].filter(Boolean).join('|');
}

/** Coarser key (street + city + state) when zip differs between lists. */
function addressMatchKeyLoose(r) {
  const full = addressMatchKey(r);
  if (!full) return '';
  const parts = full.split('|');
  if (parts.length <= 3) return full;
  return parts.slice(0, 3).join('|');
}

function buildKnownAddressKeySet(results = [], records = []) {
  const exact = new Set();
  const loose = new Set();
  for (const row of [...(results || []), ...(records || [])]) {
    const k = addressMatchKey(row);
    if (k) exact.add(k);
    const l = addressMatchKeyLoose(row);
    if (l) loose.add(l);
  }
  return { exact, loose };
}

/**
 * Filter incoming scan-queue rows against known scanned/pending rows.
 * @returns {{ kept, skippedExact, skippedLoose, skippedInFile }}
 */
function dedupeIncomingAgainstKnown(incoming, known) {
  const exact = known?.exact instanceof Set ? known.exact : new Set();
  const loose = known?.loose instanceof Set ? known.loose : new Set();
  const seenExact = new Set();
  const seenLoose = new Set();
  const kept = [];
  let skippedExact = 0;
  let skippedLoose = 0;
  let skippedInFile = 0;

  for (const row of incoming || []) {
    const k = addressMatchKey(row);
    const l = addressMatchKeyLoose(row);
    if (!k) {
      kept.push(row);
      continue;
    }
    if (exact.has(k) || seenExact.has(k)) {
      if (seenExact.has(k)) skippedInFile += 1;
      else skippedExact += 1;
      continue;
    }
    // Loose match only when zip missing on either side would still hit exact path;
    // here: if loose matches known and new row has no zip, treat as dup.
    if (l && loose.has(l) && !String(row.postal || row.zip || '').trim()) {
      skippedLoose += 1;
      continue;
    }
    if (l && seenLoose.has(l) && !String(row.postal || row.zip || '').trim()) {
      skippedInFile += 1;
      continue;
    }
    seenExact.add(k);
    if (l) seenLoose.add(l);
    kept.push(row);
  }

  return {
    kept,
    skippedExact,
    skippedLoose,
    skippedInFile,
    skippedTotal: skippedExact + skippedLoose + skippedInFile
  };
}

module.exports = {
  addressMatchKey,
  addressMatchKeyLoose,
  buildKnownAddressKeySet,
  dedupeIncomingAgainstKnown
};
