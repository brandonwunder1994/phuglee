'use strict';

const BRAIN_CAPS = Object.freeze({
  learnedRules: 120,
  correctionEvents: 200,
  scoreCorrections: 50,
  tierCorrections: 80,
  categoryCorrections: 30
});

const BRAIN_FIELDS = Object.freeze([
  'learnedRules',
  'correctionEvents',
  'scoreCorrections',
  'tierCorrections',
  'categoryCorrections'
]);

function capArray(value, cap) {
  if (!Array.isArray(value)) return [];
  return value.slice(-cap);
}

function buildLearnedBrainPayload(brain = {}) {
  const out = {};
  for (const field of BRAIN_FIELDS) {
    const cap = BRAIN_CAPS[field];
    out[field] = capArray(brain[field], cap);
  }
  return out;
}

function parseLearnedBrainFromSession(session = {}) {
  return buildLearnedBrainPayload(session);
}

function sessionHasLearnedBrain(session = {}) {
  return BRAIN_FIELDS.some((field) => Array.isArray(session[field]));
}

function mergeLearnedBrainForMigration(sessionBrain = {}, localBrain = {}) {
  const merged = {};
  for (const field of BRAIN_FIELDS) {
    const cap = BRAIN_CAPS[field];
    const fromSession = capArray(sessionBrain[field], cap);
    const fromLocal = capArray(localBrain[field], cap);
    if (!fromSession.length) {
      merged[field] = fromLocal;
      continue;
    }
    if (!fromLocal.length) {
      merged[field] = fromSession;
      continue;
    }
    const seen = new Set();
    const combined = [];
    for (const item of [...fromSession, ...fromLocal]) {
      const key = JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(item);
    }
    merged[field] = combined.slice(-cap);
  }
  return merged;
}

module.exports = {
  BRAIN_CAPS,
  BRAIN_FIELDS,
  capArray,
  buildLearnedBrainPayload,
  parseLearnedBrainFromSession,
  sessionHasLearnedBrain,
  mergeLearnedBrainForMigration
};