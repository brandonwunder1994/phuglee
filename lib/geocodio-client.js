/**
 * Geocodio batch client + result → 4-column address mapping.
 */

const GEOCODIO_BATCH_URL = 'https://api.geocod.io/v2/geocode';

const CLEAN_HEADERS = Object.freeze([
  'Street Address',
  'City',
  'State',
  'Zip Code'
]);

/**
 * @param {object} components
 * @param {string[]} [addressLines]
 * @returns {{ 'Street Address': string, City: string, State: string, 'Zip Code': string } | null}
 */
function mapGeocodioResultToCleanRow(components, addressLines) {
  const c = components && typeof components === 'object' ? components : {};
  const lines = Array.isArray(addressLines) ? addressLines : [];

  let street = String(lines[0] || '').trim();
  if (!street) {
    const parts = [
      c.number,
      c.predirectional,
      c.formatted_street || [c.prefix, c.street, c.suffix].filter(Boolean).join(' '),
      c.postdirectional
    ]
      .map((p) => String(p || '').trim())
      .filter(Boolean);
    street = parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  const city = String(c.city || '').trim();
  const state = String(c.state_province || c.state || '').trim();
  let zip = String(c.postal_code || c.zip || '').trim();
  // Prefer 5-digit US ZIP when ZIP+4 present
  if (/^\d{5}-\d{4}$/.test(zip)) zip = zip.slice(0, 5);

  if (!street || !city || !state || !zip) return null;

  return {
    'Street Address': street,
    City: city,
    State: state,
    'Zip Code': zip
  };
}

/**
 * Extract best clean row from a single-address Geocodio response body.
 * @param {object} responseBody
 */
function extractBestCleanRow(responseBody) {
  const results = responseBody?.results;
  if (!Array.isArray(results) || !results.length) return null;
  const best = results[0];
  return mapGeocodioResultToCleanRow(
    best.address_components,
    best.address_lines
  );
}

/**
 * From batch item: { query, response: { results: [...] } }
 * @param {object} batchItem
 */
function extractCleanRowFromBatchItem(batchItem) {
  const response = batchItem?.response;
  if (!response) return null;
  if (response.error) return null;
  return extractBestCleanRow(response);
}

/**
 * Build batch query payload entry for one input row.
 * @param {{ street?: string, city?: string, state?: string, zip?: string }} row
 * @returns {string | object}
 */
function buildQueryForRow(row) {
  const r = row && typeof row === 'object' ? row : {};
  const street = String(r.street || r.streetAddress || '').trim();
  const city = String(r.city || '').trim();
  const state = String(r.state || '').trim();
  const zip = String(r.zip || r.postalCode || '').trim();

  if (street && (city || state || zip)) {
    const q = { street };
    if (city) q.city = city;
    if (state) q.state_province = state;
    if (zip) q.postal_code = zip;
    return q;
  }
  if (street) {
    const parts = [street, city, state, zip].filter(Boolean);
    return parts.join(', ');
  }
  const line = [city, state, zip].filter(Boolean).join(', ');
  return line || '';
}

function isDailyLimitError(status, bodyText, bodyJson) {
  const msg = String(
    bodyJson?.error || bodyJson?.message || bodyText || ''
  ).toLowerCase();
  if (status === 403 || status === 429) {
    if (
      /limit|quota|exceed|daily|2500|usage|billing|overage|free tier/.test(msg)
    ) {
      return true;
    }
    // Many free-tier cutoffs still say "limit"
    if (/limit/.test(msg)) return true;
  }
  if (/daily.*(limit|quota)|exceeded.*limit|lookup limit|free tier/.test(msg)) {
    return true;
  }
  return false;
}

/**
 * @param {Array<string|object>} queries
 * @param {string} apiKey
 * @param {{ fetchImpl?: typeof fetch, limit?: number }} [opts]
 * @returns {Promise<{ ok: boolean, items?: object[], exhausted?: boolean, error?: string, status?: number }>}
 */
async function batchGeocode(queries, apiKey, opts = {}) {
  const list = Array.isArray(queries) ? queries : [];
  if (!list.length) return { ok: true, items: [] };

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'fetch is not available' };
  }

  const url = new URL(GEOCODIO_BATCH_URL);
  url.searchParams.set('api_key', apiKey);
  if (opts.limit != null) url.searchParams.set('limit', String(opts.limit));
  else url.searchParams.set('limit', '1');

  let res;
  let text;
  try {
    res = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(list)
    });
    text = await res.text();
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const exhausted = isDailyLimitError(res.status, text, json);
    return {
      ok: false,
      exhausted,
      status: res.status,
      error: json?.error || json?.message || text.slice(0, 300) || `HTTP ${res.status}`
    };
  }

  // Batch array response: { results: [ { query, response }, ... ] }
  // Batch object response: { results: { key: { query, response } } }
  const raw = json?.results;
  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === 'object') {
    items = Object.keys(raw).map((k) => raw[k]);
  }

  return { ok: true, items, status: res.status };
}

/**
 * Geocode a list of input rows with one API key (respect maxLookups).
 * @param {Array<{ street?: string, city?: string, state?: string, zip?: string }>} rows
 * @param {string} apiKey
 * @param {{ maxLookups: number, batchSize?: number, fetchImpl?: typeof fetch }} opts
 */
async function geocodeRowsWithKey(rows, apiKey, opts) {
  const maxLookups = Math.max(0, Math.floor(Number(opts.maxLookups) || 0));
  const batchSize = Math.min(500, Math.max(1, Math.floor(Number(opts.batchSize) || 100)));
  const slice = (Array.isArray(rows) ? rows : []).slice(0, maxLookups);
  const cleaned = [];
  let lookupsUsed = 0;
  let exhausted = false;
  let lastError = null;

  for (let i = 0; i < slice.length; i += batchSize) {
    const chunk = slice.slice(i, i + batchSize);
    const queries = chunk.map(buildQueryForRow);
    const result = await batchGeocode(queries, apiKey, {
      fetchImpl: opts.fetchImpl,
      limit: 1
    });

    if (!result.ok) {
      lastError = result.error || 'Geocode failed';
      if (result.exhausted) {
        exhausted = true;
        break;
      }
      // Non-limit failure: stop this key segment
      break;
    }

    lookupsUsed += chunk.length;
    const items = result.items || [];
    for (let j = 0; j < chunk.length; j += 1) {
      const item = items[j];
      const row = extractCleanRowFromBatchItem(item) || extractBestCleanRow(item?.response);
      if (row) cleaned.push(row);
    }
  }

  return {
    cleaned,
    lookupsUsed,
    exhausted,
    error: lastError,
    inputCount: slice.length
  };
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function cleanRowsToCsv(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const lines = [
    CLEAN_HEADERS.join(','),
    ...list.map((row) =>
      CLEAN_HEADERS.map((h) => escapeCsvCell(row[h] || '')).join(',')
    )
  ];
  return `${lines.join('\n')}\n`;
}

module.exports = {
  CLEAN_HEADERS,
  GEOCODIO_BATCH_URL,
  mapGeocodioResultToCleanRow,
  extractBestCleanRow,
  extractCleanRowFromBatchItem,
  buildQueryForRow,
  isDailyLimitError,
  batchGeocode,
  geocodeRowsWithKey,
  cleanRowsToCsv
};
