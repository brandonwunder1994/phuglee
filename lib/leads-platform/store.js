const fs = require('fs');
const path = require('path');
const config = require('../config');
const { writeJsonAtomic, cleanupStaleJsonTemps } = require('../write-json-atomic');
const { normalizeLeadRecord, validateLeadRecord } = require('./schema');
const { computePriorityScore } = require('./scoring');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** Hard ceiling for vault map markers (Wave 3 — avoid shipping 15k pins). */
const MAP_MAX_MARKERS = 5000;
const MAP_MAX_MARKERS_LAND = 2500;
const META_CACHE_MS = 30_000;

let memIndex = null;
let memIndexMtime = 0;
let memIndexUpdatedAt = null;
/** @type {Map<string, { at: number, meta: object }>} */
const memMetaBySurface = new Map();

function normalizeSurface(raw) {
  const s = String(raw || 'all').trim().toLowerCase();
  if (s === 'home' || s === 'land' || s === 'all') return s;
  return 'all';
}

function entryMatchesSurface(entry, surface) {
  const type = String(entry?.leadType || '');
  if (surface === 'home' && type === 'land') return false;
  if (surface === 'land' && type !== 'land') return false;
  return true;
}

function catalogRoot() {
  return config.LEADS_CATALOG_ROOT;
}

function indexPath() {
  return path.join(catalogRoot(), 'index.json');
}

function leadPath(leadId) {
  const safe = String(leadId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return path.join(catalogRoot(), 'leads', `${safe}.json`);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn('[Leads catalog] Could not read', filePath, err.message);
    return fallback;
  }
}

function invalidateIndexCache() {
  memIndex = null;
  memIndexMtime = 0;
  memIndexUpdatedAt = null;
  memMetaBySurface.clear();
}

function readIndexFile() {
  const file = indexPath();
  if (!fs.existsSync(file)) return { leads: [], updatedAt: null };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn('[Leads catalog] Could not read', file, err.message);
    return { leads: [], updatedAt: null };
  }
}

function readIndex() {
  const file = indexPath();
  if (!fs.existsSync(file)) {
    memIndex = [];
    memIndexMtime = 0;
    memIndexUpdatedAt = null;
    return memIndex;
  }
  const stat = fs.statSync(file);
  if (memIndex && stat.mtimeMs === memIndexMtime) return memIndex;
  const parsed = readIndexFile();
  memIndex = Array.isArray(parsed.leads) ? parsed.leads : [];
  memIndexMtime = stat.mtimeMs;
  memIndexUpdatedAt = parsed.updatedAt || null;
  return memIndex;
}

/**
 * Warm the in-memory index so the first Vault/Land request does not pay a
 * multi-second JSON parse on the request path.
 */
function warmCatalogIndex() {
  const t0 = Date.now();
  let tempsRemoved = 0;
  try {
    tempsRemoved = cleanupStaleJsonTemps(catalogRoot());
    if (tempsRemoved > 0) {
      console.log(`[Leads catalog] cleaned ${tempsRemoved} orphan .tmp file(s)`);
    }
  } catch (err) {
    console.warn('[Leads catalog] tmp cleanup skipped:', err.message);
  }
  const index = readIndex();
  return { leads: index.length, ms: Date.now() - t0, tempsRemoved };
}

function readIndexUpdatedAt() {
  // Prefer cached value — never re-parse the full index.json just for updatedAt.
  if (memIndex && memIndexUpdatedAt != null) return memIndexUpdatedAt;
  if (memIndex && memIndexUpdatedAt === null && memIndexMtime) {
    // Index loaded but no updatedAt field
    return null;
  }
  readIndex();
  return memIndexUpdatedAt;
}

function catalogLeadCount() {
  return readIndex().length;
}

function writeIndex(leads) {
  writeJsonAtomic(indexPath(), { leads, updatedAt: new Date().toISOString() });
  invalidateIndexCache();
}

