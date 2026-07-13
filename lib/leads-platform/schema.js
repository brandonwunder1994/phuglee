const crypto = require('crypto');

const LEAD_TYPES = new Set(['distressed', 'well_maintained', 'land']);
const REVIEW_STATUS = new Set(['approved', 'pending']);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);
const ENTITY_TYPES = new Set(['individual', 'llc', 'estate', 'unknown']);

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
    photos: Array.isArray(raw.photos) ? raw.photos.map(String) : [],
    comps: Array.isArray(raw.comps) ? raw.comps : [],
    publishedAt: raw.publishedAt || new Date().toISOString(),
    sourceCity: slugPart(raw.sourceCity || ''),
    pipelineVersion: slugPart(raw.pipelineVersion || ''),
    sourceListId: slugPart(raw.sourceListId || '')
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

module.exports = {
  LEAD_TYPES,
  REVIEW_STATUS,
  CONFIDENCE_LEVELS,
  ENTITY_TYPES,
  buildLeadId,
  normalizeLeadRecord,
  validateLeadRecord,
  topSignal
};
