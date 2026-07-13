const { normalizeLeadRecord, buildLeadId } = require('./schema');
const { computePriorityScore } = require('./scoring');
const { upsertLead } = require('./store');

function mapAnalyzeResultToLead(row = {}, meta = {}) {
  const address = row.address || row.streetAddress || row.street || row.normalizedAddress || '';
  const vaultLeadType = meta.leadType || row.vaultLeadType || null;
  const signalTags = [];
  if (Array.isArray(row.indicators)) signalTags.push(...row.indicators);
  if (Array.isArray(row.signalTags)) signalTags.push(...row.signalTags);
  if (row.distressSignal) signalTags.push(row.distressSignal);
  if (row.violationType) signalTags.push(row.violationType);

  const resolvedLeadType = vaultLeadType
    || (['distressed', 'well_maintained', 'land'].includes(row.bucket) ? row.bucket : null)
    || 'distressed';

  return normalizeLeadRecord({
    leadId: meta.leadId || buildLeadId({ address, city: row.city || meta.city, state: row.state || meta.state }),
    address,
    city: row.city || meta.city || '',
    state: row.state || meta.state || '',
    zip: row.zip || row.postal || row.postalCode || '',
    leadType: resolvedLeadType,
    reviewStatus: meta.reviewStatus || (resolvedLeadType === 'distressed' ? 'pending' : 'approved'),
    distressTier: row.score != null ? row.score : row.distressTier,
    confidence: row.confidence || meta.confidence || 'medium',
    signalTags: [...new Set(signalTags.map((t) => String(t).trim()).filter(Boolean))],
    ownerName: row.ownerName || row.owner || '',
    phones: row.phones || (row.phone ? [row.phone] : []),
    email: row.email || '',
    entityType: row.entityType || 'unknown',
    estARV: row.estARV || row.arv,
    estRepairs: row.estRepairs || row.repairs,
    estEquity: row.estEquity || row.equity,
    streetViewUrl: row.streetViewUrl || row.streetView || '',
    photos: row.photos || [],
    comps: row.comps || [],
    sourceCity: meta.sourceCity || '',
    sourceListId: meta.sourceListId || meta.storageKey || '',
    pipelineVersion: meta.pipelineVersion || 'v4.0',
    publishedAt: meta.publishedAt
  });
}

function mapFilterRowToLead(row = {}, meta = {}) {
  const signalTags = [];
  if (row.distressedSignalTag) signalTags.push(row.distressedSignalTag);
  if (row.matchedIndicators) {
    String(row.matchedIndicators).split(';').forEach((t) => {
      const s = t.trim();
      if (s) signalTags.push(s);
    });
  }
  return mapAnalyzeResultToLead({
    ...row,
    address: row.streetAddress || row.address,
    signalTags
  }, {
    ...meta,
    leadType: meta.leadType || 'distressed',
    confidence: row.confidenceLevel || meta.confidence || 'medium'
  });
}

function publishLead(raw, opts = {}) {
  const prebuilt = raw && typeof raw === 'object'
    && raw.address && raw.city && raw.state
    && ['distressed', 'well_maintained', 'land'].includes(raw.leadType);
  const lead = normalizeLeadRecord(prebuilt ? raw : mapAnalyzeResultToLead(raw, opts));

  if (opts.forceApprove && lead.leadType === 'distressed') {
    lead.reviewStatus = 'approved';
  }

  lead.priorityScore = computePriorityScore(lead);
  return upsertLead(lead);
}

function publishBatch(rows = [], meta = {}) {
  const results = { published: [], errors: [] };
  for (const row of rows) {
    try {
      results.published.push(publishLead(row, meta));
    } catch (err) {
      results.errors.push({ error: err.message, row });
    }
  }
  return results;
}

module.exports = {
  mapAnalyzeResultToLead,
  mapFilterRowToLead,
  publishLead,
  publishBatch
};