/**
 * Single-threaded RMW for the catalog index. Entire mutator runs without await
 * so concurrent HTTP handlers cannot interleave mid-update.
 * @param {(index: object[]) => object[]} mutator
 * @returns {object[]} next index
 */
function mutateIndex(mutator) {
  const current = readIndex().slice();
  const next = mutator(current);
  if (!Array.isArray(next)) {
    throw new Error('mutateIndex mutator must return an array');
  }
  writeIndex(next);
  return next;
}

function indexEntryFromLead(lead) {
  const { enrichLeadProof } = require('./why-surfaced');
  const proof = enrichLeadProof(lead || {});
  const thumbUrl = slugPart(proof.streetViewUrl || (proof.photos && proof.photos[0]) || '');
  const phones = Array.isArray(proof.phones)
    ? proof.phones.map((p) => String(p || '').trim()).filter(Boolean)
    : [];
  const lat = proof.lat == null || proof.lat === '' ? null : Number(proof.lat);
  const lng = proof.lng == null || proof.lng === '' ? null : Number(proof.lng);
  const estEquity = proof.estEquity == null || proof.estEquity === '' ? null : Number(proof.estEquity);
  const estARV = proof.estARV == null || proof.estARV === '' ? null : Number(proof.estARV);
  const entityType = slugPart(proof.entityType || '') || 'unknown';
  return {
    leadId: proof.leadId,
    address: slugPart(proof.address || ''),
    city: proof.city,
    state: proof.state,
    zip: slugPart(proof.zip || ''),
    parcel: slugPart(proof.parcel || ''),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    leadType: proof.leadType,
    assetClass: slugPart(proof.assetClass || '') || null,
    priorityScore: proof.priorityScore,
    publishedAt: proof.publishedAt,
    signalTags: proof.signalTags || [],
    ownerName: proof.ownerName || '',
    entityType,
    estEquity: Number.isFinite(estEquity) ? estEquity : null,
    estARV: Number.isFinite(estARV) ? estARV : null,
    compedAt: slugPart(proof.compedAt || '') || null,
    compConfidence: slugPart(proof.compConfidence || '') || null,
    topSignal: (proof.signalTags && proof.signalTags[0]) || '',
    whySurfaced: slugPart(proof.whySurfaced || '').slice(0, 240),
    thumbUrl,
    distressTier: proof.distressTier == null ? null : Number(proof.distressTier),
    hasPhone: phones.length > 0,
    firstPhone: phones[0] || '',
    phones: phones.slice(0, 3),
    phoneCount: phones.length,
    hasSkipTrace: !!(proof.skipTrace && proof.skipTrace.tracedAt) || phones.length > 0,
    hasImagery: !!(thumbUrl || proof.satelliteUrl),
    catalogStatus: proof.catalogStatus || 'active',
    landVerdict: slugPart(proof.landScreen?.verdict || '') || 'pending',
    acres: (() => {
      const pd = proof.propertyDetails && typeof proof.propertyDetails === 'object'
        ? proof.propertyDetails : {};
      if (pd.acres != null && Number.isFinite(Number(pd.acres)) && Number(pd.acres) > 0) {
        return Math.round(Number(pd.acres) * 100) / 100;
      }
      if (pd.lotSqft != null && Number.isFinite(Number(pd.lotSqft)) && Number(pd.lotSqft) > 0) {
        return Math.round((Number(pd.lotSqft) / 43560) * 100) / 100;
      }
      return null;
    })(),
    zoning: (() => {
      const pd = proof.propertyDetails && typeof proof.propertyDetails === 'object'
        ? proof.propertyDetails : {};
      return slugPart(pd.zoning || pd.zoningCode || pd.landUse || '') || '';
    })(),
    county: (() => {
      const pd = proof.propertyDetails && typeof proof.propertyDetails === 'object'
        ? proof.propertyDetails : {};
      return slugPart(pd.county || '') || '';
    })(),
    water: (() => {
      const pd = proof.propertyDetails && typeof proof.propertyDetails === 'object'
        ? proof.propertyDetails : {};
      return slugPart(pd.water || pd.waterService || '') || '';
    })(),
    sewer: (() => {
      const pd = proof.propertyDetails && typeof proof.propertyDetails === 'object'
        ? proof.propertyDetails : {};
      return slugPart(pd.sewer || pd.sewerService || '') || '';
    })(),
    flood: (() => {
      const pd = proof.propertyDetails && typeof proof.propertyDetails === 'object'
        ? proof.propertyDetails : {};
      return slugPart(pd.flood || pd.floodZone || pd.floodplain || '') || '';
    })(),
    landDispoStatus: slugPart(proof.landDisposition?.status || '') || 'new',
    topFundId: Array.isArray(proof.fundMatches) && proof.fundMatches[0]
      ? slugPart(proof.fundMatches[0].fundId)
      : '',
    topFundName: Array.isArray(proof.fundMatches) && proof.fundMatches[0]
      ? slugPart(proof.fundMatches[0].fundName)
      : '',
    fundMatchCount: Array.isArray(proof.fundMatches) ? proof.fundMatches.length : 0
  };
}

