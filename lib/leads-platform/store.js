const fs = require('fs');
const path = require('path');
const config = require('../config');
const { normalizeLeadRecord, validateLeadRecord } = require('./schema');
const { computePriorityScore } = require('./scoring');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const META_CACHE_MS = 30_000;

let memIndex = null;
let memIndexMtime = 0;
let memMeta = null;
let memMetaAt = 0;

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
  memMeta = null;
  memMetaAt = 0;
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
  const phones = Array.isArray(lead.phones) ? lead.phones : [];
  return {
    leadId: lead.leadId,
    address: slugPart(lead.address || ''),
    city: lead.city,
    state: lead.state,
    zip: slugPart(lead.zip || ''),
    parcel: slugPart(lead.parcel || ''),
    leadType: lead.leadType,
    priorityScore: lead.priorityScore,
    publishedAt: lead.publishedAt,
    signalTags: lead.signalTags || [],
    ownerName: lead.ownerName || '',
    topSignal: (lead.signalTags && lead.signalTags[0]) || '',
    thumbUrl,
    distressTier: lead.distressTier == null ? null : Number(lead.distressTier),
    hasPhone: phones.length > 0,
    firstPhone: phones[0] ? String(phones[0]).trim() : '',
    hasImagery: !!(thumbUrl || lead.satelliteUrl),
    catalogStatus: lead.catalogStatus || 'active'
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

function matchesQuery(entry, lead, query = {}) {
  const status = entry.catalogStatus || 'active';
  if (!query.includeHidden && status !== 'active') return false;
  if (query.catalogStatus && query.catalogStatus !== 'all' && status !== query.catalogStatus) return false;

  if (query.leadType && query.leadType !== 'all' && entry.leadType !== query.leadType) return false;
  if (query.state && entry.state !== query.state) return false;
  if (query.city && entry.city !== query.city) return false;

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

  return true;
}

function indexNeedsBackfill(index = []) {
  if (!index.length) return false;
  const sample = index[Math.min(3, index.length - 1)];
  return !sample || !sample.address;
}

function listRowFromEntry(entry) {
  return {
    ...entry,
    address: entry.address || '',
    phones: entry.firstPhone ? [entry.firstPhone] : []
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

function queryLeads(query = {}) {
  const index = readIndex();
  const filtered = [];
  for (const entry of index) {
    if (!matchesQuery(entry, null, query)) continue;
    filtered.push(listRowFromEntry(entry));
  }

  const sort = query.sort || 'priorityScore';
  const dir = query.sortDir === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    if (sort === 'address') return dir * String(a.address).localeCompare(String(b.address));
    if (sort === 'city') return dir * String(a.city).localeCompare(String(b.city));
    return dir * ((a.priorityScore || 0) - (b.priorityScore || 0));
  });

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
    byTypeFiltered: countByLeadTypeForQuery(query)
  };
}

/**
 * Tab counts for the active filter stack (state/city/signals/etc), ignoring leadType
 * so each type tab shows how many leads match the current filters.
 */
function countByLeadTypeForQuery(query = {}) {
  const base = { ...(query || {}) };
  delete base.leadType;
  const byType = { all: 0, distressed: 0, well_maintained: 0, land: 0 };
  for (const entry of readIndex()) {
    if (!matchesQuery(entry, null, base)) continue;
    byType.all += 1;
    if (byType[entry.leadType] != null) byType[entry.leadType] += 1;
  }
  return byType;
}

function getMeta() {
  const now = Date.now();
  if (memMeta && (now - memMetaAt) < META_CACHE_MS) return memMeta;

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

  let activeCount = 0;
  for (const entry of index) {
    if ((entry.catalogStatus || 'active') !== 'active') continue;
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
  }

  const citiesByStateOut = {};
  for (const [st, cityMap] of Object.entries(citiesByState)) {
    citiesByStateOut[st] = [...cityMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
  }

  const byNameAsc = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });

  memMeta = {
    total: activeCount,
    catalogTotal: index.length,
    byType,
    freshThisWeek,
    withPhone,
    withImagery,
    withoutImagery: Math.max(0, activeCount - withImagery),
    cities: [...cities.entries()].map(([name, count]) => ({ name, count })).sort(byNameAsc),
    states: [...states.entries()].map(([name, count]) => ({ name, count })).sort(byNameAsc),
    signals: [...signals.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    citiesByState: citiesByStateOut
  };
  memMetaAt = now;
  return memMeta;
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
  getMeta,
  getLeadsByIds,
  setLeadCatalogStatus,
  readIndex,
  readIndexUpdatedAt,
  catalogLeadCount,
  invalidateIndexCache
};
