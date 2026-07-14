const fs = require('fs');
const path = require('path');
const config = require('../config');
const pdaConfig = require('../../modules/property-analyzer/lib/config');
const {
  scopeSessionPath,
  legacyGlobalSessionPath,
  emptySession
} = require('../../modules/property-analyzer/lib/user-session');
const { isManuallyEditedResult } = require('../../modules/property-analyzer/lib/backup-logic');
const {
  resultCategory,
  resultLeadTier,
  computeNeedsReview
} = require('../../modules/property-analyzer/lib/result-classify');
const { normalizeLeadRecord } = require('./schema');
const { computePriorityScore } = require('./scoring');
const { upsertLeadsBatch } = require('./store');
const { resolveImageryForAnalyzerResult } = require('./imagery-resolve');

const SESSION_FILE = 'distressAnalyzerSession_LATEST.json';
const SYNC_TTL_MS = Number(process.env.VAULT_SYNC_TTL_MS) > 0
  ? Number(process.env.VAULT_SYNC_TTL_MS)
  : 15 * 60_000;

const IMPORT_LEAD_TYPE_LABELS = {
  code_violation: 'Code violation',
  pre_foreclosure: 'Pre-foreclosure',
  probate: 'Probate',
  tax_lien: 'Tax delinquent',
  water_shut_off: 'Water shut-off'
};

let lastSyncAt = 0;
let lastSyncStats = null;
let syncInFlight = null;

function syncStatePath() {
  return path.join(config.LEADS_CATALOG_ROOT, 'sync-state.json');
}

function loadSyncState() {
  try {
    const raw = JSON.parse(fs.readFileSync(syncStatePath(), 'utf8'));
    if (raw.lastSyncAt) lastSyncAt = Number(raw.lastSyncAt) || 0;
    if (raw.lastSyncStats) lastSyncStats = raw.lastSyncStats;
  } catch (_) { /* no persisted state yet */ }
}

function saveSyncState() {
  try {
    const file = syncStatePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ lastSyncAt, lastSyncStats }, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn('[Vault sync] could not persist sync state:', err.message);
  }
}

loadSyncState();

