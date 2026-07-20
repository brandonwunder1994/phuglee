const fs = require('fs');
const path = require('path');
const config = require('./config');

/** Caps for Filter Superpower Brain arrays (keep newest via slice(-cap)). */
const BRAIN_CAPS = Object.freeze({
  events: 2000,
  typeRules: 500,
  phraseRules: 500
});

const DECISION_ACTIONS = new Set([
  'approve_group',
  'deny_group',
  'approve_row',
  'deny_row'
]);

function emptyMetrics() {
  return {
    totalDecisions: 0,
    typeRulesActive: 0,
    phraseRulesActive: 0,
    phraseRulesProposed: 0,
    suppressCount: 0,
    promoteCount: 0
  };
}

function emptyBrain() {
  return {
    version: 1,
    updatedAt: null,
    typeRules: [],
    phraseRules: [],
    events: [],
    metrics: emptyMetrics()
  };
}

function violationTypeKey(label) {
  const key = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return key || '__unknown__';
}

function brainPath() {
  return path.join(config.BRIDGE_BRAIN_ROOT, 'global-brain.json');
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
    console.warn('[Bridge brain] Could not read', filePath, err.message);
    // Distinguish corrupt file from missing — loadBrain must not treat as empty.
    const e = new Error(err.message || 'Brain JSON parse failed');
    e.code = 'BRAIN_READ_CORRUPT';
    e.cause = err;
    throw e;
  }
}

function capArray(value, cap) {
  if (!Array.isArray(value)) return [];
  return value.slice(-cap);
}

/**
 * Prefer pruning rejected/disabled rules before active when over cap.
 * Falls back to keeping the last `cap` items after status-priority sort
 * that places active/proposed later (surviving slice(-cap)).
 */
function capRulesPreferActive(rules, cap) {
  if (!Array.isArray(rules)) return [];
  if (rules.length <= cap) return rules.slice();
  const rank = (r) => {
    const s = r && r.status;
    if (s === 'active' || s === 'proposed') return 2;
    if (s === 'disabled' || s === 'rejected') return 0;
    return 1;
  };
  // Stable-ish: low rank (disabled/rejected) first so slice(-cap) drops them
  const indexed = rules.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const d = rank(a.r) - rank(b.r);
    if (d !== 0) return d;
    return a.i - b.i;
  });
  return indexed.map((x) => x.r).slice(-cap);
}

function enforceBrainCaps(brain) {
  if (!brain || typeof brain !== 'object') return brain;
  brain.events = capArray(brain.events, BRAIN_CAPS.events);
  brain.typeRules = capRulesPreferActive(brain.typeRules, BRAIN_CAPS.typeRules);
  brain.phraseRules = capRulesPreferActive(brain.phraseRules, BRAIN_CAPS.phraseRules);
  return brain;
}

function recomputeMetrics(brain) {
  const typeRules = Array.isArray(brain && brain.typeRules) ? brain.typeRules : [];
  const phraseRules = Array.isArray(brain && brain.phraseRules) ? brain.phraseRules : [];
  const events = Array.isArray(brain && brain.events) ? brain.events : [];

  const isActive = (r) => r && r.status === 'active';
  const isProposed = (r) => r && r.status === 'proposed';

  return {
    totalDecisions: events.filter((e) => e && DECISION_ACTIONS.has(e.action)).length,
    typeRulesActive: typeRules.filter(isActive).length,
    phraseRulesActive: phraseRules.filter(isActive).length,
    phraseRulesProposed: phraseRules.filter(isProposed).length,
    suppressCount:
      typeRules.filter((r) => isActive(r) && r.kind === 'suppress_type').length +
      phraseRules.filter((r) => isActive(r) && r.kind === 'suppress_phrase').length,
    promoteCount:
      typeRules.filter((r) => isActive(r) && r.kind === 'promote_type').length +
      phraseRules.filter((r) => isActive(r) && r.kind === 'promote_phrase').length
  };
}

