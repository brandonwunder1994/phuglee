const fs = require('fs');
const path = require('path');
const config = require('./config');

function emptyBrain() {
  return {
    version: 1,
    updatedAt: null,
    typeRules: [],
    phraseRules: [],
    events: [],
    metrics: {
      totalDecisions: 0,
      typeRulesActive: 0,
      phraseRulesActive: 0,
      phraseRulesProposed: 0
    }
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
    return fallback;
  }
}

function normalizeBrain(raw) {
  const base = emptyBrain();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: Number(raw.version) || base.version,
    updatedAt: raw.updatedAt ?? null,
    typeRules: Array.isArray(raw.typeRules) ? raw.typeRules : [],
    phraseRules: Array.isArray(raw.phraseRules) ? raw.phraseRules : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    metrics: {
      totalDecisions: Number(raw.metrics?.totalDecisions) || 0,
      typeRulesActive: Number(raw.metrics?.typeRulesActive) || 0,
      phraseRulesActive: Number(raw.metrics?.phraseRulesActive) || 0,
      phraseRulesProposed: Number(raw.metrics?.phraseRulesProposed) || 0
    }
  };
}

function loadBrain() {
  try {
    const raw = readJson(brainPath(), null);
    if (raw == null) return emptyBrain();
    return normalizeBrain(raw);
  } catch (err) {
    console.warn('[Bridge brain] loadBrain failed', err.message);
    return emptyBrain();
  }
}

function saveBrain(brain) {
  const doc = normalizeBrain(brain && typeof brain === 'object' ? brain : emptyBrain());
  doc.updatedAt = new Date().toISOString();
  // Preserve full rule objects from input (normalize only ensures arrays exist)
  if (brain && typeof brain === 'object') {
    if (Array.isArray(brain.typeRules)) doc.typeRules = brain.typeRules;
    if (Array.isArray(brain.phraseRules)) doc.phraseRules = brain.phraseRules;
    if (Array.isArray(brain.events)) doc.events = brain.events;
    if (brain.metrics && typeof brain.metrics === 'object') {
      doc.metrics = {
        totalDecisions: Number(brain.metrics.totalDecisions) || 0,
        typeRulesActive: Number(brain.metrics.typeRulesActive) || 0,
        phraseRulesActive: Number(brain.metrics.phraseRulesActive) || 0,
        phraseRulesProposed: Number(brain.metrics.phraseRulesProposed) || 0
      };
    }
    if (brain.version != null) doc.version = Number(brain.version) || 1;
  }
  writeJsonAtomic(brainPath(), doc);
  return doc;
}

module.exports = {
  emptyBrain,
  violationTypeKey,
  brainPath,
  loadBrain,
  saveBrain
};
