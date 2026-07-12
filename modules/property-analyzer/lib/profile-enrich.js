/**
 * Match third-party profile stacks onto existing Analyzer records/results.
 * Writes only extra fields — never replaces scan scores, imagery, or manual edits.
 */

const STREET_ABBR = {
  street: 'st',
  st: 'st',
  avenue: 'ave',
  ave: 'ave',
  road: 'rd',
  rd: 'rd',
  drive: 'dr',
  dr: 'dr',
  lane: 'ln',
  ln: 'ln',
  boulevard: 'blvd',
  blvd: 'blvd',
  court: 'ct',
  ct: 'ct',
  circle: 'cir',
  cir: 'cir',
  way: 'way',
  place: 'pl',
  pl: 'pl',
  terrace: 'ter',
  ter: 'ter',
  trail: 'trl',
  trl: 'trl',
  parkway: 'pkwy',
  pkwy: 'pkwy',
  highway: 'hwy',
  hwy: 'hwy',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw'
};

function normToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[#.]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normStreet(street) {
  const parts = normToken(street).split(' ').filter(Boolean);
  return parts.map((p) => STREET_ABBR[p] || p).join(' ');
}

function normState(state) {
  return normToken(state).slice(0, 2);
}

function normZip(zip) {
  return String(zip || '').replace(/\D/g, '').slice(0, 5);
}

function fullKey(street, city, state, zip) {
  return [normStreet(street), normToken(city), normState(state), normZip(zip)].join('|');
}

function streetCityKey(street, city, state) {
  return [normStreet(street), normToken(city), normState(state)].join('|');
}

function partsFromRecord(r) {
  const street = r.street || String(r.address || '').split(',')[0] || '';
  const city = r.city || '';
  const state = r.state || '';
  const zip = r.postal || r.zip || '';
  return { street, city, state, zip };
}

function hasUsefulProfile(p) {
  if (!p || typeof p !== 'object') return false;
  return !!(
    p.marketValue ||
    p.avm ||
    p.wholesaleValue ||
    p.beds ||
    p.squareFootage ||
    p.yearBuilt ||
    p.mailingStreet ||
    (Array.isArray(p.phones) && p.phones.length) ||
    (Array.isArray(p.emails) && p.emails.length) ||
    p.county ||
    p.propertyType
  );
}

function applyProfilePatch(target, patch) {
  if (!target || !patch || !patch.profile || typeof patch.profile !== 'object') {
    return false;
  }
  if (hasUsefulProfile(target.profile) && (target.profile.marketValue || target.marketValue)) {
    return false;
  }

  target.profile = { ...patch.profile };
  if (patch.marketValue) target.marketValue = patch.marketValue;
  else if (patch.profile.marketValue) target.marketValue = patch.profile.marketValue;
  if (patch.avm) target.avm = patch.avm;
  else if (patch.profile.avm) target.avm = patch.profile.avm;
  if (patch.wholesaleValue) target.wholesaleValue = patch.wholesaleValue;
  else if (patch.profile.wholesaleValue) target.wholesaleValue = patch.profile.wholesaleValue;

  if (patch.county && !target.county) target.county = patch.county;
  if (patch.ownerType && !target.ownerType) target.ownerType = patch.ownerType;
  if (patch.ownerName && !target.ownerName) target.ownerName = patch.ownerName;
  if (patch.firstName && !target.firstName) target.firstName = patch.firstName;
  if (patch.lastName && !target.lastName) target.lastName = patch.lastName;
  if (patch.phone && !target.phone) target.phone = patch.phone;
  if (patch.email && !target.email) target.email = patch.email;

  const latRaw = patch.latitude || patch.profile.latitude;
  const lngRaw = patch.longitude || patch.profile.longitude;
  if (latRaw != null && latRaw !== '' && target.lat == null && target.latitude == null) {
    const lat = Number(latRaw);
    if (Number.isFinite(lat)) target.lat = lat;
    target.latitude = String(latRaw);
  }
  if (lngRaw != null && lngRaw !== '' && target.lng == null && target.longitude == null) {
    const lng = Number(lngRaw);
    if (Number.isFinite(lng)) target.lng = lng;
    target.longitude = String(lngRaw);
  }
  return true;
}

/**
 * Apply address-keyed profile patches onto session records + results.
 * @returns {{ session, resultsUpdated, recordsUpdated, unmatched, alreadyHad }}
 */
function applyProfilePatchesToSession(session, patches) {
  const base = session && typeof session === 'object' ? session : {};
  const results = Array.isArray(base.results) ? base.results.slice() : [];
  const records = Array.isArray(base.records) ? base.records.slice() : [];

  const byFull = new Map();
  const byStreetCity = new Map();

  function indexRow(list, i, kind) {
    const r = list[i];
    const { street, city, state, zip } = partsFromRecord(r);
    const fk = fullKey(street, city, state, zip);
    const sk = streetCityKey(street, city, state);
    if (fk && !fk.startsWith('|')) {
      if (!byFull.has(fk)) byFull.set(fk, []);
      byFull.get(fk).push({ kind, i });
    }
    if (sk) {
      if (!byStreetCity.has(sk)) byStreetCity.set(sk, []);
      byStreetCity.get(sk).push({ kind, i });
    }
  }

  for (let i = 0; i < results.length; i++) indexRow(results, i, 'results');
  for (let i = 0; i < records.length; i++) indexRow(records, i, 'records');

  let resultsUpdated = 0;
  let recordsUpdated = 0;
  let unmatched = 0;
  let alreadyHad = 0;

  for (const patch of patches || []) {
    if (!patch || !patch.profile) {
      unmatched++;
      continue;
    }
    const street = patch.street || String(patch.address || '').split(',')[0] || '';
    const city = patch.city || '';
    const state = patch.state || '';
    const zip = patch.postal || patch.zip || '';
    const fk = fullKey(street, city, state, zip);
    const sk = streetCityKey(street, city, state);
    const hits = (fk && byFull.get(fk)) || byStreetCity.get(sk) || [];
    if (!hits.length) {
      unmatched++;
      continue;
    }
    for (const hit of hits) {
      const row = hit.kind === 'results' ? results[hit.i] : records[hit.i];
      const before = hasUsefulProfile(row.profile) && (row.profile.marketValue || row.marketValue);
      if (before) {
        alreadyHad++;
        continue;
      }
      if (applyProfilePatch(row, patch)) {
        if (hit.kind === 'results') resultsUpdated++;
        else recordsUpdated++;
      } else {
        alreadyHad++;
      }
    }
  }

  const next = {
    ...base,
    results,
    records,
    savedAt: Date.now()
  };

  return {
    session: next,
    resultsUpdated,
    recordsUpdated,
    unmatched,
    alreadyHad
  };
}

module.exports = {
  fullKey,
  streetCityKey,
  partsFromRecord,
  hasUsefulProfile,
  applyProfilePatch,
  applyProfilePatchesToSession
};
