'use strict';

/**
 * Fill land parcel fields from RealEstateAPI PropertyDetail (fill-blanks only).
 */

const { extractParcelFields, mergeParcelIntoLead } = require('./parcel');

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v) {
  const s = String(v == null ? '' : v).trim();
  return s || '';
}

function isBlankText(v) {
  return !text(v);
}

function isBlankNum(v) {
  const n = num(v);
  return n == null || n <= 0;
}

function parcelPatchFromDetail(detail = {}) {
  const acres = num(detail.acres);
  const lotSqft = num(detail.lotSqft);
  const width = num(detail.lotWidthFeet);
  const depth = num(detail.lotDepthFeet);
  let frontage = text(detail.frontage);
  if (!frontage && width != null && width > 0) {
    frontage = depth != null && depth > 0
      ? `${Math.round(width)} ft x ${Math.round(depth)} ft`
      : `${Math.round(width)} ft`;
  }
  return {
    acres: acres != null && acres > 0 ? acres : null,
    lotSqft: lotSqft != null && lotSqft > 0 ? Math.round(lotSqft) : null,
    zoning: text(detail.zoning),
    landUse: text(detail.landUse),
    county: text(detail.county),
    apn: text(detail.apn),
    water: text(detail.water),
    sewer: text(detail.sewer),
    flood: text(detail.flood),
    frontage,
    topography: text(detail.topography)
  };
}

/**
 * Merge REAPI parcel values into a lead without overwriting operator-entered data.
 * Also fills blank lat/lng from detail.
 */
function fillBlankParcelFromDetail(lead, detail = {}, opts = {}) {
  const force = opts.force === true;
  const existing = extractParcelFields(lead);
  const patch = parcelPatchFromDetail(detail);
  const fill = {};
  const skipped = [];

  const consider = (key, blankFn) => {
    const val = patch[key];
    if (val == null || val === '') return;
    if (!force && !blankFn(existing[key])) {
      skipped.push(key);
      return;
    }
    fill[key] = val;
  };

  consider('acres', isBlankNum);
  consider('lotSqft', isBlankNum);
  consider('zoning', isBlankText);
  consider('landUse', isBlankText);
  consider('county', isBlankText);
  consider('apn', isBlankText);
  consider('water', isBlankText);
  consider('sewer', isBlankText);
  consider('flood', isBlankText);
  consider('frontage', isBlankText);
  consider('topography', isBlankText);

  let next = Object.keys(fill).length ? mergeParcelIntoLead(lead, fill) : { ...lead };
  const coords = {};
  const lat = num(detail.lat);
  const lng = num(detail.lng);
  if (lat != null && (force || next.lat == null || next.lat === '')) {
    next = { ...next, lat };
    coords.lat = lat;
  }
  if (lng != null && (force || next.lng == null || next.lng === '')) {
    next = { ...next, lng };
    coords.lng = lng;
  }

  const enrichedAt = new Date().toISOString();
  if (Object.keys(fill).length || Object.keys(coords).length) {
    next = {
      ...next,
      parcelEnrichedAt: enrichedAt,
      parcelEnrichmentSource: 'reapi'
    };
  }

  return {
    lead: next,
    filled: Object.keys(fill),
    coordsFilled: Object.keys(coords),
    skipped,
    detail
  };
}

function buildPropertyDetailBody(lead = {}) {
  const streetLine = text(lead.address);
  const city = text(lead.city);
  const state = text(lead.state);
  const zip = text(lead.zip || lead.zipCode);
  const body = {};

  // PropertyDetail wants either a full "123 Main St, City ST 12345" string,
  // or house+street+city+state components — not a bare street in `address`.
  if (streetLine && city && state) {
    body.address = `${streetLine}, ${city} ${state}${zip ? ` ${zip}` : ''}`.trim();
  } else if (streetLine) {
    const m = streetLine.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
    if (m) {
      body.house = m[1];
      body.street = m[2];
    } else {
      body.street = streetLine;
    }
    if (city) body.city = city;
    if (state) body.state = state;
    if (zip) body.zip = zip;
  }

  const apn = text(lead.parcel || lead.propertyDetails?.apn);
  if (apn) body.apn = apn;
  const fips = text(lead.fips || lead.propertyDetails?.fips);
  if (fips) body.fips = fips;

  // PropertyDetail rejects latitude/longitude ("latitude is not allowed").
  // Response still includes coords for fill-blanks.

  return body;
}

