'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeJsonAtomic } = require('../write-json-atomic');

function dataRoot() {
  if (process.env.CAMPAIGNS_SMS_DATA_ROOT) {
    return path.resolve(process.env.CAMPAIGNS_SMS_DATA_ROOT);
  }
  return path.join(__dirname, '..', '..', 'data', 'campaigns', 'sms');
}

function ensureDirs() {
  const root = dataRoot();
  for (const sub of ['', 'runs', 'queue']) {
    fs.mkdirSync(path.join(root, sub), { recursive: true });
  }
  return root;
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function indexPath() {
  return path.join(dataRoot(), 'index.json');
}

function autoPath() {
  return path.join(dataRoot(), 'auto-state.json');
}

function mapPath() {
  return path.join(dataRoot(), 'lead-contact-map.json');
}

function queuePath() {
  return path.join(dataRoot(), 'queue', 'pending.json');
}

function appendRun(summary = {}) {
  ensureDirs();
  const runId = summary.runId || crypto.randomBytes(8).toString('hex');
  const row = {
    runId,
    at: summary.at || new Date().toISOString(),
    mode: summary.mode || 'manual',
    dryRun: summary.dryRun === true,
    touch: summary.touch ?? null,
    sent: summary.sent ?? 0,
    skipped: summary.skipped ?? 0,
    failed: summary.failed ?? 0,
    excluded: summary.excluded ?? 0,
    error: summary.error || null,
    meta: summary.meta || {}
  };
  const file = path.join(dataRoot(), 'runs', `${runId}.json`);
  writeJsonAtomic(file, { ...row, detail: summary.detail || null });
  const idx = readJson(indexPath(), { runs: [] });
  idx.runs = [row, ...(idx.runs || [])].slice(0, 200);
  writeJsonAtomic(indexPath(), idx);
  return runId;
}

function listRuns({ limit = 20 } = {}) {
  ensureDirs();
  const idx = readJson(indexPath(), { runs: [] });
  return (idx.runs || []).slice(0, Math.max(1, Math.min(100, limit)));
}

function getAutoState() {
  ensureDirs();
  return readJson(autoPath(), {
    enabled: false,
    lastTickAt: null,
    lastError: null
  });
}

function setAutoState(patch = {}) {
  ensureDirs();
  const cur = getAutoState();
  const next = { ...cur, ...patch };
  writeJsonAtomic(autoPath(), next);
  return next;
}

function enqueueSync(leadId) {
  const id = String(leadId || '').trim();
  if (!id) return false;
  ensureDirs();
  const q = readJson(queuePath(), { pending: [] });
  if (!q.pending.includes(id)) q.pending.push(id);
  writeJsonAtomic(queuePath(), q);
  return true;
}

function dequeueSyncBatch(n = 20) {
  ensureDirs();
  const q = readJson(queuePath(), { pending: [] });
  const take = (q.pending || []).slice(0, Math.max(0, n));
  q.pending = (q.pending || []).slice(take.length);
  writeJsonAtomic(queuePath(), q);
  return take;
}

function queueDepth() {
  ensureDirs();
  const q = readJson(queuePath(), { pending: [] });
  return (q.pending || []).length;
}

function setContactMap(leadId, contactId) {
  ensureDirs();
  const map = readJson(mapPath(), {});
  map[String(leadId)] = {
    contactId: String(contactId),
    at: new Date().toISOString()
  };
  writeJsonAtomic(mapPath(), map);
}

function getContactMap(leadId) {
  ensureDirs();
  const map = readJson(mapPath(), {});
  return map[String(leadId)] || null;
}

module.exports = {
  dataRoot,
  ensureDirs,
  appendRun,
  listRuns,
  getAutoState,
  setAutoState,
  enqueueSync,
  dequeueSyncBatch,
  queueDepth,
  setContactMap,
  getContactMap
};
