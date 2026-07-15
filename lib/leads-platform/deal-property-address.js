'use strict';

/**
 * Canonical property address for Contract Tracker deals.
 * Prefer the linked lead (catalog) over denormalized deal fields so GHL/sync
 * cannot leave street from one property with city/state/zip from another.
 */

function slug(v) {
  return String(v == null ? '' : v).trim();
}

function partsFromRecord(rec) {
  if (!rec || typeof rec !== 'object') {
    return { address: '', city: '', state: '', zip: '' };
  }
  return {
    address: slug(rec.address || rec.street || rec.address1),
    city: slug(rec.city),
    state: slug(rec.state).toUpperCase().slice(0, 2),
    zip: slug(rec.zip || rec.postalCode || rec.postal)
  };
}

function isComplete(parts) {
  return Boolean(parts.address && parts.city && parts.state);
}

function stripCityFromStreet(street, city) {
  let out = slug(street);
  const c = slug(city);
  if (out && c && out.toLowerCase().includes(c.toLowerCase())) {
    const cut = out.toLowerCase().lastIndexOf(c.toLowerCase());
    if (cut > 0) out = out.slice(0, cut).replace(/[,\s]+$/, '');
  }
  return out;
}

function streetRoughMatch(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na.includes(nb.slice(0, Math.min(12, nb.length)))
    || nb.includes(na.slice(0, Math.min(12, na.length)));
}

/**
 * @param {object|null} deal
 * @param {object|null} lead linked catalog lead (optional)
 * @returns {{
 *   address: string, city: string, state: string, zip: string,
 *   street: string, cityLine: string, propertyLine: string, source: string
 * }}
 */
function resolveDealPropertyAddress(deal, lead = null) {
  const dealParts = partsFromRecord(deal);
  const leadParts = partsFromRecord(lead);

  let chosen;
  let source;

  // Linked lead with a complete address is always authoritative.
  if (isComplete(leadParts)) {
    chosen = leadParts;
    source = 'lead';
  } else if (leadParts.address && isComplete(dealParts)
    && !streetRoughMatch(leadParts.address, dealParts.address)) {
    // Different street on lead vs deal — never keep deal's city/state with another street.
    chosen = leadParts;
    source = 'lead-partial';
  } else if (isComplete(dealParts)) {
    chosen = dealParts;
    source = 'deal';
  } else if (leadParts.address) {
    // Partial lead — never mix lead street with deal city/state/zip.
    chosen = leadParts;
    source = 'lead-partial';
  } else {
    chosen = dealParts;
    source = 'deal';
  }

  const street = stripCityFromStreet(chosen.address, chosen.city) || chosen.address;
  const cityLine = [chosen.city, [chosen.state, chosen.zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const propertyLine = street && cityLine
    ? `${street}, ${cityLine}`
    : (street || cityLine || '');

  return {
    address: street,
    city: chosen.city,
    state: chosen.state,
    zip: chosen.zip,
    street,
    cityLine,
    propertyLine,
    source
  };
}

module.exports = {
  resolveDealPropertyAddress,
  partsFromRecord,
  isComplete,
  stripCityFromStreet,
  streetRoughMatch
};
