/**
 * Parse uploaded CSV/XLSX into address rows for Geocodio.
 */

const { parseSpreadsheet } = require('./bridge-engine/parsers/spreadsheet');
const { INTAKE_FIELD_ALIASES } = require('./bridge-intake-schema');

function normHeader(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string[]} headers
 * @returns {{ street?: string, city?: string, state?: string, zip?: string }}
 */
function mapHeadersToFields(headers) {
  const list = Array.isArray(headers) ? headers : [];
  const byNorm = new Map();
  for (const h of list) {
    byNorm.set(normHeader(h), h);
  }

  function findField(aliases) {
    for (const alias of aliases) {
      const hit = byNorm.get(normHeader(alias));
      if (hit) return hit;
    }
    // partial: header contains alias
    for (const [norm, original] of byNorm) {
      for (const alias of aliases) {
        const a = normHeader(alias);
        if (norm === a || norm.includes(a)) return original;
      }
    }
    return null;
  }

  return {
    street: findField(INTAKE_FIELD_ALIASES.streetAddress),
    city: findField(INTAKE_FIELD_ALIASES.city),
    state: findField(INTAKE_FIELD_ALIASES.state),
    zip: findField(INTAKE_FIELD_ALIASES.zip)
  };
}

/**
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {{ rows: Array<{ street: string, city: string, state: string, zip: string }>, fieldMap: object, headers: string[], totalRaw: number }}
 */
function parseAddressUpload(buffer, filename) {
  const parsed = parseSpreadsheet(buffer, filename);
  const headers = parsed.headers || [];
  const fieldMap = mapHeadersToFields(headers);

  if (!fieldMap.street) {
    const err = new Error(
      'Could not find a street address column. Expected headers like Street Address, Address, or Location.'
    );
    err.code = 'NO_STREET_COLUMN';
    throw err;
  }

  const rows = [];
  for (const raw of parsed.rows || []) {
    const street = String(raw[fieldMap.street] || '').trim();
    if (!street) continue;
    rows.push({
      street,
      city: fieldMap.city ? String(raw[fieldMap.city] || '').trim() : '',
      state: fieldMap.state ? String(raw[fieldMap.state] || '').trim() : '',
      zip: fieldMap.zip ? String(raw[fieldMap.zip] || '').trim() : ''
    });
  }

  if (!rows.length) {
    const err = new Error('No rows with a street address found in the file');
    err.code = 'NO_ADDRESS_ROWS';
    throw err;
  }

  return {
    rows,
    fieldMap,
    headers,
    totalRaw: (parsed.rows || []).length
  };
}

module.exports = {
  normHeader,
  mapHeadersToFields,
  parseAddressUpload
};
