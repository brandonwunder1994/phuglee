'use strict';

/**
 * Pull DTS under-contract+ opportunities from GHL into Phuglee deals
 * and hide matching Vault leads.
 */

const ghl = require('./ghl-client');
const {
  upsertDeal,
  findDealByGhlOpportunityId,
  resolveLeadIdFromAddress,
  applyCatalogStatusForDeal,
  normalizeMoney,
  mergeGhlDocumentsOntoDeal,
  formatClosingSlash,
  pickDeskLocalFields
} = require('./contracts');

/** GHL DTS stage name → Phuglee deal stage */
const STAGE_RULES = [
  { re: /funded/i, stage: 'funded' },
  { re: /in line to close/i, stage: 'closing' },
  { re: /aoc signed/i, stage: 'buyer_found' },
  { re: /aoc sent/i, stage: 'buyer_found' },
  { re: /escrow opened/i, stage: 'under_contract' },
  { re: /seller signed/i, stage: 'under_contract' }
];

/** Stages that belong on the Under Contract board */
const CONTRACT_STAGE_RE = /seller signed|escrow opened|aoc sent|aoc signed|in line to close|funded/i;

function mapGhlStageName(stageName) {
  const name = String(stageName || '');
  for (const rule of STAGE_RULES) {
    if (rule.re.test(name)) return rule.stage;
  }
  return null;
}

function isContractBoardStage(stageName) {
  return CONTRACT_STAGE_RE.test(String(stageName || ''));
}

function stageIdToName(pipeline, stageId) {
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
  const hit = stages.find((s) => s.id === stageId);
  return hit?.name || '';
}

function parseAddressFromOppName(name) {
  // Common pattern: "123 Main St — City ST" or "123 Main St, City, ST"
  const text = String(name || '').trim();
  if (!text) return { address: '', city: '', state: '' };
  const dash = text.split(/\s+[—–-]\s+/);
  if (dash.length >= 2) {
    const cityState = dash[dash.length - 1].trim();
    const m = cityState.match(/^(.+?)\s+([A-Z]{2})\s*$/);
    if (m) return { address: dash[0].trim(), city: m[1].trim(), state: m[2] };
  }
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1];
    const st = (stateZip.match(/\b([A-Z]{2})\b/) || [])[1] || '';
    return { address: parts[0], city: parts[1], state: st };
  }
  return { address: text, city: '', state: '' };
}

async function fetchAllDtsContractOpps(pipeline) {
  const stageIds = (pipeline.stages || [])
    .filter((s) => isContractBoardStage(s.name))
    .map((s) => s.id);

  const byId = new Map();
  // Search open opps on pipeline, then filter by stage client-side
  // (stage-specific search can miss depending on GHL API quirks)
  let page = 1;
  let guard = 0;
  while (guard < 40) {
    guard += 1;
    const { opportunities } = await ghl.searchOpportunities({
      pipelineId: pipeline.id,
      status: 'open',
      limit: 100,
      page
    });
    if (!opportunities.length) break;
    for (const opp of opportunities) {
      if (!opp?.id) continue;
      const stageName = stageIdToName(pipeline, opp.pipelineStageId) || opp.pipelineStageName || '';
      if (!isContractBoardStage(stageName)) continue;
      if (stageIds.length && opp.pipelineStageId && !stageIds.includes(opp.pipelineStageId)
        && !isContractBoardStage(stageName)) {
        continue;
      }
      byId.set(opp.id, { ...opp, _stageName: stageName });
    }
    if (opportunities.length < 100) break;
    page += 1;
  }

  // Also pull won/funded if they linger as won status
  page = 1;
  guard = 0;
  while (guard < 20) {
    guard += 1;
    let opportunities = [];
    try {
      ({ opportunities } = await ghl.searchOpportunities({
        pipelineId: pipeline.id,
        status: 'won',
        limit: 100,
        page
      }));
    } catch (_) {
      break;
    }
    if (!opportunities.length) break;
    for (const opp of opportunities) {
      if (!opp?.id) continue;
      const stageName = stageIdToName(pipeline, opp.pipelineStageId) || opp.pipelineStageName || 'Funded';
      if (!isContractBoardStage(stageName) && !/funded/i.test(stageName)) continue;
      byId.set(opp.id, { ...opp, _stageName: stageName || 'Funded' });
    }
    if (opportunities.length < 100) break;
    page += 1;
  }

  return [...byId.values()];
}

