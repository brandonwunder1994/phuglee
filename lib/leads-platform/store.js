const fs = require('fs');
const path = require('path');
const config = require('../config');
const { normalizeLeadRecord, validateLeadRecord } = require('./schema');
const { computePriorityScore } = require('./scoring');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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

function readIndex() {
  const index = readJson(indexPath(), { leads: [] });
  return Array.isArray(index.leads) ? index.leads : [];
}

function writeIndex(leads) {
  writeJsonAtomic(indexPath(), { leads, updatedAt: new Date().toISOString() });
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
    hasImagery: !!(thumbUrl || lead.satelliteUrl)
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
 */
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
  if (!leads.length) return { published: 0, leads: [], errors };

  for (const lead of leads) {
    writeJsonAtomic(leadPath(lead.leadId), lead);
  }

  const indexMap = new Map(readIndex().map((e) => [e.leadId, e]));
  for (const lead of leads) {
    indexMap.set(lead.leadId, indexEntryFromLead(lead));
  }
  const index = [...indexMap.values()].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  writeIndex(index);

  return { published: leads.length, leads, errors };
}

function getLead(leadId) {
  const file = leadPath(leadId);
  if (!fs.existsSync(file)) return null;
  return readJson(file, null);
}

function matchesQuery(entry, lead, query = {}) {
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
    totalPages: Math.max(1, Math.ceil(filtered.length / limit))
  };
}

function getMeta() {
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

  for (const entry of index) {
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
      .sort((a, b) => b.count - a.count);
  }

  return {
    total: index.length,
    byType,
    freshThisWeek,
    withPhone,
    withImagery,
    cities: [...cities.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    states: [...states.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    signals: [...signals.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    citiesByState: citiesByStateOut
  };
}

function getLeadsByIds(ids = []) {
  const list = Array.isArray(ids) ? ids : [];
  return list.map((id) => getLead(id)).filter(Boolean);
}

module.exports = {
  catalogRoot,
  upsertLead,
  upsertLeadsBatch,
  rebuildIndexFromLeads,
  getLead,
  queryLeads,
  getMeta,
  getLeadsByIds,
  readIndex
};