function slugPart(value) {
  return String(value || '').trim();
}

function upsertLead(raw) {
  const lead = normalizeLeadRecord(raw);
  lead.priorityScore = computePriorityScore(lead);
  const check = validateLeadRecord(lead);
  if (!check.ok) {
    const err = new Error(check.error);
    err.code = 'INVALID_LEAD';
    throw err;
  }

  writeJsonAtomic(leadPath(lead.leadId), lead);

  mutateIndex((index) => {
    const next = index.filter((e) => e.leadId !== lead.leadId);
    next.push(indexEntryFromLead(lead));
    next.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    return next;
  });
  return lead;
}

/**
 * Batch upsert — reads/writes index once. Used by analyzer sync for large catalogs.
 * Skips disk writes when lead JSON is unchanged (keeps sync from blocking ~45s).
 */
function leadFileBody(lead) {
  return JSON.stringify(lead, null, 2);
}

function writeLeadIfChanged(lead) {
  const file = leadPath(lead.leadId);
  const body = leadFileBody(lead);
  if (fs.existsSync(file)) {
    try {
      if (fs.readFileSync(file, 'utf8') === body) return false;
    } catch (_) { /* fall through to write */ }
  }
  writeJsonAtomic(file, lead);
  return true;
}

function upsertLeadsBatch(rawLeads = []) {
  const list = Array.isArray(rawLeads) ? rawLeads : [];
  const byId = new Map();
  const errors = [];

  for (const raw of list) {
    try {
      const lead = normalizeLeadRecord(raw);
      lead.priorityScore = computePriorityScore(lead);
      const check = validateLeadRecord(lead);
      if (!check.ok) {
        errors.push({ error: check.error, leadId: lead.leadId });
        continue;
      }
      byId.set(lead.leadId, lead);
    } catch (err) {
      errors.push({ error: err.message });
    }
  }

  const leads = [...byId.values()];
  if (!leads.length) return { published: 0, leads: [], errors, unchanged: 0 };

  const changed = [];
  for (const lead of leads) {
    if (writeLeadIfChanged(lead)) changed.push(lead);
  }

  if (!changed.length) {
    return { published: 0, leads: [], errors, unchanged: leads.length };
  }

  mutateIndex((index) => {
    const indexMap = new Map(index.map((e) => [e.leadId, e]));
    for (const lead of changed) {
      indexMap.set(lead.leadId, indexEntryFromLead(lead));
    }
    return [...indexMap.values()].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  });

  return { published: changed.length, leads: changed, errors, unchanged: leads.length - changed.length };
}