async function upsertDealFromOpportunity(opp, pipeline, contactSummary) {
  const stageName = opp._stageName || stageIdToName(pipeline, opp.pipelineStageId) || '';
  const stage = mapGhlStageName(stageName) || 'under_contract';

  const fromContact = contactSummary || {};
  const fromName = parseAddressFromOppName(opp.name);
  const address = fromContact.address1 || fromName.address || '';
  const city = fromContact.city || fromName.city || '';
  const state = (fromContact.state || fromName.state || '').toUpperCase().slice(0, 2);
  const zip = fromContact.zip || '';

  let leadId = resolveLeadIdFromAddress({ address, city, state });
  const existing = findDealByGhlOpportunityId(opp.id);
  const deskKeep = pickDeskLocalFields(existing);

  // Prefer opportunity monetaryValue as purchase if contact missing price
  const purchasePrice = normalizeMoney(fromContact.contractPrice)
    ?? normalizeMoney(opp.monetaryValue)
    ?? existing?.purchasePrice
    ?? null;

  const deal = upsertDeal({
    ...(existing || {}),
    ...deskKeep,
    dealId: existing?.dealId,
    ghlOpportunityId: opp.id,
    ghlContactId: opp.contactId || fromContact.id || existing?.ghlContactId || null,
    ghlPipelineId: pipeline.id,
    ghlStageId: opp.pipelineStageId || null,
    ghlStageName: stageName,
    stage,
    address: address || existing?.address || '',
    city: city || existing?.city || '',
    state: state || existing?.state || '',
    zip: zip || existing?.zip || '',
    ownerName: fromContact.sellersName || fromContact.name || existing?.ownerName || '',
    phone: fromContact.phone || existing?.phone || '',
    email: fromContact.email || existing?.email || '',
    purchasePrice,
    assignmentFee: normalizeMoney(fromContact.assignmentFee) ?? existing?.assignmentFee ?? null,
    cashBuyerName: fromContact.cashBuyerName || existing?.cashBuyerName || '',
    closingDate: fromContact.closingDate || existing?.closingDate || '',
    originalAgreementDate: formatClosingSlash(fromContact.contractSignedDate)
      || existing?.originalAgreementDate
      || deskKeep.originalAgreementDate
      || '',
    emdDeposit: normalizeMoney(fromContact.emdDeposit) ?? existing?.emdDeposit ?? null,
    leadId: leadId || existing?.leadId || null,
    source: 'ghl',
    // Keep local desk edits (rehab, title, EMD, notes, …) when refreshing from GHL
    profitOverride: deskKeep.profitOverride ?? existing?.profitOverride ?? null,
    notes: deskKeep.notes != null ? deskKeep.notes : (existing?.notes || '')
  });

  applyCatalogStatusForDeal(deal);
  return deal;
}

async function syncContractsFromGhl(opts = {}) {
  if (!ghl.isConfigured()) {
    const err = new Error('GHL is not configured (set GHL_API_KEY and GHL_LOCATION_ID)');
    err.code = 'GHL_NOT_CONFIGURED';
    throw err;
  }

  const pipeline = await ghl.findDtsPipeline();
  const opps = await fetchAllDtsContractOpps(pipeline);
  const stats = {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    scanned: opps.length,
    upserted: 0,
    linkedLeads: 0,
    errors: [],
    deals: []
  };

  const concurrency = Math.max(1, Math.min(5, Number(opts.concurrency) || 4));
  let i = 0;
  async function worker() {
    while (i < opps.length) {
      const idx = i;
      i += 1;
      const opp = opps[idx];
      try {
        let contactSummary = null;
        let ghlDocs = [];
        if (opp.contactId) {
          try {
            const contact = await ghl.getContact(opp.contactId);
            contactSummary = ghl.summarizeContactMoney(contact);
            ghlDocs = ghl.extractContactDocuments(contact);
          } catch (cerr) {
            stats.errors.push({ opportunityId: opp.id, error: `contact: ${cerr.message}` });
          }
        }
        const deal = await upsertDealFromOpportunity(opp, pipeline, contactSummary);
        if (ghlDocs.length) {
          mergeGhlDocumentsOntoDeal(deal.dealId, ghlDocs);
        }
        stats.upserted += 1;
        if (deal.leadId) stats.linkedLeads += 1;
        stats.deals.push({
          dealId: deal.dealId,
          stage: deal.stage,
          address: deal.address,
          leadId: deal.leadId
        });
      } catch (err) {
        stats.errors.push({ opportunityId: opp.id, error: err.message });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return stats;
}

module.exports = {
  STAGE_RULES,
  mapGhlStageName,
  isContractBoardStage,
  parseAddressFromOppName,
  syncContractsFromGhl,
  upsertDealFromOpportunity
};
