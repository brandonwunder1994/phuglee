'use strict';

/**
 * Land disposition workflow (builder outreach tracking).
 * Not a PSA — status board only.
 */

const LAND_DISPO_STATUSES = new Set([
  'new',
  'screening',
  'ready',
  'pitched',
  'waiting',
  'won',
  'passed',
  'dead'
]);

const LAND_DISPO_LABELS = Object.freeze({
  new: 'New',
  screening: 'Screening',
  ready: 'Ready to pitch',
  pitched: 'Pitched',
  waiting: 'Waiting on buyer',
  won: 'Won',
  passed: 'Passed',
  dead: 'Dead'
});

const PITCH_STATUSES = new Set(['waiting', 'passed', 'won']);

function slug(v) {
  return String(v || '').trim();
}

function normalizePitch(row = {}) {
  if (!row || typeof row !== 'object') return null;
  const fundId = slug(row.fundId || row.buyerId);
  const fundName = slug(row.fundName || row.buyerName || row.name);
  if (!fundId && !fundName) return null;
  const status = slug(row.status).toLowerCase();
  if (!PITCH_STATUSES.has(status)) return null;
  return {
    fundId: fundId || fundName.toLowerCase().replace(/\s+/g, '-'),
    fundName: fundName || fundId,
    status,
    at: slug(row.at) || new Date().toISOString(),
    by: slug(row.by),
    note: slug(row.note)
  };
}

function normalizeLandDisposition(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const status = slug(src.status).toLowerCase();
  const pitches = Array.isArray(src.pitches)
    ? src.pitches.map(normalizePitch).filter(Boolean).slice(0, 20)
    : [];
  return {
    status: LAND_DISPO_STATUSES.has(status) ? status : 'new',
    note: slug(src.note),
    updatedAt: slug(src.updatedAt) || null,
    updatedBy: slug(src.updatedBy) || null,
    pitches
  };
}

function applyLandDispositionPatch(existing, patch = {}, user = '') {
  const cur = normalizeLandDisposition(existing);
  const next = { ...cur };
  if (patch.status != null) {
    const s = slug(patch.status).toLowerCase();
    if (LAND_DISPO_STATUSES.has(s)) next.status = s;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'note')) {
    next.note = slug(patch.note);
  }
  if (Array.isArray(patch.pitches)) {
    next.pitches = patch.pitches.map(normalizePitch).filter(Boolean).slice(0, 20);
  } else if (patch.pitch && typeof patch.pitch === 'object') {
    const pitch = normalizePitch(patch.pitch);
    if (pitch) {
      const idx = next.pitches.findIndex((p) => p.fundId === pitch.fundId);
      if (idx >= 0) next.pitches[idx] = { ...next.pitches[idx], ...pitch };
      else next.pitches.push(pitch);
      if (pitch.status === 'waiting' && (next.status === 'new' || next.status === 'ready' || next.status === 'pitched')) {
        next.status = 'waiting';
      }
      if (pitch.status === 'won') next.status = 'won';
    }
  }
  next.updatedAt = new Date().toISOString();
  next.updatedBy = slug(user) || next.updatedBy;
  return normalizeLandDisposition(next);
}

module.exports = {
  LAND_DISPO_STATUSES,
  LAND_DISPO_LABELS,
  PITCH_STATUSES,
  normalizeLandDisposition,
  applyLandDispositionPatch
};