function normalizeBrain(raw) {
  const base = emptyBrain();
  if (!raw || typeof raw !== 'object') return base;
  const metricsIn = raw.metrics && typeof raw.metrics === 'object' ? raw.metrics : {};
  return {
    version: Number(raw.version) || base.version,
    updatedAt: raw.updatedAt ?? null,
    typeRules: Array.isArray(raw.typeRules) ? raw.typeRules : [],
    phraseRules: Array.isArray(raw.phraseRules) ? raw.phraseRules : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    metrics: {
      totalDecisions: Number(metricsIn.totalDecisions) || 0,
      typeRulesActive: Number(metricsIn.typeRulesActive) || 0,
      phraseRulesActive: Number(metricsIn.phraseRulesActive) || 0,
      phraseRulesProposed: Number(metricsIn.phraseRulesProposed) || 0,
      suppressCount: Number(metricsIn.suppressCount) || 0,
      promoteCount: Number(metricsIn.promoteCount) || 0
    }
  };
}

function loadBrain() {
  const file = brainPath();
  if (!fs.existsSync(file)) return emptyBrain();
  try {
    const raw = readJson(file, null);
    if (raw == null) return emptyBrain();
    return normalizeBrain(raw);
  } catch (err) {
    // Fail closed: corrupt non-empty brain must not become emptyBrain for later save.
    console.error('[Bridge brain] loadBrain failed — refusing empty fallback', err.message);
    err.code = err.code || 'BRAIN_LOAD_FAILED';
    throw err;
  }
}

/** Serialize brain writes process-wide (version CAS alone still races). */
let brainWriteChain = Promise.resolve();

/**
 * Persist brain with caps + metrics recompute + version RMW.
 * @param {object} brain
 * @param {{ expectedVersion?: number }} [options]
 * @throws {Error} code VERSION_CONFLICT statusCode 409 when expectedVersion mismatches disk
 */
function saveBrain(brain, options = {}) {
  const expectedVersion = options && options.expectedVersion;
  let current;
  try {
    current = loadBrain();
  } catch (err) {
    // Never overwrite a corrupt-on-disk brain with a partial in-memory object.
    throw err;
  }

  if (expectedVersion != null && Number(current.version) !== Number(expectedVersion)) {
    const err = new Error('Brain version conflict');
    err.code = 'VERSION_CONFLICT';
    err.statusCode = 409;
    err.currentVersion = current.version;
    throw err;
  }

  const doc = normalizeBrain(brain && typeof brain === 'object' ? brain : emptyBrain());
  // Preserve full rule objects from input (normalize only ensures arrays exist)
  if (brain && typeof brain === 'object') {
    if (Array.isArray(brain.typeRules)) doc.typeRules = brain.typeRules;
    if (Array.isArray(brain.phraseRules)) doc.phraseRules = brain.phraseRules;
    if (Array.isArray(brain.events)) doc.events = brain.events;
  }

  // Refuse to wipe an existing brain with an empty ruleset unless explicitly allowed
  const hadRules = (current.typeRules && current.typeRules.length)
    || (current.phraseRules && current.phraseRules.length);
  const nextEmpty = !(doc.typeRules && doc.typeRules.length)
    && !(doc.phraseRules && doc.phraseRules.length);
  if (hadRules && nextEmpty && !options.allowEmptyWipe) {
    const err = new Error('Refusing to save empty brain over non-empty disk state');
    err.code = 'BRAIN_EMPTY_WIPE_BLOCKED';
    err.statusCode = 409;
    throw err;
  }

  enforceBrainCaps(doc);
  doc.version = (Number(current.version) || 0) + 1;
  doc.updatedAt = new Date().toISOString();
  doc.metrics = recomputeMetrics(doc);

  // Backup previous file before overwrite
  try {
    const bp = brainPath();
    if (fs.existsSync(bp)) {
      fs.copyFileSync(bp, `${bp}.bak`);
    }
  } catch (_) { /* best effort */ }

  writeJsonAtomic(brainPath(), doc);
  return doc;
}

async function saveBrainSafe(brain, options = {}) {
  const run = brainWriteChain.then(() => saveBrain(brain, options));
  brainWriteChain = run.catch(() => {});
  return run;
}

module.exports = {
  BRAIN_CAPS,
  DECISION_ACTIONS,
  emptyBrain,
  violationTypeKey,
  brainPath,
  loadBrain,
  saveBrain,
  saveBrainSafe,
  capArray,
  enforceBrainCaps,
  recomputeMetrics
};