function humanizeIndicator(value) {
  return String(value || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatImportLeadType(id) {
  const key = String(id || '').trim().toLowerCase();
  return IMPORT_LEAD_TYPE_LABELS[key] || humanizeIndicator(key);
}

function vaultLeadTypeFromResult(r) {
  const tier = resultLeadTier(r);
  if (tier === 'distressed') return 'distressed';
  if (tier === 'well_maintained') return 'well_maintained';
  if (tier === 'vacant' || resultCategory(r) === 'vacant_lot') return 'land';
  return null;
}

function isManuallyReviewedForVault(r) {
  if (!r) return false;
  if (isManuallyEditedResult(r)) return true;
  if (r.reviewResolved) return true;
  if (r.manuallyReviewed && !r.needsReviewLater) return true;
  return false;
}

function hasUsableAddress(r) {
  const address = String(r?.street || r?.address || '').trim();
  return address.length >= 4;
}

function shouldPublishAnalyzerResult(r) {
  if (!r || typeof r !== 'object') return false;
  if (!hasUsableAddress(r)) return false;
  if (!isManuallyReviewedForVault(r)) return false;
  if (computeNeedsReview(r)) return false;

  const cat = resultCategory(r);
  if (cat === 'blurred' || cat === 'unavailable') return false;

  const leadType = vaultLeadTypeFromResult(r);
  return !!leadType;
}

function buildSignalTags(r) {
  const tags = new Set();
  if (r.leadType) tags.add(formatImportLeadType(r.leadType));
  if (Array.isArray(r.indicators)) {
    r.indicators.forEach((ind) => {
      const label = humanizeIndicator(ind);
      if (label) tags.add(label);
    });
  }
  if (r.violationType) tags.add(String(r.violationType).trim());
  if (r.codeType) tags.add(String(r.codeType).trim());
  if (r.profile?.codeType) tags.add(String(r.profile.codeType).trim());
  if (r.profile?.violationType) tags.add(String(r.profile.violationType).trim());
  return [...tags].filter(Boolean);
}

function cleanText(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  return s;
}

function buildDistressDetails(r) {
  const indicators = Array.isArray(r.indicators)
    ? r.indicators.map(humanizeIndicator).filter(Boolean)
    : [];
  const summary = cleanText(r.reason);
  const rationale = cleanText(r.tierRationale || r.reviewReason);
  const score = typeof r.score === 'number'
    ? r.score
    : (typeof r.manualScore === 'number' ? r.manualScore : null);
  const tier = cleanText(r.leadTier || '');
  const category = cleanText(r.category || '');

  if (!indicators.length && !summary && !rationale && score == null) return null;

  return {
    score: score == null ? null : Number(score),
    tier: tier || '',
    category: category || '',
    summary,
    rationale,
    indicators
  };
}

function buildCodeViolationDetails(r) {
  const profile = r.profile && typeof r.profile === 'object' ? r.profile : {};
  const type = cleanText(
    r.violationType
    || r.codeType
    || profile.violationType
    || profile.codeType
    || profile.codeCategory
    || r.codeCategory
    || (r.leadType ? formatImportLeadType(r.leadType) : '')
  );
  const description = cleanText(
    r.violationDescription
    || profile.violationDescription
    || r.description
    || profile.description
  );
  const date = cleanText(
    r.violationDate || profile.violationDate || ''
  );
  const category = cleanText(
    r.codeCategory || profile.codeCategory || ''
  );

  const records = [];
  const list = Array.isArray(r.violations)
    ? r.violations
    : (Array.isArray(profile.violations) ? profile.violations : []);
  for (const v of list.slice(0, 12)) {
    if (!v || typeof v !== 'object') continue;
    const rec = {
      type: cleanText(v.category || v.codeType || v.violationType || v.type || ''),
      description: cleanText(v.violationDescription || v.description || ''),
      date: cleanText(v.violationDate || v.date || '')
    };
    if (rec.type || rec.description || rec.date) records.push(rec);
  }

  if (!type && !description && !date && !category && !records.length) return null;

  return {
    type: type || '',
    description: description || '',
    date: date || '',
    category: category || '',
    records
  };
}

function mapAnalyzerResultToVaultLead(r, scopeMeta = {}) {
  const leadType = vaultLeadTypeFromResult(r);
  if (!leadType) return null;

  const phones = [];
  if (r.phone) phones.push(String(r.phone).trim());
  if (Array.isArray(r.profile?.phones)) {
    r.profile.phones.forEach((p) => {
      const n = typeof p === 'string' ? p : (p?.number || p?.phone || '');
      if (n) phones.push(String(n).trim());
    });
  }

  const ownerName = [r.firstName, r.lastName].filter(Boolean).join(' ').trim()
    || String(r.ownerName || r.owner || '').trim();

  const { streetViewUrl: resolvedStreet, satelliteUrl: resolvedSat } =
    resolveImageryForAnalyzerResult(r);

  const photos = [];
  if (resolvedStreet) photos.push(String(resolvedStreet));
  if (resolvedSat && resolvedSat !== resolvedStreet) photos.push(String(resolvedSat));

  const confidenceRaw = r.classificationConfidence || r.confidence || 'medium';
  const confidence = ['high', 'medium', 'low'].includes(confidenceRaw) ? confidenceRaw : 'medium';

  const distress = buildDistressDetails(r);
  const codeViolation = buildCodeViolationDetails(r);

  return {
    address: String(r.street || r.address || '').trim(),
    city: String(r.city || '').trim(),
    state: String(r.state || '').trim(),
    zip: String(r.postal || r.zip || '').trim(),
    leadType,
    reviewStatus: 'approved',
    distressTier: typeof r.score === 'number' ? r.score : null,
    confidence,
    signalTags: buildSignalTags(r),
    ownerName,
    phones: [...new Set(phones.filter(Boolean))],
    email: String(r.email || '').trim(),
    estARV: r.profile?.marketValue || r.marketValue || r.avm || null,
    estRepairs: r.profile?.repairEstimate || r.estRepairs || null,
    estEquity: r.profile?.equity || r.estEquity || null,
    streetViewUrl: String(resolvedStreet || ''),
    satelliteUrl: String(resolvedSat || ''),
    photos,
    distress,
    codeViolation,
    publishedAt: r.manuallyReviewedAt
      ? new Date(r.manuallyReviewedAt).toISOString()
      : (r.analyzedAt ? new Date(r.analyzedAt).toISOString() : undefined),
    sourceCity: [r.city, r.state].filter(Boolean).join(', '),
    sourceListId: scopeMeta.storageKey || '',
    pipelineVersion: `analyzer-sync@${scopeMeta.storageKey || 'unknown'}`
  };
}

function readSessionFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return emptySession();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : emptySession();
  } catch (err) {
    console.warn('[Vault sync] Could not read session', filePath, err.message);
    return emptySession();
  }
}

function analyzerDataRoot() {
  if (process.env.PDA_DATA_ROOT) return path.resolve(process.env.PDA_DATA_ROOT);
  return config.ANALYZER_DATA_ROOT || pdaConfig.DATA_ROOT;
}