function getLead(leadId) {
  const file = leadPath(leadId);
  if (!fs.existsSync(file)) return null;
  return readJson(file, null);
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function matchesQuery(entry, lead, query = {}) {
  const status = entry.catalogStatus || 'active';
  if (!query.includeHidden && status !== 'active') return false;
  if (query.catalogStatus && query.catalogStatus !== 'all' && status !== query.catalogStatus) return false;

  const surface = normalizeSurface(query.surface);
  if (!entryMatchesSurface(entry, surface)) return false;

  if (query.leadType && query.leadType !== 'all' && entry.leadType !== query.leadType) return false;

  if (query.landVerdict && query.landVerdict !== 'all') {
    const want = String(query.landVerdict).trim().toLowerCase();
    if (want === 'fund-shaped') {
      if (!(entry.fundMatchCount > 0)) return false;
    } else {
      const have = String(entry.landVerdict || 'pending').trim().toLowerCase();
      if (have !== want) return false;
    }
  }
  if (query.landDispo && query.landDispo !== 'all') {
    const want = String(query.landDispo).trim().toLowerCase();
    const have = String(entry.landDispoStatus || 'new').trim().toLowerCase();
    if (have !== want) return false;
  }
  if (query.assetClass && query.assetClass !== 'all') {
    const want = String(query.assetClass).trim().toLowerCase();
    const have = String(entry.assetClass || '').trim().toLowerCase();
    if (want === 'teardown') {
      if (have !== 'teardown') return false;
    } else if (want === 'vacant_lot') {
      // vacant_lot filter: explicit vacant_lot OR land with no teardown class
      if (have === 'teardown') return false;
      if (have && have !== 'vacant_lot') return false;
    } else if (have !== want) {
      return false;
    }
  }
  if (query.state) {
    const want = String(query.state).trim().toUpperCase();
    const have = String(entry.state || '').trim().toUpperCase();
    if (want && have !== want) return false;
  }
  if (query.city) {
    const want = String(query.city).trim().toLowerCase();
    const have = String(entry.city || '').trim().toLowerCase();
    if (want && have !== want) return false;
  }

  const minScore = query.minScore == null ? null : Number(query.minScore);
  const maxScore = query.maxScore == null ? null : Number(query.maxScore);
  if (minScore != null && !Number.isNaN(minScore) && (entry.priorityScore || 0) < minScore) return false;
  if (maxScore != null && !Number.isNaN(maxScore) && (entry.priorityScore || 0) > maxScore) return false;

  const minDistressTier = query.minDistressTier == null ? null : Number(query.minDistressTier);
  if (minDistressTier != null && !Number.isNaN(minDistressTier)) {
    const tier = entry.distressTier == null ? 0 : Number(entry.distressTier);
    if (!Number.isFinite(tier) || tier < minDistressTier) return false;
  }

  const signals = Array.isArray(query.signals) ? query.signals.map((s) => String(s).toLowerCase()) : [];
  if (signals.length) {
    const tags = (entry.signalTags || []).map((t) => String(t).toLowerCase());
    if (!signals.every((s) => tags.includes(s))) return false;
  }

  const q = String(query.q || '').trim().toLowerCase();
  if (q) {
    const hay = [
      entry.leadId,
      entry.address,
      entry.city,
      entry.state,
      entry.zip,
      entry.ownerName,
      entry.parcel,
      entry.firstPhone
    ].join(' ').toLowerCase();
    const hayCompact = hay.replace(/[^a-z0-9]+/g, '');
    // Token AND: "910 delaware" matches even if punctuation/spacing differs.
    const tokens = q.split(/\s+/).filter(Boolean);
    const ok = tokens.every((token) => {
      if (hay.includes(token)) return true;
      const compact = token.replace(/[^a-z0-9]+/g, '');
      return compact.length >= 2 && hayCompact.includes(compact);
    });
    if (!ok) return false;
  }

  if (query.since) {
    const sinceTs = Date.parse(query.since);
    const pubTs = Date.parse(entry.publishedAt || '');
    if (!Number.isNaN(sinceTs) && !Number.isNaN(pubTs) && pubTs < sinceTs) return false;
  }

  if (query.favoritesOnly && query.favoriteIds) {
    const favSet = query.favoriteIds instanceof Set ? query.favoriteIds : new Set(query.favoriteIds);
    if (!favSet.has(entry.leadId)) return false;
  }

  if (query.hasPhone && !entry.hasPhone) return false;

  if (query.hasImagery && !entry.hasImagery) return false;

  if (query.entityType) {
    const want = String(query.entityType).trim().toLowerCase();
    const have = String(entry.entityType || 'unknown').trim().toLowerCase();
    if (want && have !== want) return false;
  }

  const minEquity = query.minEquity == null ? null : Number(query.minEquity);
  if (minEquity != null && !Number.isNaN(minEquity) && minEquity > 0) {
    const equity = entry.estEquity == null ? null : Number(entry.estEquity);
    if (equity == null || Number.isNaN(equity) || equity < minEquity) return false;
  }

  const originLat = query.originLat == null ? null : Number(query.originLat);
  const originLng = query.originLng == null ? null : Number(query.originLng);
  const radiusMiles = query.radiusMiles == null ? null : Number(query.radiusMiles);
  if (
    originLat != null && !Number.isNaN(originLat)
    && originLng != null && !Number.isNaN(originLng)
    && radiusMiles != null && !Number.isNaN(radiusMiles) && radiusMiles > 0
  ) {
    const lat = entry.lat == null ? null : Number(entry.lat);
    const lng = entry.lng == null ? null : Number(entry.lng);
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return false;
    if (haversineMiles(originLat, originLng, lat, lng) > radiusMiles) return false;
  }

  return true;
}

function indexNeedsBackfill(index = []) {
  if (!index.length) return false;
  const sample = index[Math.min(3, index.length - 1)];
  return !sample || !sample.address;
}

function listRowFromEntry(entry) {
  const phones = Array.isArray(entry.phones) && entry.phones.length
    ? entry.phones
    : (entry.firstPhone ? [entry.firstPhone] : []);
  return {
    ...entry,
    phones,
    phoneCount: entry.phoneCount != null ? entry.phoneCount : phones.length
  };
}

function rebuildIndexFromLeads() {
  const leadsDir = path.join(catalogRoot(), 'leads');
  if (!fs.existsSync(leadsDir)) return { rebuilt: 0 };
  const entries = [];
  for (const file of fs.readdirSync(leadsDir)) {
    if (!file.endsWith('.json')) continue;
    const lead = readJson(path.join(leadsDir, file), null);
    if (!lead || !lead.leadId) continue;
    entries.push(indexEntryFromLead(lead));
  }
  entries.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  writeIndex(entries);
  return { rebuilt: entries.length };
}

function sortLeadEntries(filtered, query = {}) {
  const sort = query.sort || 'priorityScore';
  const dir = query.sortDir === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    if (sort === 'address') return dir * String(a.address).localeCompare(String(b.address));
    if (sort === 'city') return dir * String(a.city).localeCompare(String(b.city));
    return dir * ((a.priorityScore || 0) - (b.priorityScore || 0));
  });
  return filtered;
}

