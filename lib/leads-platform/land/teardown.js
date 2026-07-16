'use strict';

const { normalizeLandUnderwriting } = require('./lao');

const ASSET_CLASSES = new Set(['vacant_lot', 'teardown']);
const TEARDOWN_REASONS = new Set(['contract_below_land_value', 'operator', 'rule']);
const PROMOTABLE_TYPES = new Set(['distressed', 'well_maintained']);

function money(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function normalizeAssetClass(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return ASSET_CLASSES.has(v) ? v : null;
}

function normalizeTeardown(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const from = String(src.promotedFromLeadType || '').trim();
  const reason = String(src.reason || 'operator').trim();
  return {
    promotedFromLeadType: PROMOTABLE_TYPES.has(from) ? from : (from || null),
    promotedAt: src.promotedAt ? String(src.promotedAt) : null,
    structureNote: String(src.structureNote || '').trim(),
    demoEstimate: money(src.demoEstimate),
    reason: TEARDOWN_REASONS.has(reason) ? reason : 'operator'
  };
}

/**
 * Promote a Home Vault house lead to Land Vault as a teardown.
 * Mutates a copy — caller upserts. Does not dual-list on Home Vault.
 */
function promoteLeadToTeardown(lead, opts = {}) {
  if (!lead || typeof lead !== 'object') {
    const err = new Error('Lead required');
    err.code = 'INVALID_LEAD';
    throw err;
  }
  const fromType = String(lead.leadType || '').trim();
  if (!PROMOTABLE_TYPES.has(fromType)) {
    const err = new Error(
      fromType === 'land'
        ? 'Lead is already on Land Vault'
        : 'Only distressed or well_maintained leads can be promoted'
    );
    err.code = fromType === 'land' ? 'ALREADY_LAND' : 'NOT_PROMOTABLE';
    throw err;
  }

  const demoEstimate = money(opts.demoEstimate);
  const structureNote = String(opts.structureNote || '').trim();
  const reason = TEARDOWN_REASONS.has(String(opts.reason || '').trim())
    ? String(opts.reason).trim()
    : 'operator';
  const now = opts.promotedAt || new Date().toISOString();

  const next = { ...lead };
  next.leadType = 'land';
  next.assetClass = 'teardown';
  next.teardown = {
    promotedFromLeadType: fromType,
    promotedAt: now,
    structureNote,
    demoEstimate,
    reason
  };

  if (!Array.isArray(next.signalTags)) next.signalTags = [];
  if (!next.signalTags.some((t) => String(t).toLowerCase() === 'teardown')) {
    next.signalTags = ['Teardown', ...next.signalTags];
  }

  const existingUw = next.landUnderwriting && typeof next.landUnderwriting === 'object'
    ? next.landUnderwriting
    : {};
  const parts = {
    clearing: existingUw.siteCostParts?.clearing ?? 0,
    demo: demoEstimate != null ? demoEstimate : (existingUw.siteCostParts?.demo ?? 0),
    grade: existingUw.siteCostParts?.grade ?? 0,
    other: existingUw.siteCostParts?.other ?? 0
  };
  next.landUnderwriting = normalizeLandUnderwriting({
    ...existingUw,
    siteCostParts: parts,
    method: existingUw.method || 'manual',
    updatedAt: now
  });

  return next;
}

module.exports = {
  ASSET_CLASSES,
  TEARDOWN_REASONS,
  PROMOTABLE_TYPES,
  normalizeAssetClass,
  normalizeTeardown,
  promoteLeadToTeardown
};