function listAnalyzerSessionSources() {
  const dataRoot = analyzerDataRoot();
  const sources = [];
  const usersDir = path.join(dataRoot, 'users');

  if (fs.existsSync(usersDir)) {
    for (const name of fs.readdirSync(usersDir)) {
      if (!name || name.startsWith('.')) continue;
      if (name === '_anonymous') continue;
      const sessionPath = path.join(usersDir, name, SESSION_FILE);
      sources.push({
        storageKey: name,
        sessionPath,
        kind: name === '_vault' ? 'vault' : (name === 'admin' ? 'admin' : 'user')
      });
    }
  }

  const legacyPath = legacyGlobalSessionPath(dataRoot, SESSION_FILE);
  if (fs.existsSync(legacyPath)) {
    sources.push({ storageKey: 'legacy-global', sessionPath: legacyPath, kind: 'legacy' });
  }

  return sources;
}

function mergeUniqueStrings(a = [], b = []) {
  const out = [];
  const seen = new Set();
  for (const v of [...a, ...b]) {
    const s = String(v || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function preferExisting(current, incoming) {
  if (current != null && current !== '' && current !== 'unknown') return current;
  return incoming;
}

/** Keep PropStream/CSV enrichment when Analyzer sync refreshes a lead. */
function mergeIncomingWithCatalogLead(existing, incoming) {
  if (!existing) return incoming;
  const next = { ...incoming };

  next.zip = preferExisting(existing.zip, incoming.zip);
  next.lat = existing.lat != null ? existing.lat : incoming.lat;
  next.lng = existing.lng != null ? existing.lng : incoming.lng;
  next.ownerName = preferExisting(existing.ownerName, incoming.ownerName);
  next.email = preferExisting(existing.email, incoming.email);
  next.mailingAddress = preferExisting(existing.mailingAddress, incoming.mailingAddress);
  next.propertyType = preferExisting(existing.propertyType, incoming.propertyType);
  next.entityType = preferExisting(existing.entityType, incoming.entityType);
  next.phones = mergeUniqueStrings(existing.phones || [], incoming.phones || []);
  next.signalTags = mergeUniqueStrings(existing.signalTags || [], incoming.signalTags || []);

  next.estARV = existing.estARV != null ? existing.estARV : incoming.estARV;
  next.estRepairs = existing.estRepairs != null ? existing.estRepairs : incoming.estRepairs;
  next.estEquity = existing.estEquity != null ? existing.estEquity : incoming.estEquity;
  next.assessedValue = existing.assessedValue != null ? existing.assessedValue : incoming.assessedValue;
  next.lastSale = (existing.lastSale && existing.lastSale.price != null)
    ? existing.lastSale
    : (incoming.lastSale || existing.lastSale || null);

  next.propertyDetails = {
    ...(incoming.propertyDetails || {}),
    ...(existing.propertyDetails || {})
  };
  next.financialDetails = {
    ...(incoming.financialDetails || {}),
    ...(existing.financialDetails || {})
  };

  next.distress = incoming.distress || existing.distress || null;
  next.codeViolation = incoming.codeViolation || existing.codeViolation || null;

  if (existing.enrichedAt) next.enrichedAt = existing.enrichedAt;
  if (existing.enrichmentSource) next.enrichmentSource = existing.enrichmentSource;

  // Never re-expose Under Contract / sold / excluded leads via analyzer sync
  if (existing.catalogStatus && existing.catalogStatus !== 'active') {
    next.catalogStatus = existing.catalogStatus;
  }

  // Prefer richer imagery: keep existing if incoming blank
  if (!next.streetViewUrl && existing.streetViewUrl) next.streetViewUrl = existing.streetViewUrl;
  if (!next.satelliteUrl && existing.satelliteUrl) next.satelliteUrl = existing.satelliteUrl;
  if ((!next.photos || !next.photos.length) && existing.photos?.length) next.photos = existing.photos;

  next.priorityScore = computePriorityScore(next);
  return next;
}

function syncAnalyzerSessions(opts = {}) {
  const force = !!opts.force;
  const now = Date.now();
  if (!force && lastSyncAt && (now - lastSyncAt) < SYNC_TTL_MS) {
    return lastSyncStats || { skipped: true, reason: 'ttl', lastSyncAt };
  }

  const stats = {
    skipped: false,
    sources: 0,
    scanned: 0,
    eligible: 0,
    published: 0,
    errors: [],
    lastSyncAt: now
  };

  const sources = listAnalyzerSessionSources();
  stats.sources = sources.length;

  const toPublish = new Map();

  for (const source of sources) {
    const session = readSessionFile(source.sessionPath);
    const results = Array.isArray(session.results) ? session.results : [];
    stats.scanned += results.length;

    for (const result of results) {
      if (!shouldPublishAnalyzerResult(result)) continue;
      stats.eligible += 1;
      try {
        const raw = mapAnalyzerResultToVaultLead(result, { storageKey: source.storageKey });
        if (!raw) continue;
        const lead = normalizeLeadRecord(raw);
        lead.distress = raw.distress || null;
        lead.codeViolation = raw.codeViolation || null;
        if (opts.forceApprove && lead.leadType === 'distressed') {
          lead.reviewStatus = 'approved';
        }
        lead.priorityScore = computePriorityScore(lead);
        const prev = toPublish.get(lead.leadId);
        const pubTs = Date.parse(lead.publishedAt || '') || 0;
        const prevTs = prev ? (Date.parse(prev.publishedAt || '') || 0) : 0;
        if (!prev || pubTs >= prevTs) toPublish.set(lead.leadId, lead);
      } catch (err) {
        stats.errors.push({
          storageKey: source.storageKey,
          address: result.street || result.address || '',
          error: err.message
        });
      }
    }
  }

  const { getLead } = require('./store');
  const merged = [];
  for (const incoming of toPublish.values()) {
    const existing = getLead(incoming.leadId);
    merged.push(existing ? mergeIncomingWithCatalogLead(existing, incoming) : incoming);
  }

  const batch = upsertLeadsBatch(merged);
  stats.published = batch.published;
  if (batch.errors?.length) {
    stats.errors.push(...batch.errors.map((e) => ({ ...e, phase: 'batch' })));
  }

  lastSyncAt = now;
  lastSyncStats = stats;
  saveSyncState();
  if (stats.published > 0 || stats.eligible > 0) {
    console.log(JSON.stringify({
      scope: 'vault-sync',
      event: 'analyzer_sync_complete',
      ...stats,
      errorCount: stats.errors.length
    }));
  }
  return stats;
}

function shouldScheduleBackgroundSync() {
  try {
    const { catalogLeadCount } = require('./store');
    if (!catalogLeadCount()) return true;
    if (lastSyncAt && (Date.now() - lastSyncAt) < SYNC_TTL_MS) return false;
    const { readIndexUpdatedAt } = require('./store');
    const updatedAt = Date.parse(readIndexUpdatedAt() || '');
    if (Number.isNaN(updatedAt)) return true;
    return (Date.now() - updatedAt) > SYNC_TTL_MS;
  } catch (_) {
    return false;
  }
}

let syncScheduled = false;

function scheduleBackgroundSync() {
  if (syncScheduled || syncInFlight) return;
  if (!shouldScheduleBackgroundSync()) return;
  syncScheduled = true;
  setImmediate(() => {
    syncScheduled = false;
    ensureAnalyzerSync().catch((err) => {
      console.warn('[Vault sync] background sync failed:', err.message);
    });
  });
}

function ensureAnalyzerSync(opts = {}) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = Promise.resolve()
    .then(() => syncAnalyzerSessions(opts))
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}

function publishAnalyzerResult(result, opts = {}) {
  if (!shouldPublishAnalyzerResult(result)) {
    return { published: false, reason: 'not_eligible' };
  }
  const raw = mapAnalyzerResultToVaultLead(result, {
    storageKey: opts.storageKey || 'analyzer'
  });
  if (!raw) return { published: false, reason: 'unmapable_tier' };

  const { normalizeLeadRecord } = require('./schema');
  const { upsertLead, getLead } = require('./store');
  const lead = normalizeLeadRecord(raw);
  lead.distress = raw.distress || null;
  lead.codeViolation = raw.codeViolation || null;
  if (opts.forceApprove !== false && lead.leadType === 'distressed') {
    lead.reviewStatus = 'approved';
  }
  lead.priorityScore = computePriorityScore(lead);
  const existing = getLead(lead.leadId);
  const merged = existing ? mergeIncomingWithCatalogLead(existing, lead) : lead;
  const saved = upsertLead(merged);
  return { published: true, leadId: saved.leadId, lead: saved };
}

function getLastSyncStats() {
  return lastSyncStats;
}

module.exports = {
  SYNC_TTL_MS,
  vaultLeadTypeFromResult,
  isManuallyReviewedForVault,
  shouldPublishAnalyzerResult,
  mapAnalyzerResultToVaultLead,
  publishAnalyzerResult,
  buildDistressDetails,
  buildCodeViolationDetails,
  mergeIncomingWithCatalogLead,
  listAnalyzerSessionSources,
  syncAnalyzerSessions,
  ensureAnalyzerSync,
  scheduleBackgroundSync,
  getLastSyncStats
};