/**
 * Compact alphanumerics for address search ("910-Delaware" → "910delaware").
 */
function compactSearchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isDigitHeavyQuery(q) {
  const raw = String(q || '').replace(/\s+/g, '');
  if (!raw) return false;
  const digits = (raw.match(/\d/g) || []).length;
  return digits >= 2 && digits / raw.length >= 0.45;
}

/**
 * Score a Vault lead for typeahead (Send New PSA / address pickers).
 * Prefer street-address hits; digit-heavy queries ignore phone/leadId-only matches
 * so typing a house number does not surface unrelated phones.
 * @returns {number} 0 = no match
 */
function scoreVaultAddressSearch(entry, queryText) {
  const q = String(queryText || '').trim().toLowerCase();
  if (q.length < 2) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;

  const address = String(entry.address || '').toLowerCase();
  const city = String(entry.city || '').toLowerCase();
  const state = String(entry.state || '').toLowerCase();
  const zip = String(entry.zip || '').toLowerCase();
  const owner = String(entry.ownerName || '').toLowerCase();
  const parcel = String(entry.parcel || '').toLowerCase();
  const phone = String(entry.firstPhone || '').toLowerCase();
  const leadId = String(entry.leadId || '').toLowerCase();

  const addrLine = [address, city, state, zip].filter(Boolean).join(' ');
  const addrCompact = compactSearchText(addrLine);
  const ownerCompact = compactSearchText(owner);
  const placeCompact = compactSearchText([addrLine, owner, parcel].join(' '));
  const anyCompact = compactSearchText([addrLine, owner, parcel, phone, leadId].join(' '));

  const digitHeavy = isDigitHeavyQuery(q);
  const matchToken = (token, hay, hayCompact) => {
    if (hay.includes(token)) return true;
    const compact = compactSearchText(token);
    return compact.length >= 2 && hayCompact.includes(compact);
  };

  const primaryHay = `${addrLine} ${owner} ${parcel}`.trim();
  const allPrimary = tokens.every((t) => matchToken(t, primaryHay, placeCompact));
  if (!allPrimary) {
    if (digitHeavy) return 0;
    const anyHay = `${primaryHay} ${phone} ${leadId}`.trim();
    if (!tokens.every((t) => matchToken(t, anyHay, anyCompact))) return 0;
  }

  let score = 10;
  const qCompact = compactSearchText(q);
  if (address.startsWith(q) || (qCompact && compactSearchText(address).startsWith(qCompact))) {
    score += 100;
  }
  if (tokens.every((t) => matchToken(t, address, compactSearchText(address)))) {
    score += 60;
  } else if (tokens.every((t) => matchToken(t, addrLine, addrCompact))) {
    score += 40;
  } else if (tokens.every((t) => matchToken(t, owner, ownerCompact))) {
    score += 15;
  } else {
    score += 5;
  }

  // Prefer exact street-number prefix when the query starts with digits.
  const num = q.match(/^\d{2,}/);
  if (num && address.startsWith(num[0])) score += 50;

  score += Math.min(20, Number(entry.priorityScore) || 0) / 10;
  return score;
}

