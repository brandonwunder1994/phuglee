'use strict';

const { getLead } = require('../leads-platform/store');
const { upsertVaultLeadContact } = require('./sms-ghl');
const {
  enqueueSync,
  dequeueSyncBatch,
  setContactMap,
  queueDepth
} = require('./sms-store');

async function syncLeadById(leadId, d = {}) {
  const lead = getLead(leadId);
  if (!lead) {
    return { ok: false, error: 'lead not found', leadId };
  }
  if (lead.reviewStatus && lead.reviewStatus !== 'approved') {
    return { ok: false, error: 'not approved', leadId };
  }
  try {
    const result = await upsertVaultLeadContact(lead, d);
    if (result.contactId) setContactMap(leadId, result.contactId);
    return { ok: true, leadId, ...result };
  } catch (err) {
    return {
      ok: false,
      leadId,
      error: err.message || String(err),
      code: err.code || 'SYNC_FAILED'
    };
  }
}

async function processSyncQueue({ max = 20, ghl } = {}) {
  const ids = dequeueSyncBatch(max);
  const results = [];
  for (const id of ids) {
    results.push(await syncLeadById(id, ghl ? { ghl } : {}));
  }
  return {
    processed: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    queueDepth: queueDepth(),
    results
  };
}

function enqueueLeadSync(leadId) {
  return enqueueSync(leadId);
}

module.exports = {
  syncLeadById,
  processSyncQueue,
  enqueueLeadSync
};
