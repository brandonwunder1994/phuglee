const crypto = require('crypto');
const {
  normalizeLandScreen,
  normalizeFundMatches
} = require('./land/screen');
const { normalizeLandUnderwriting } = require('./land/lao');
const {
  normalizeAssetClass,
  normalizeTeardown
} = require('./land/teardown');
const { normalizeLandDisposition } = require('./land/disposition');

const LEAD_TYPES = new Set(['distressed', 'well_maintained', 'land']);
const REVIEW_STATUS = new Set(['approved', 'pending']);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);
const ENTITY_TYPES = new Set(['individual', 'llc', 'estate', 'unknown']);
const CATALOG_STATUSES = new Set(['active', 'under_contract', 'sold', 'excluded']);
/** Pre-contract sales stages (GHL DTS early pipeline). */
const SALES_STAGES = ['interested', 'warm', 'verbal_offer', 'contract_sent'];
/** Dispo / Contract Tracker stages (Terminated = fell out of contract). */
const DISPO_STAGES = ['under_contract', 'buyer_signed_aoc', 'buyer_found', 'funded', 'terminated'];
const DEAL_STAGES = new Set([...SALES_STAGES, ...DISPO_STAGES]);
const DISPO_STAGE_SET = new Set(DISPO_STAGES);
const SALES_STAGE_SET = new Set(SALES_STAGES);

/** Canonical labels for UI boards. */
const DEAL_STAGE_LABELS = {
  interested: 'Interested',
  warm: 'Warm',
  verbal_offer: 'Verbal offer',
  contract_sent: 'Waiting for Signatures',
  under_contract: 'Under contract',
  buyer_signed_aoc: 'Buyer Signed AOC',
  buyer_found: 'Buyer Submitted EMD',
  funded: 'Funded',
  terminated: 'Terminated'
};

function isSalesStage(stage) {
  return SALES_STAGE_SET.has(String(stage || '').trim());
}

function isDispoStage(stage) {
  return DISPO_STAGE_SET.has(String(stage || '').trim());
}

/** Migrate removed stage ids (e.g. closing → buyer_found). */
function canonicalizeDealStage(stage) {
  const s = String(stage || '').trim();
  if (s === 'closing') return 'buyer_found';
  if (DEAL_STAGES.has(s)) return s;
  return 'under_contract';
}

function slugPart(value) {
  return String(value || '').trim();
}

