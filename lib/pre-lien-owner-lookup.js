'use strict';

const config = require('./config');
const {
  extractOwnersFromDetailRaw,
  bestScoreAgainstOwners,
  applyOwnerMatchToRow,
  scoreDefendantVsOwner
} = require('./pre-lien-owner-match');

const MAX_ROWS = 40;
const CONCURRENCY = 3;

function lookupAvailable() {
  return Boolean(config.REALESTATE_API_KEY);
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function createOwnerLookupClient() {
  const apiKey = config.REALESTATE_API_KEY;
  const baseUrl = config.REALESTATE_API_BASE || 'https://api.realestateapi.com';
  if (!apiKey) return null;

  const fetchImpl = globalThis.fetch;
  return {
    async propertyDetailRaw(body) {
      const res = await fetchImpl(`${baseUrl}/v2/PropertyDetail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(body)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json.message || json.statusMessage || `REAPI ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return json;
    }
  };
}

/**
 * Enrich rows with owner lookup + defendant match.
 * @param {object[]} rows
 * @param {{ lookup?: boolean }} [opts]
 */
async function enrichRowsWithOwnerMatch(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows.slice(0, MAX_ROWS) : [];
  const wantLookup = opts.lookup !== false;
  const client = wantLookup ? createOwnerLookupClient() : null;
  const stats = {
    matched: 0,
    possible: 0,
    no_match: 0,
    no_owner: 0,
    unchecked: 0,
    lookupErrors: 0,
    lookupUsed: Boolean(client)
  };

  async function scoreLocal(row) {
    if (row.ownerName || (Array.isArray(row.ownerNames) && row.ownerNames.length)) {
      const names = row.ownerNames?.length ? row.ownerNames : [row.ownerName];
      const best = bestScoreAgainstOwners(row.defendantName, names);
      return applyOwnerMatchToRow(row, {
        ...best,
        ownerName: names[0] || '',
        ownerNames: names,
        mailingAddress: row.mailingAddress || ''
      });
    }
    return {
      ...row,
      ownerMatch: 'no_owner',
      ownerMatchScore: 0,
      ownerMatchReason: wantLookup
        ? 'Owner lookup unavailable — set REALESTATE_API_KEY in .env'
        : 'No owner name to compare',
      ownerName: row.ownerName || '',
      mailingAddress: row.mailingAddress || ''
    };
  }

  let enriched;
  if (!client) {
    enriched = await Promise.all(list.map((row) => scoreLocal(row)));
  } else {
    enriched = await mapPool(list, CONCURRENCY, async (row) => {
      if (row.ownerName || (Array.isArray(row.ownerNames) && row.ownerNames.length)) {
        return scoreLocal(row);
      }
      if (!String(row.streetAddress || '').trim()) {
        return applyOwnerMatchToRow(row, {
          score: 0,
          verdict: 'no_owner',
          reason: 'Missing street address',
          matchedOwner: '',
          ownerName: '',
          ownerNames: [],
          mailingAddress: ''
        });
      }
      try {
        const raw = await client.propertyDetailRaw({
          address: String(row.streetAddress || '').trim(),
          city: String(row.city || '').trim() || undefined,
          state: String(row.state || '').trim() || undefined,
          zip: String(row.zip || '').trim() || undefined
        });
        const owners = extractOwnersFromDetailRaw(raw);
        const best = bestScoreAgainstOwners(row.defendantName, owners.ownerNames);
        return applyOwnerMatchToRow(row, {
          ...best,
          ownerName: owners.ownerName,
          ownerNames: owners.ownerNames,
          mailingAddress: owners.mailingAddress
        });
      } catch (err) {
        stats.lookupErrors += 1;
        return {
          ...row,
          ownerMatch: 'no_owner',
          ownerMatchScore: 0,
          ownerMatchReason: `Lookup failed: ${err.message || 'error'}`,
          ownerName: row.ownerName || '',
          mailingAddress: row.mailingAddress || ''
        };
      }
    });
  }

  for (const row of enriched) {
    const key = row.ownerMatch || 'unchecked';
    if (Object.prototype.hasOwnProperty.call(stats, key)) stats[key] += 1;
    else stats.unchecked += 1;
  }

  return { rows: enriched, stats, lookupAvailable: Boolean(client) };
}

module.exports = {
  lookupAvailable,
  enrichRowsWithOwnerMatch,
  createOwnerLookupClient,
  scoreDefendantVsOwner,
  MAX_ROWS
};
