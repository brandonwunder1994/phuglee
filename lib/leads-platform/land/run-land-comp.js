'use strict';

/**
 * Auto Land Comp — REAPI lot solds + land rules → FMV (not house ARV).
 */

const { isNonDisclosureState } = require('../comping/nd-states');
const { mapReapiCompsResponse } = require('../comping/reapi-client');
const { streetViewUrl } = require('../comping/street-view');
const { scoreLandComp } = require('./comping-rules');
const { computeLandFmv, landCompConfidence } = require('./fmv');
const { computeSanityBands, sanityWarning, normalizeLandUnderwriting } = require('./lao');
const { fillBlankParcelFromDetail, buildPropertyDetailBody } = require('./enrich-from-reapi');

const REPORT_VERSION = '1';
const RADII = [0.25, 0.5, 1.0];
const MIN_INCLUDED = 2;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildLandSubject(lead, detail = {}) {
  const pd = lead.propertyDetails || {};
  const lotSqft = num(pd.lotSqft || detail.lotSqft, 0)
    || (num(pd.acres || detail.acres, 0) > 0 ? num(pd.acres || detail.acres) * 43560 : 0);
  const acres = num(pd.acres || detail.acres, 0)
    || (lotSqft > 0 ? lotSqft / 43560 : 0);
  return {
    address: lead.address,
    city: lead.city,
    state: lead.state,
    lat: lead.lat ?? detail.lat ?? null,
    lng: lead.lng ?? detail.lng ?? null,
    lotSqft,
    acres,
    propertyType: pd.propertyType || detail.propertyType || 'land',
    zoning: pd.zoning || detail.zoning || ''
  };
}

function compKey(c) {
  return String(c.id || c.address || `${c.lat},${c.lng}`);
}

async function pullComps(reapi, subject, radius) {
  if (!reapi?.propertyComps) return [];
  // PropertyComps wants address + max_radius_miles (same as house comps) — not lat/lng/radius.
  const fullAddress = [subject.address, subject.city, subject.state]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
  const body = {
    address: fullAddress || subject.address,
    max_radius_miles: radius
  };
  if (subject.lotSqft > 0) body.lot_size = subject.lotSqft;
  const raw = await reapi.propertyComps(body);
  return mapReapiCompsResponse(raw);
}

async function runLandAutoComp(lead, opts = {}) {
  if (isNonDisclosureState(lead.state)) {
    return { ok: false, needsManual: true, reason: 'non_disclosure' };
  }
  if (lead.leadType !== 'land') {
    return { ok: false, error: 'Not a land lead', code: 'NOT_LAND' };
  }

  const reapi = opts.reapi;
  if (!reapi?.propertyComps) {
    return { ok: false, error: 'REAPI client not configured', code: 'REAPI_MISSING' };
  }

  let detail = {};
  if (reapi.propertyDetail) {
    try {
      detail = await reapi.propertyDetail(buildPropertyDetailBody(lead));
    } catch {
      detail = {};
    }
  }

  const subject = buildLandSubject(lead, detail);
  const seen = new Set();
  const allScored = [];

  for (const radius of RADII) {
    let mapped = [];
    try {
      mapped = await pullComps(reapi, subject, radius);
    } catch {
      mapped = [];
    }
    for (const c of mapped) {
      const key = compKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      if (c.distanceMi == null) c.distanceMi = radius;
      allScored.push(scoreLandComp(subject, c));
    }
    const included = allScored.filter((s) => s.included).length;
    if (included >= MIN_INCLUDED) break;
  }

  const fmvResult = computeLandFmv(subject, allScored);
  const existingUw = lead.landUnderwriting || {};
  const sanity = computeSanityBands({
    pocket: existingUw.sanity?.pocket,
    newBuildArv: existingUw.sanity?.newBuildArv
      ?? detail.newConstructionCeiling
      ?? null
  });
  const warn = sanityWarning(fmvResult.landFmv, sanity);
  const confidence = landCompConfidence({
    includedCount: fmvResult.includedCount,
    method: fmvResult.method,
    sanityDisagree: Boolean(warn)
  });

  const compedAt = new Date().toISOString();
  const landComps = allScored.map((s) => ({
    address: s.candidate.address,
    soldDate: s.candidate.soldDate,
    price: s.candidate.price,
    lotSqft: s.candidate.lotSqft,
    acres: s.candidate.acres ?? (s.candidate.lotSqft ? s.candidate.lotSqft / 43560 : null),
    distanceMi: s.candidate.distanceMi,
    propertyType: s.candidate.propertyType,
    includedInFmv: s.included,
    ruleResults: s.rules,
    streetViewUrl: streetViewUrl({
      lat: s.candidate.lat,
      lng: s.candidate.lng,
      address: s.candidate.address
    }),
    source: s.candidate.source || 'reapi'
  }));

  const report = {
    version: REPORT_VERSION,
    kind: 'land',
    subject: {
      ...subject,
      streetViewUrl: streetViewUrl(subject)
    },
    landFmv: confidence === 'blocked' ? null : fmvResult.landFmv,
    fmvMethod: fmvResult.method,
    confidence,
    source: 'reapi',
    includedCount: fmvResult.includedCount,
    excludedCount: fmvResult.excludedCount,
    medianPrice: fmvResult.medianPrice,
    medianPricePerAcre: fmvResult.medianPricePerAcre,
    fmvFromAcres: fmvResult.fmvFromAcres,
    sanity: {
      ...sanity,
      warning: warn,
      avm: detail.estimatedValue ?? null,
      notes: detail.estimatedValue
        ? ['Vendor AVM shown for sanity only — not used as land FMV']
        : []
    },
    generatedAt: compedAt,
    comps: landComps
  };

  const parcelFill = fillBlankParcelFromDetail(lead, detail);
  const parcelPatch = {};
  if (parcelFill.filled.length || parcelFill.coordsFilled.length) {
    Object.assign(parcelPatch, {
      propertyDetails: parcelFill.lead.propertyDetails,
      parcel: parcelFill.lead.parcel,
      parcelEnrichedAt: parcelFill.lead.parcelEnrichedAt,
      parcelEnrichmentSource: parcelFill.lead.parcelEnrichmentSource
    });
    if (parcelFill.coordsFilled.includes('lat')) parcelPatch.lat = parcelFill.lead.lat;
    if (parcelFill.coordsFilled.includes('lng')) parcelPatch.lng = parcelFill.lead.lng;
  }

  if (confidence === 'blocked' || fmvResult.landFmv == null) {
    return {
      ok: false,
      needsManual: true,
      reason: 'thin_market',
      report,
      leadPatch: {
        ...parcelPatch,
        landCompingReport: report,
        landCompedAt: compedAt,
        landCompConfidence: confidence,
        landCompSource: 'reapi'
      }
    };
  }

  const underwriting = normalizeLandUnderwriting({
    ...existingUw,
    landFmv: fmvResult.landFmv,
    method: 'engine',
    updatedAt: compedAt,
    sanity: {
      ...(existingUw.sanity || {}),
      ...sanity
    },
    compsManual: existingUw.compsManual || []
  });

  return {
    ok: true,
    report,
    leadPatch: {
      ...parcelPatch,
      landUnderwriting: underwriting,
      landComps,
      landCompingReport: report,
      landCompedAt: compedAt,
      landCompConfidence: confidence,
      landCompSource: 'reapi'
    }
  };
}

module.exports = {
  runLandAutoComp,
  buildLandSubject,
  MIN_INCLUDED
};