function buildLeadId({ address, city, state } = {}) {
  const key = [slugPart(address), slugPart(city), slugPart(state).toUpperCase().slice(0, 2)]
    .join('|')
    .toLowerCase();
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function normalizeLeadRecord(raw = {}) {
  const address = slugPart(raw.address || raw.streetAddress || '');
  const city = slugPart(raw.city || '');
  const state = slugPart(raw.state || '').toUpperCase().slice(0, 2);
  const leadId = slugPart(raw.leadId) || buildLeadId({ address, city, state });
  const signalTags = Array.isArray(raw.signalTags)
    ? raw.signalTags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const phones = Array.isArray(raw.phones)
    ? raw.phones.map((p) => String(p).trim()).filter(Boolean)
    : (raw.phone ? [String(raw.phone).trim()] : []);

  return {
    leadId,
    address,
    city,
    state,
    zip: slugPart(raw.zip || raw.postalCode || ''),
    parcel: slugPart(raw.parcel || ''),
    lat: raw.lat == null ? null : Number(raw.lat),
    lng: raw.lng == null ? null : Number(raw.lng),
    leadType: slugPart(raw.leadType),
    assetClass: normalizeAssetClass(raw.assetClass),
    teardown: raw.teardown && typeof raw.teardown === 'object'
      ? normalizeTeardown(raw.teardown)
      : null,
    propertyType: slugPart(raw.propertyType || ''),
    occupancy: slugPart(raw.occupancy || 'unknown') || 'unknown',
    reviewStatus: slugPart(raw.reviewStatus || 'pending') || 'pending',
    priorityScore: Math.max(0, Math.min(100, Math.round(Number(raw.priorityScore) || 0))),
    distressTier: raw.distressTier == null ? null : Number(raw.distressTier),
    confidence: CONFIDENCE_LEVELS.has(raw.confidence) ? raw.confidence : 'medium',
    signalTags,
    estARV: raw.estARV == null ? null : Number(raw.estARV),
    estRepairs: raw.estRepairs == null ? null : Number(raw.estRepairs),
    estEquity: raw.estEquity == null ? null : Number(raw.estEquity),
    lastSale: raw.lastSale && typeof raw.lastSale === 'object' ? raw.lastSale : null,
    assessedValue: raw.assessedValue == null ? null : Number(raw.assessedValue),
    ownerName: slugPart(raw.ownerName || ''),
    phones,
    email: slugPart(raw.email || ''),
    mailingAddress: slugPart(raw.mailingAddress || ''),
    entityType: ENTITY_TYPES.has(raw.entityType) ? raw.entityType : 'unknown',
    streetViewUrl: slugPart(raw.streetViewUrl || ''),
    satelliteUrl: slugPart(raw.satelliteUrl || ''),
    photos: Array.isArray(raw.photos) ? raw.photos.map(String) : [],
    comps: Array.isArray(raw.comps) ? raw.comps : [],
    compedAt: slugPart(raw.compedAt || '') || null,
    compConfidence: slugPart(raw.compConfidence || '') || null,
    compSource: slugPart(raw.compSource || '') || null,
    compBlockPass: ['pass', 'kill'].includes(slugPart(raw.compBlockPass))
      ? slugPart(raw.compBlockPass) : null,
    compingReport: raw.compingReport && typeof raw.compingReport === 'object'
      ? raw.compingReport : null,
    compReportFiles: Array.isArray(raw.compReportFiles) ? raw.compReportFiles : [],
    propertyDetails: raw.propertyDetails && typeof raw.propertyDetails === 'object'
      ? raw.propertyDetails
      : {},
    financialDetails: raw.financialDetails && typeof raw.financialDetails === 'object'
      ? raw.financialDetails
      : {},
    distress: raw.distress && typeof raw.distress === 'object' ? raw.distress : null,
    codeViolation: raw.codeViolation && typeof raw.codeViolation === 'object'
      ? raw.codeViolation
      : null,
    whySurfaced: slugPart(raw.whySurfaced || ''),
    skipTrace: raw.skipTrace && typeof raw.skipTrace === 'object' ? {
      status: slugPart(raw.skipTrace.status || '') || null,
      tracedAt: slugPart(raw.skipTrace.tracedAt || '') || null,
      source: slugPart(raw.skipTrace.source || ''),
      peopleFound: raw.skipTrace.peopleFound == null ? null : Number(raw.skipTrace.peopleFound),
      cached: raw.skipTrace.cached === true
    } : null,
    enrichedAt: slugPart(raw.enrichedAt || '') || null,
    enrichmentSource: slugPart(raw.enrichmentSource || ''),
    publishedAt: raw.publishedAt || new Date().toISOString(),
    sourceCity: slugPart(raw.sourceCity || ''),
    pipelineVersion: slugPart(raw.pipelineVersion || ''),
    sourceListId: slugPart(raw.sourceListId || ''),
    catalogStatus: CATALOG_STATUSES.has(slugPart(raw.catalogStatus))
      ? slugPart(raw.catalogStatus)
      : 'active',
    landScreen: normalizeLandScreen(raw.landScreen || {}),
    fundMatches: normalizeFundMatches(raw.fundMatches),
    fundMatchedAt: slugPart(raw.fundMatchedAt || '') || null,
    landUnderwriting: normalizeLandUnderwriting(raw.landUnderwriting || {}),
    landDisposition: normalizeLandDisposition(raw.landDisposition || {}),
    landComps: Array.isArray(raw.landComps) ? raw.landComps : [],
    landCompingReport: raw.landCompingReport && typeof raw.landCompingReport === 'object'
      ? raw.landCompingReport : null,
    landCompedAt: slugPart(raw.landCompedAt || '') || null,
    landCompConfidence: slugPart(raw.landCompConfidence || '') || null,
    landCompSource: slugPart(raw.landCompSource || '') || null
  };
}

function validateLeadRecord(lead) {
  if (!lead || typeof lead !== 'object') return { ok: false, error: 'invalid lead' };
  if (!lead.leadId) return { ok: false, error: 'missing leadId' };
  if (!LEAD_TYPES.has(lead.leadType)) return { ok: false, error: 'invalid leadType' };
  if (!lead.address || !lead.city || !lead.state) return { ok: false, error: 'missing address' };
  if (!REVIEW_STATUS.has(lead.reviewStatus)) return { ok: false, error: 'invalid reviewStatus' };
  if (lead.leadType === 'distressed' && lead.reviewStatus !== 'approved') {
    return { ok: false, error: 'distressed requires approval' };
  }
  if (!Array.isArray(lead.signalTags)) return { ok: false, error: 'signalTags required' };
  return { ok: true };
}

function topSignal(signalTags = []) {
  const tags = Array.isArray(signalTags) ? signalTags : [];
  return tags[0] || '—';
}

function catalogStatusForDealStage(stage) {
  const s = slugPart(stage);
  if (s === 'funded') return 'sold';
  // Fell out of contract — keep off The Vault so Max users cannot retarget it
  if (s === 'terminated') return 'excluded';
  // Any active DTS pipeline stage pulls the lead off The Vault
  if (DEAL_STAGES.has(s)) return 'under_contract';
  return 'active';
}

function computeDealProfit(deal = {}) {
  if (deal.profitOverride != null && deal.profitOverride !== '' && !Number.isNaN(Number(deal.profitOverride))) {
    return Number(deal.profitOverride);
  }
  const fee = deal.assignmentFee == null ? null : Number(deal.assignmentFee);
  if (fee != null && !Number.isNaN(fee)) return fee;
  return null;
}

/**
 * Lower rank = closer to funding = higher on Contract Tracker / pipeline lists.
 * Terminated is always last. Sales stages sit below under_contract.
 */
const DEAL_STAGE_PROCESS_RANK = {
  funded: 0,
  buyer_found: 1,
  buyer_signed_aoc: 2,
  under_contract: 3,
  contract_sent: 4,
  verbal_offer: 5,
  warm: 6,
  interested: 7,
  terminated: 8
};

function processYes(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const v = String(value || '').trim().toLowerCase();
  return v === 'yes' || v === 'y' || v === 'true' || v === '1' || v === 'submitted';
}

function processRehabFilled(rehab) {
  if (processYes(rehab)) return true;
  if (!rehab || typeof rehab !== 'object') return false;
  return Boolean(
    slugPart(rehab.roof)
    || slugPart(rehab.ac)
    || slugPart(rehab.foundation)
    || slugPart(rehab.electrical)
    || slugPart(rehab.plumbing)
    || slugPart(rehab.other || rehab.notes || rehab.custom)
  );
}

function processBuyerFound(deal = {}) {
  const stage = canonicalizeDealStage(deal.stage);
  // buyer_signed_aoc means end buyer is on the file (AOC), even before EMD
  if (stage === 'buyer_signed_aoc' || stage === 'buyer_found' || stage === 'funded') return true;
  if (slugPart(deal.cashBuyerName)) return true;
  if (processYes(deal.buyerFound)) return true;
  const ba = deal.buyerAssignment;
  if (ba && typeof ba === 'object') {
    if (slugPart(ba.buyerEntity) || slugPart(ba.buyerEmail) || slugPart(ba.buyerContactName)) {
      return true;
    }
  }
  return false;
}

/** Checklist progress toward funding (higher = higher on list within a stage). */
function dealProcessProgressScore(deal = {}) {
  let score = 0;
  if (processYes(deal.buyerEmdSubmitted)) score += 32;
  if (processBuyerFound(deal)) score += 16;
  if (processYes(deal.rehabInfoReady) || processRehabFilled(deal.rehabInfo)) score += 8;
  if (processYes(deal.photosAvailable)) score += 4;
  if (processYes(deal.titleOpened)) score += 2;
  if (processYes(deal.sellerEmdSubmitted)) score += 1;
  return score;
}

/**
 * Sort comparator: closer to funding first; within stage by checklist progress;
 * stable tie-break so incidental updatedAt churn does not reshuffle rows.
 */
function compareDealsByProcess(a = {}, b = {}) {
  const stageA = canonicalizeDealStage(a.stage);
  const stageB = canonicalizeDealStage(b.stage);
  const rankA = DEAL_STAGE_PROCESS_RANK[stageA] ?? 50;
  const rankB = DEAL_STAGE_PROCESS_RANK[stageB] ?? 50;
  if (rankA !== rankB) return rankA - rankB;

  const progressDiff = dealProcessProgressScore(b) - dealProcessProgressScore(a);
  if (progressDiff) return progressDiff;

  if (stageA === 'funded') {
    const fundedCmp = String(b.fundedAt || '').localeCompare(String(a.fundedAt || ''));
    if (fundedCmp) return fundedCmp;
  }

  const createdCmp = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  if (createdCmp) return createdCmp;

  return String(a.dealId || '').localeCompare(String(b.dealId || ''));
}

module.exports = {
  LEAD_TYPES,
  REVIEW_STATUS,
  CONFIDENCE_LEVELS,
  ENTITY_TYPES,
  CATALOG_STATUSES,
  SALES_STAGES,
  DISPO_STAGES,
  DEAL_STAGES,
  DEAL_STAGE_LABELS,
  DEAL_STAGE_PROCESS_RANK,
  isSalesStage,
  isDispoStage,
  canonicalizeDealStage,
  buildLeadId,
  normalizeLeadRecord,
  validateLeadRecord,
  topSignal,
  catalogStatusForDealStage,
  computeDealProfit,
  dealProcessProgressScore,
  compareDealsByProcess
};
