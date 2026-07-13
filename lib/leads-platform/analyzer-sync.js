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

const SESSION_FILE = 'distressAnalyzerSession_LATEST.json';
const SYNC_TTL_MS = Number(process.env.VAULT_SYNC_TTL_MS) > 0
  ? Number(process.env.VAULT_SYNC_TTL_MS)
  : 60_000;

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
  return [...tags];
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

  const streetViewUrl = r.imagery?.streetView?.url
    || r.streetViewUrl
    || r.streetView
    || '';

  const satelliteUrl = r.imagery?.satellite?.url
    || r.satelliteUrl
    || r.satellite
    || '';

  const photos = [];
  if (streetViewUrl) photos.push(String(streetViewUrl));
  if (satelliteUrl && satelliteUrl !== streetViewUrl) photos.push(String(satelliteUrl));

  const confidenceRaw = r.classificationConfidence || r.confidence || 'medium';
  const confidence = ['high', 'medium', 'low'].includes(confidenceRaw) ? confidenceRaw : 'medium';

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
    streetViewUrl: String(streetViewUrl || ''),
    satelliteUrl: String(satelliteUrl || ''),
    photos,
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

  const batch = upsertLeadsBatch([...toPublish.values()]);
  stats.published = batch.published;
  if (batch.errors?.length) {
    stats.errors.push(...batch.errors.map((e) => ({ ...e, phase: 'batch' })));
  }

  lastSyncAt = now;
  lastSyncStats = stats;
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

function ensureAnalyzerSync(opts = {}) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = Promise.resolve()
    .then(() => syncAnalyzerSessions(opts))
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
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
  listAnalyzerSessionSources,
  syncAnalyzerSessions,
  ensureAnalyzerSync,
  getLastSyncStats
};