/**
 * Catalog statuses eligible for Send New PSA / contract-desk address typeahead.
 * Includes `under_contract` because GHL pipeline sync marks interested / warm /
 * verbal_offer / contract_sent leads that way — operators still need to pick them
 * to send a PSA. Terminal statuses stay hidden.
 */
const PSA_SEARCH_CATALOG_STATUSES = new Set(['active', 'under_contract']);

/**
 * Vault leads for address typeahead (Send New PSA) — ranked by address relevance.
 * Includes CRM/pipeline-linked leads (`under_contract` catalog status).
 */
function searchActiveVaultLeads(q, opts = {}) {
  const limit = Math.min(24, Math.max(1, Number(opts.limit) || 12));
  const queryText = String(q || '').trim();
  if (queryText.length < 2) return [];

  const scored = [];
  for (const entry of readIndex()) {
    const status = String(entry.catalogStatus || 'active').toLowerCase() || 'active';
    if (!PSA_SEARCH_CATALOG_STATUSES.has(status)) continue;
    const score = scoreVaultAddressSearch(entry, queryText);
    if (score <= 0) continue;
    scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.entry.address || '').localeCompare(String(b.entry.address || ''));
  });

  return scored.slice(0, limit).map((row) => listRowFromEntry(row.entry));
}

function queryLeads(query = {}) {
  const index = readIndex();
  const filtered = [];
  for (const entry of index) {
    if (!matchesQuery(entry, null, query)) continue;
    filtered.push(listRowFromEntry(entry));
  }

  sortLeadEntries(filtered, query);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  const start = (page - 1) * limit;
  const slice = filtered.slice(start, start + limit);

  const out = {
    leads: slice,
    page,
    limit,
    total: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / limit))
  };
  // Land Desk falls back to meta.states / meta.citiesByState — skip a second
  // full-index facet pass on every list/bootstrap (~2× cost on large catalogs).
  if (!query.skipFacets) {
    Object.assign(out, facetCountsForQuery(query));
  }
  return out;
}

