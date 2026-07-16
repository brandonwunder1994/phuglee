'use strict';

/**
 * Credit-safe APN + legal description for under-contract / AOC forms.
 * One PropertyDetail call only when either field is blank.
 */

const { extractParcelFields, mergeParcelIntoLead } = require('./land/parcel');
const { buildPropertyDetailBody } = require('./land/enrich-from-reapi');

function text(v) {
  const s = String(v == null ? '' : v).trim();
  return s || '';
}

/**
 * Resolve APN + legal description from lead / deal.aocSend without calling REAPI.
 */
function readContractParcelFields(lead, deal) {
  const fromLead = extractParcelFields(lead || {});
  const aoc = deal?.aocSend && typeof deal.aocSend === 'object' ? deal.aocSend : {};
  return {
    apn: text(aoc.apn) || text(fromLead.apn) || text(lead?.parcel),
    legalDescription: text(aoc.legalDescription) || text(fromLead.legalDescription)
  };
}

function needsContractParcelPull(fields) {
  return !text(fields?.apn) || !text(fields?.legalDescription);
}

/**
 * Fill-blanks APN + legalDescription onto a lead from a mapped REAPI detail.
 */
function applyContractParcelToLead(lead, detail = {}, opts = {}) {
  const force = opts.force === true;
  const existing = extractParcelFields(lead || {});
  const fill = {};
  const apn = text(detail.apn);
  const legal = text(detail.legalDescription);
  if (apn && (force || !text(existing.apn))) fill.apn = apn;
  if (legal && (force || !text(existing.legalDescription))) fill.legalDescription = legal;
  if (!Object.keys(fill).length) {
    return { lead: { ...(lead || {}) }, filled: [], fields: readContractParcelFields(lead) };
  }
  const next = mergeParcelIntoLead(lead || {}, fill);
  next.parcelEnrichedAt = new Date().toISOString();
  next.parcelEnrichmentSource = 'reapi';
  return {
    lead: next,
    filled: Object.keys(fill),
    fields: readContractParcelFields(next)
  };
}

/**
 * Ensure APN + legal description for a catalog lead (and optional address-only subject).
 * @param {object} subject - lead-like { address, city, state, zip, parcel, propertyDetails, leadId }
 * @param {object|null} reapi - createReapiClient instance
 * @param {{ force?: boolean, lead?: object }} opts
 * @returns {Promise<{ ok, skipped?, reason?, fields, filled, lead?, pulled, error?, code? }>}
 */
async function ensureContractParcelFields(subject, reapi, opts = {}) {
  const lead = opts.lead || subject || {};
  const current = readContractParcelFields(lead, opts.deal);
  if (!opts.force && !needsContractParcelPull(current)) {
    return {
      ok: true,
      skipped: true,
      reason: 'already_complete',
      fields: current,
      filled: [],
      lead,
      pulled: false
    };
  }

  if (!reapi?.propertyDetail) {
    return {
      ok: false,
      error: 'REAPI client not configured',
      code: 'REAPI_MISSING',
      fields: current,
      filled: [],
      lead,
      pulled: false
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
      status: err.status,
      fields: current,
      filled: [],
      lead,
      pulled: true
    };
  }

  if (!text(detail?.apn) && !text(detail?.legalDescription)) {
    return {
      ok: false,
      error: 'No APN or legal description returned',
      code: 'REAPI_EMPTY',
      fields: current,
      filled: [],
      lead,
      pulled: true,
      detail
    };
  }

  const applied = applyContractParcelToLead(lead, detail, { force: opts.force });
  return {
    ok: true,
    skipped: false,
    fields: applied.fields,
    filled: applied.filled,
    lead: applied.lead,
    pulled: true,
    detail
  };
}

/**
 * Seed deal.aocSend APN/legal from resolved fields (fill-blanks only).
 */
function seedAocSendParcel(deal, fields = {}) {
  const aoc = {
    ...(deal?.aocSend && typeof deal.aocSend === 'object' ? deal.aocSend : {})
  };
  const apn = text(fields.apn);
  const legal = text(fields.legalDescription);
  let changed = false;
  if (apn && !text(aoc.apn)) {
    aoc.apn = apn;
    changed = true;
  }
  if (legal && !text(aoc.legalDescription)) {
    aoc.legalDescription = legal;
    changed = true;
  }
  if (!changed) return { deal, changed: false };
  return { deal: { ...deal, aocSend: aoc }, changed: true };
}

module.exports = {
  text,
  readContractParcelFields,
  needsContractParcelPull,
  applyContractParcelToLead,
  ensureContractParcelFields,
  seedAocSendParcel
};
