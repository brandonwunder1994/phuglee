const fs = require('fs');
const path = require('path');
const config = require('../config');
const { normalizeLeadRecord, validateLeadRecord } = require('./schema');
const { computePriorityScore } = require('./scoring');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAP_MAX_MARKERS = 15000;
const META_CACHE_MS = 30_000;

let memIndex = null;
let memIndexMtime = 0;
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

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
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
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  if (memIndex && stat.mtimeMs === memIndexMtime) return memIndex;
  const parsed = readIndexFile();
  memIndex = Array.isArray(parsed.leads) ? parsed.leads : [];
  memIndexMtime = stat.mtimeMs;
  return memIndex;
}

function readIndexUpdatedAt() {
  return readIndexFile().updatedAt || null;
}

function catalogLeadCount() {
  return readIndex().length;
}

function writeIndex(leads) {
  writeJsonAtomic(indexPath(), { leads, updatedAt: new Date().toISOString() });
  invalidateIndexCache();
}

function indexEntryFromLead(lead) {
  const thumbUrl = slugPart(lead.streetViewUrl || (lead.photos && lead.photos[0]) || '');
  const phones = Array.isArray(lead.phones)
    ? lead.phones.map((p) => String(p || '').trim()).filter(Boolean)
    : [];
  const lat = lead.lat == null || lead.lat === '' ? null : Number(lead.lat);
  const lng = lead.lng == null || lead.lng === '' ? null : Number(lead.lng);
  const estEquity = lead.estEquity == null || lead.estEquity === '' ? null : Number(lead.estEquity);
  const estARV = lead.estARV == null || lead.estARV === '' ? null : Number(lead.estARV);
  const entityType = slugPart(lead.entityType || '') || 'unknown';
  return {
    leadId: lead.leadId,
    address: slugPart(lead.address || ''),
    city: lead.city,
    state: lead.state,
    zip: slugPart(lead.zip || ''),
    parcel: slugPart(lead.parcel || ''),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    leadType: lead.leadType,
    assetClass: slugPart(lead.assetClass || '') || null,
    priorityScore: lead.priorityScore,
    publishedAt: lead.publishedAt,
    signalTags: lead.signalTags || [],
    ownerName: lead.ownerName || '',
    entityType,
    estEquity: Number.isFinite(estEquity) ? estEquity : null,
    estARV: Number.isFinite(estARV) ? estARV : null,
    compedAt: slugPart(lead.compedAt || '') || null,
    compConfidence: slugPart(lead.compConfidence || '') || null,
    topSignal: (lead.signalTags && lead.signalTags[0]) || '',
    thumbUrl,
    distressTier: lead.distressTier == null ? null : Number(lead.distressTier),
    hasPhone: phones.length > 0,
    firstPhone: phones[0] || '',
    phones: phones.slice(0, 3),
    phoneCount: phones.length,
    hasImagery: !!(thumbUrl || lead.satelliteUrl),
    catalogStatus: lead.catalogStatus || 'active',
    landVerdict: slugPart(lead.landScreen?.verdict || '') || 'pending',
    acres: (() => {
      const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
        ? lead.propertyDetails : {};
      if (pd.acres != null && Number.isFinite(Number(pd.acres)) && Number(pd.acres) > 0) {
        return Math.round(Number(pd.acres) * 100) / 100;
      }
      if (pd.lotSqft != null && Number.isFinite(Number(pd.lotSqft)) && Number(pd.lotSqft) > 0) {
        return Math.round((Number(pd.lotSqft) / 43560) * 100) / 100;
      }
      return null;
    })(),
    zoning: (() => {
      const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
        ? lead.propertyDetails : {};
      return slugPart(pd.zoning || pd.zoningCode || pd.landUse || '') || '';
    })(),
    county: (() => {
      const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
        ? lead.propertyDetails : {};
      return slugPart(pd.county || '') || '';
    })(),
    water: (() => {
      const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
        ? lead.propertyDetails : {};
      return slugPart(pd.water || pd.waterService || '') || '';
    })(),
    sewer: (() => {
      const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
        ? lead.propertyDetails : {};
      return slugPart(pd.sewer || pd.sewerService || '') || '';
    })(),
    flood: (() => {
      const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
        ? lead.propertyDetails : {};
      return slugPart(pd.flood || pd.floodZone || pd.floodplain || '') || '';
    })(),
    landDispoStatus: slugPart(lead.landDisposition?.status || '') || 'new',
    topFundId: Array.isArray(lead.fundMatches) && lead.fundMatches[0]
      ? slugPart(lead.fundMatches[0].fundId)
      : '',
    topFundName: Array.isArray(lead.fundMatches) && lead.fundMatches[0]
      ? slugPart(lead.fundMatches[0].fundName)
      : '',
    fundMatchCount: Array.isArray(lead.fundMatches) ? lead.fundMatches.length : 0
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

  const index = readIndex().filter((e) => e.leadId !== lead.leadId);
  index.push(indexEntryFromLead(lead));
  index.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  writeIndex(index);
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

  const indexMap = new Map(readIndex().map((e) => [e.leadId, e]));
  for (const lead of changed) {
    indexMap.set(lead.leadId, indexEntryFromLead(lead));
  }
  const index = [...indexMap.values()].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  writeIndex(index);

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
    if (!hay.includes(q)) return false;
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

  return {
    leads: slice,
    page,
    limit,
    total: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    ...facetCountsForQuery(query)
  };
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
    if (markers.length >= MAP_MAX_MARKERS) break;
  }
  return {
    markers,
    total: markers.length,
    capped: markers.length >= MAP_MAX_MARKERS,
    ...facetCountsForQuery(query)
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
  collectMatchingLeadIds,
  queryMapMarkers,
  getMeta,
  getLeadsByIds,
  setLeadCatalogStatus,
  readIndex,
  readIndexUpdatedAt,
  catalogLeadCount,
  invalidateIndexCache,
  haversineMiles,
  normalizeSurface
};