/** Collect matching lead IDs for export (sorted like list), capped at maxRows. */
function collectMatchingLeadIds(query = {}, maxRows = 500) {
  const cap = Math.max(1, Math.min(5000, Number(maxRows) || 500));
  const index = readIndex();
  const filtered = [];
  for (const entry of index) {
    if (!matchesQuery(entry, null, query)) continue;
    filtered.push(entry);
  }
  sortLeadEntries(filtered, query);
  const slice = filtered.slice(0, cap);
  return {
    ids: slice.map((e) => e.leadId),
    total: filtered.length,
    truncated: filtered.length > cap
  };
}

function queryMapMarkers(query = {}) {
  const index = readIndex();
  const markers = [];
  const requested = Number(query.maxMarkers);
  const maxMarkers = query.surface === 'land'
    ? MAP_MAX_MARKERS_LAND
    : Math.min(MAP_MAX_MARKERS, Number.isFinite(requested) && requested > 0 ? requested : MAP_MAX_MARKERS);
  for (const entry of index) {
    if (!matchesQuery(entry, null, query)) continue;
    const lat = entry.lat == null ? null : Number(entry.lat);
    const lng = entry.lng == null ? null : Number(entry.lng);
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) continue;
    markers.push({
      leadId: entry.leadId,
      lat,
      lng,
      address: entry.address || '',
      city: entry.city || '',
      state: entry.state || '',
      priorityScore: entry.priorityScore || 0,
      topSignal: entry.topSignal || '',
      leadType: entry.leadType || '',
      landVerdict: entry.landVerdict || '',
      landDispoStatus: entry.landDispoStatus || 'new',
      acres: entry.acres != null ? entry.acres : null,
      zoning: entry.zoning || ''
    });
    if (markers.length >= maxMarkers) break;
  }
  return {
    markers,
    total: markers.length,
    capped: markers.length >= maxMarkers,
    ...(query.skipFacets ? {} : facetCountsForQuery(query))
  };
}

/**
 * Facet counts for the active filter stack:
 * - byTypeFiltered: ignores leadType so type tabs stay useful
 * - statesFiltered: ignores state/city so State dropdown counts match other filters
 * - citiesFiltered: keeps state, ignores city (only when a state is selected)
 */