async function enrichLandLeadFromReapi(lead, reapi, opts = {}) {
  if (!lead || lead.leadType !== 'land') {
    return { ok: false, error: 'Not a land lead', code: 'NOT_LAND' };
  }
  if (!reapi?.propertyDetail) {
    return { ok: false, error: 'REAPI client not configured', code: 'REAPI_MISSING' };
  }

  const existing = extractParcelFields(lead);
  const needs = opts.force === true || [
    isBlankNum(existing.acres) && isBlankNum(existing.lotSqft),
    isBlankText(existing.zoning),
    isBlankText(existing.county),
    isBlankText(existing.apn),
    isBlankText(existing.water),
    isBlankText(existing.sewer),
    isBlankText(existing.flood),
    isBlankText(existing.frontage),
    lead.lat == null || lead.lng == null
  ].some(Boolean);

  if (!needs && opts.skipComplete !== false) {
    return {
      ok: true,
      skipped: true,
      reason: 'already_complete',
      lead,
      filled: [],
      coordsFilled: [],
      skippedFields: []
    };
  }

  let detail;
  try {
    detail = await reapi.propertyDetail(buildPropertyDetailBody(lead));
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'PropertyDetail failed',
      code: err.code || 'REAPI_DETAIL_FAILED',
      status: err.status
    };
  }

  if (!detail || (!detail.lotSqft && !detail.acres && !detail.zoning && !detail.apn && detail.lat == null)) {
    return {
      ok: false,
      error: 'No parcel data returned',
      code: 'REAPI_EMPTY',
      detail
    };
  }

  const result = fillBlankParcelFromDetail(lead, detail, { force: opts.force });
  return {
    ok: true,
    skipped: false,
    lead: result.lead,
    filled: result.filled,
    coordsFilled: result.coordsFilled,
    skippedFields: result.skipped,
    detail
  };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Enrich many land leads. Caller persists via upsert.
 * @returns {{ results, summary }}
 */
async function enrichLandLeadsFromReapi(leads, reapi, opts = {}) {
  const concurrency = Math.max(1, Number(opts.concurrency) || 2);
  const delayMs = Math.max(0, Number(opts.delayMs) || 150);
  const list = Array.isArray(leads) ? leads : [];

  const results = await mapPool(list, concurrency, async (lead, i) => {
    if (delayMs && i > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const out = await enrichLandLeadFromReapi(lead, reapi, opts);
    return {
      leadId: lead?.leadId,
      address: lead?.address,
      ...out
    };
  });

  const summary = {
    total: results.length,
    updated: 0,
    skippedComplete: 0,
    empty: 0,
    errors: 0,
    fieldsFilled: {}
  };

  for (const r of results) {
    if (r.skipped && r.reason === 'already_complete') {
      summary.skippedComplete += 1;
      continue;
    }
    if (!r.ok) {
      if (r.code === 'REAPI_EMPTY') summary.empty += 1;
      else summary.errors += 1;
      continue;
    }
    if ((r.filled && r.filled.length) || (r.coordsFilled && r.coordsFilled.length)) {
      summary.updated += 1;
      for (const f of r.filled || []) {
        summary.fieldsFilled[f] = (summary.fieldsFilled[f] || 0) + 1;
      }
      for (const f of r.coordsFilled || []) {
        summary.fieldsFilled[f] = (summary.fieldsFilled[f] || 0) + 1;
      }
    } else {
      summary.skippedComplete += 1;
    }
  }

  return { results, summary };
}

module.exports = {
  parcelPatchFromDetail,
  fillBlankParcelFromDetail,
  buildPropertyDetailBody,
  enrichLandLeadFromReapi,
  enrichLandLeadsFromReapi
};
