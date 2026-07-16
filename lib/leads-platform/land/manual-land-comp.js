'use strict';

/**
 * Manual Land Comp — operator FMV + lot comps (ND / thin market).
 */

const { streetViewUrl } = require('../comping/street-view');
const { scoreLandComp } = require('./comping-rules');
const { computeLandFmv, landCompConfidence } = require('./fmv');
const { normalizeLandUnderwriting, computeSanityBands, sanityWarning } = require('./lao');
const { buildLandSubject } = require('./run-land-comp');

const REPORT_VERSION = '1';
const MIN_COMPS = 2;

function validateManualLandInput({ landFmv, comps }) {
  const fmv = Number(landFmv);
  if (!Number.isFinite(fmv) || fmv <= 0) {
    const err = new Error('Land FMV is required');
    err.code = 'FMV_REQUIRED';
    throw err;
  }
  if (!Array.isArray(comps) || comps.length < MIN_COMPS) {
    const err = new Error(`At least ${MIN_COMPS} lot comps required`);
    err.code = 'COMPS_REQUIRED';
    throw err;
  }
  for (const c of comps) {
    const price = Number(c.price ?? c.soldPrice);
    if (!Number.isFinite(price) || price <= 0) {
      const err = new Error('Each comp must have a positive sale price');
      err.code = 'COMP_PRICE_REQUIRED';
      throw err;
    }
  }
  return fmv;
}

function buildManualLandCompReport({ lead, landFmv, comps, note, sanity: sanityIn }) {
  const fmvNum = validateManualLandInput({ landFmv, comps });
  const subject = buildLandSubject(lead, {});
  const candidates = comps.map((c, i) => ({
    id: c.id || `manual-${i}`,
    address: c.address || '',
    price: Number(c.price ?? c.soldPrice),
    soldDate: c.soldDate || '',
    lotSqft: Number(c.lotSqft) || 0,
    acres: c.acres != null ? Number(c.acres) : null,
    distanceMi: c.distanceMi != null ? Number(c.distanceMi) : null,
    propertyType: c.propertyType || 'land',
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    source: 'manual'
  }));

  const scored = candidates.map((cand) => scoreLandComp(subject, cand));
  // Manual: operator-trusted prices — force include for FMV cluster even if soft rules
  for (const s of scored) {
    if (Number(s.candidate.price) > 0) s.included = true;
  }

  const fmvCheck = computeLandFmv(subject, scored);
  const existingUw = lead.landUnderwriting || {};
  const sanity = computeSanityBands({
    pocket: sanityIn?.pocket || existingUw.sanity?.pocket,
    newBuildArv: sanityIn?.newBuildArv ?? existingUw.sanity?.newBuildArv
  });
  const warn = sanityWarning(fmvNum, sanity);
  const confidence = 'manual';
  const compedAt = new Date().toISOString();

  const landComps = scored.map((s) => ({
    address: s.candidate.address,
    soldDate: s.candidate.soldDate,
    price: s.candidate.price,
    lotSqft: s.candidate.lotSqft,
    acres: s.candidate.acres,
    distanceMi: s.candidate.distanceMi,
    propertyType: s.candidate.propertyType,
    includedInFmv: true,
    ruleResults: s.rules,
    streetViewUrl: streetViewUrl({
      lat: s.candidate.lat,
      lng: s.candidate.lng,
      address: s.candidate.address
    }),
    source: 'manual'
  }));

  const report = {
    version: REPORT_VERSION,
    kind: 'land',
    subject: { ...subject, streetViewUrl: streetViewUrl(subject) },
    landFmv: fmvNum,
    fmvMethod: 'manual',
    confidence,
    source: 'manual',
    note: String(note || '').trim(),
    includedCount: landComps.length,
    excludedCount: 0,
    medianPrice: fmvCheck.medianPrice,
    sanity: { ...sanity, warning: warn },
    generatedAt: compedAt,
    comps: landComps
  };

  const underwriting = normalizeLandUnderwriting({
    ...existingUw,
    landFmv: fmvNum,
    method: 'manual',
    updatedAt: compedAt,
    sanity: { ...(existingUw.sanity || {}), ...sanity },
    compsManual: candidates.map((c) => ({
      address: c.address,
      soldPrice: c.price,
      soldDate: c.soldDate,
      acres: c.acres,
      notes: ''
    }))
  });

  return {
    report,
    leadPatch: {
      landUnderwriting: underwriting,
      landComps,
      landCompingReport: report,
      landCompedAt: compedAt,
      landCompConfidence: confidence,
      landCompSource: 'manual'
    }
  };
}

module.exports = {
  buildManualLandCompReport,
  MIN_COMPS,
  landCompConfidence
};