function facetCountsForQuery(query = {}) {
  const typeQuery = { ...(query || {}) };
  delete typeQuery.leadType;

  const stateQuery = { ...(query || {}) };
  delete stateQuery.state;
  delete stateQuery.city;

  const cityQuery = { ...(query || {}) };
  delete cityQuery.city;

  const byType = { all: 0, distressed: 0, well_maintained: 0, land: 0 };
  const states = new Map();
  const cities = new Map();
  const wantState = String(query.state || '').trim();

  for (const entry of readIndex()) {
    if (matchesQuery(entry, null, typeQuery)) {
      byType.all += 1;
      if (byType[entry.leadType] != null) byType[entry.leadType] += 1;
    }
    if (matchesQuery(entry, null, stateQuery)) {
      const st = String(entry.state || '').trim();
      if (st) states.set(st, (states.get(st) || 0) + 1);
    }
    if (wantState && matchesQuery(entry, null, cityQuery)) {
      const city = String(entry.city || '').trim();
      if (city) cities.set(city, (cities.get(city) || 0) + 1);
    }
  }

  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, {
    sensitivity: 'base'
  });

  return {
    byTypeFiltered: byType,
    statesFiltered: [...states.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort(byName),
    citiesFiltered: wantState
      ? [...cities.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort(byName)
      : []
  };
}

function getMeta(opts = {}) {
  const surface = normalizeSurface(opts.surface);
  const now = Date.now();
  const cached = memMetaBySurface.get(surface);
  if (cached && (now - cached.at) < META_CACHE_MS) return cached.meta;

  const index = readIndex();
  const byType = { distressed: 0, well_maintained: 0, land: 0 };
  const cities = new Map();
  const states = new Map();
  const signals = new Map();
  const citiesByState = {};
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let freshThisWeek = 0;
  let withPhone = 0;
  let withImagery = 0;
  let withCoords = 0;
  let landNeedsScreen = 0;
  let landKeep = 0;
  let landToss = 0;
  let landFundShaped = 0;
  let withAcres = 0;

  let activeCount = 0;
  for (const entry of index) {
    if ((entry.catalogStatus || 'active') !== 'active') continue;
    if (!entryMatchesSurface(entry, surface)) continue;
    activeCount += 1;
    if (byType[entry.leadType] != null) byType[entry.leadType] += 1;
    cities.set(entry.city, (cities.get(entry.city) || 0) + 1);
    states.set(entry.state, (states.get(entry.state) || 0) + 1);
    if (!citiesByState[entry.state]) citiesByState[entry.state] = new Map();
    citiesByState[entry.state].set(entry.city, (citiesByState[entry.state].get(entry.city) || 0) + 1);
    for (const tag of entry.signalTags || []) {
      signals.set(tag, (signals.get(tag) || 0) + 1);
    }
    const pub = Date.parse(entry.publishedAt || '');
    if (!Number.isNaN(pub) && pub >= weekAgo) freshThisWeek += 1;
    if (entry.hasPhone) withPhone += 1;
    if (entry.hasImagery) withImagery += 1;
    if (entry.lat != null && entry.lng != null) withCoords += 1;
    if (entry.acres != null) withAcres += 1;
    if (surface === 'land' || entry.leadType === 'land') {
      const verdict = String(entry.landVerdict || 'pending').toLowerCase();
      if (verdict === 'keep') landKeep += 1;
      else if (verdict === 'toss') landToss += 1;
      else landNeedsScreen += 1;
      if (entry.fundMatchCount > 0) landFundShaped += 1;
    }
  }

  const citiesByStateOut = {};
  for (const [st, cityMap] of Object.entries(citiesByState)) {
    citiesByStateOut[st] = [...cityMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
  }

  const byNameAsc = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });

  const meta = {
    total: activeCount,
    catalogTotal: index.length,
    surface,
    byType,
    freshThisWeek,
    withPhone,
    withImagery,
    withCoords,
    withAcres,
    withoutImagery: Math.max(0, activeCount - withImagery),
    landQueue: {
      needsScreen: landNeedsScreen,
      keep: landKeep,
      toss: landToss,
      fundShaped: landFundShaped
    },
    cities: [...cities.entries()].map(([name, count]) => ({ name, count })).sort(byNameAsc),
    states: [...states.entries()].map(([name, count]) => ({ name, count })).sort(byNameAsc),
    signals: [...signals.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    citiesByState: citiesByStateOut
  };
  memMetaBySurface.set(surface, { at: now, meta });
  return meta;
}

function getLeadsByIds(ids = []) {
  const list = Array.isArray(ids) ? ids : [];
  return list.map((id) => getLead(id)).filter(Boolean);
}

function setLeadCatalogStatus(leadId, catalogStatus) {
  const lead = getLead(leadId);
  if (!lead) return null;
  lead.catalogStatus = catalogStatus || 'active';
  return upsertLead(lead);
}

module.exports = {
  catalogRoot,
  upsertLead,
  upsertLeadsBatch,
  writeLeadIfChanged,
  writeIndex,
  indexEntryFromLead,
  rebuildIndexFromLeads,
  getLead,
  queryLeads,
  searchActiveVaultLeads,
  scoreVaultAddressSearch,
  collectMatchingLeadIds,
  queryMapMarkers,
  getMeta,
  getLeadsByIds,
  setLeadCatalogStatus,
  readIndex,
  readIndexUpdatedAt,
  warmCatalogIndex,
  catalogLeadCount,
  invalidateIndexCache,
  haversineMiles,
  normalizeSurface,
  MAP_MAX_MARKERS,
  MAP_MAX_MARKERS_LAND
};
