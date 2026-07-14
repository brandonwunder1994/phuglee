'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { catalogRoot, getLead, setLeadCatalogStatus } = require('./store');
const {
  DEAL_STAGES,
  buildLeadId,
  catalogStatusForDealStage,
  computeDealProfit
} = require('./schema');

function slugPart(value) {
  return String(value || '').trim();
}

function contractsRoot() {
  return path.join(catalogRoot(), 'contracts');
}

function contractsIndexPath() {
  return path.join(contractsRoot(), 'index.json');
}

function dealPath(dealId) {
  const safe = String(dealId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return path.join(contractsRoot(), `${safe}.json`);
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn('[Contracts] Could not read', filePath, err.message);
    return fallback;
  }
}

function buildDealId({ ghlOpportunityId, leadId, address, city, state } = {}) {
  if (ghlOpportunityId) {
    return `ghl_${String(ghlOpportunityId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
  }
  if (leadId) return `lead_${String(leadId).slice(0, 32)}`;
  const key = [address, city, state, Date.now()].join('|').toLowerCase();
  return `deal_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

function normalizeMoney(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeDeal(raw = {}) {
  const stage = DEAL_STAGES.has(slugPart(raw.stage)) ? slugPart(raw.stage) : 'under_contract';
  const purchasePrice = normalizeMoney(raw.purchasePrice);
  const assignmentFee = normalizeMoney(raw.assignmentFee);
  const profitOverride = raw.profitOverride == null || raw.profitOverride === ''
    ? null
    : normalizeMoney(raw.profitOverride);
  const deal = {
    dealId: slugPart(raw.dealId) || buildDealId(raw),
    leadId: slugPart(raw.leadId) || null,
    address: slugPart(raw.address),
    city: slugPart(raw.city),
    state: slugPart(raw.state).toUpperCase().slice(0, 2),
    zip: slugPart(raw.zip || raw.postalCode),
    stage,
    purchasePrice,
    assignmentFee,
    profitOverride,
    profit: null,
    cashBuyerName: slugPart(raw.cashBuyerName),
    closingDate: slugPart(raw.closingDate),
    emdDeposit: normalizeMoney(raw.emdDeposit),
    ghlContactId: slugPart(raw.ghlContactId) || null,
    ghlOpportunityId: slugPart(raw.ghlOpportunityId) || null,
    ghlPipelineId: slugPart(raw.ghlPipelineId) || null,
    ghlStageName: slugPart(raw.ghlStageName),
    ghlStageId: slugPart(raw.ghlStageId) || null,
    source: ['vault', 'ghl', 'manual'].includes(slugPart(raw.source)) ? slugPart(raw.source) : 'manual',
    notes: slugPart(raw.notes),
    ownerName: slugPart(raw.ownerName),
    createdAt: slugPart(raw.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  deal.profit = computeDealProfit(deal);
  return deal;
}

function indexEntryFromDeal(deal) {
  return {
    dealId: deal.dealId,
    leadId: deal.leadId,
    address: deal.address,
    city: deal.city,
    state: deal.state,
    zip: deal.zip,
    stage: deal.stage,
    purchasePrice: deal.purchasePrice,
    assignmentFee: deal.assignmentFee,
    profit: deal.profit,
    cashBuyerName: deal.cashBuyerName,
    closingDate: deal.closingDate,
    ghlOpportunityId: deal.ghlOpportunityId,
    ghlContactId: deal.ghlContactId,
    source: deal.source,
    updatedAt: deal.updatedAt,
    createdAt: deal.createdAt
  };
}

function readContractsIndex() {
  const parsed = readJson(contractsIndexPath(), { deals: [], updatedAt: null });
  return Array.isArray(parsed.deals) ? parsed.deals : [];
}

function writeContractsIndex(deals) {
  writeJsonAtomic(contractsIndexPath(), {
    deals,
    updatedAt: new Date().toISOString()
  });
}

function getDeal(dealId) {
  return readJson(dealPath(dealId), null);
}

function listDeals() {
  const index = readContractsIndex();
  return index
    .map((e) => getDeal(e.dealId) || e)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function upsertDeal(raw) {
  const existing = raw.dealId ? getDeal(raw.dealId) : null;
  const merged = normalizeDeal({
    ...(existing || {}),
    ...raw,
    createdAt: existing?.createdAt || raw.createdAt
  });
  writeJsonAtomic(dealPath(merged.dealId), merged);

  const index = readContractsIndex().filter((e) => e.dealId !== merged.dealId);
  index.push(indexEntryFromDeal(merged));
  index.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  writeContractsIndex(index);
  return merged;
}

function findDealByGhlOpportunityId(opportunityId) {
  if (!opportunityId) return null;
  const id = String(opportunityId);
  const entry = readContractsIndex().find((d) => d.ghlOpportunityId === id);
  if (entry) return getDeal(entry.dealId);
  // Fallback scan (index may lag)
  for (const d of listDeals()) {
    if (d.ghlOpportunityId === id) return d;
  }
  return null;
}

function findDealByLeadId(leadId) {
  if (!leadId) return null;
  const id = String(leadId);
  const entry = readContractsIndex().find((d) => d.leadId === id);
  return entry ? getDeal(entry.dealId) : null;
}

function proofTotals(deals = listDeals()) {
  const list = Array.isArray(deals) ? deals : [];
  const byStage = {
    under_contract: 0,
    buyer_found: 0,
    closing: 0,
    funded: 0
  };
  let totalAssignmentFees = 0;
  let totalProfit = 0;
  let totalPurchasePrice = 0;
  for (const d of list) {
    if (byStage[d.stage] != null) byStage[d.stage] += 1;
    if (d.assignmentFee != null) totalAssignmentFees += Number(d.assignmentFee) || 0;
    if (d.profit != null) totalProfit += Number(d.profit) || 0;
    if (d.purchasePrice != null) totalPurchasePrice += Number(d.purchasePrice) || 0;
  }
  return {
    dealCount: list.length,
    byStage,
    underContract: byStage.under_contract,
    buyerFound: byStage.buyer_found,
    closing: byStage.closing,
    funded: byStage.funded,
    totalAssignmentFees,
    totalProfit,
    totalPurchasePrice
  };
}

function applyCatalogStatusForDeal(deal) {
  if (!deal?.leadId) return null;
  const status = catalogStatusForDealStage(deal.stage);
  return setLeadCatalogStatus(deal.leadId, status);
}

function createDealFromVaultLead(leadId, extras = {}) {
  const lead = getLead(leadId);
  if (!lead) {
    const err = new Error('Lead not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const existing = findDealByLeadId(leadId);
  const deal = upsertDeal({
    ...(existing || {}),
    dealId: existing?.dealId || buildDealId({ leadId }),
    leadId: lead.leadId,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    zip: lead.zip,
    ownerName: lead.ownerName,
    stage: extras.stage || existing?.stage || 'under_contract',
    purchasePrice: extras.purchasePrice != null ? extras.purchasePrice : existing?.purchasePrice,
    assignmentFee: extras.assignmentFee != null ? extras.assignmentFee : existing?.assignmentFee,
    profitOverride: extras.profitOverride != null ? extras.profitOverride : existing?.profitOverride,
    cashBuyerName: extras.cashBuyerName != null ? extras.cashBuyerName : existing?.cashBuyerName,
    closingDate: extras.closingDate != null ? extras.closingDate : existing?.closingDate,
    notes: extras.notes != null ? extras.notes : existing?.notes,
    source: existing?.source === 'ghl' ? 'ghl' : 'vault'
  });
  applyCatalogStatusForDeal(deal);
  return deal;
}

function patchDeal(dealId, patch = {}) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const allowed = [
    'stage', 'purchasePrice', 'assignmentFee', 'profitOverride',
    'cashBuyerName', 'closingDate', 'notes', 'emdDeposit',
    'ghlContactId', 'ghlOpportunityId', 'ghlPipelineId', 'ghlStageName', 'ghlStageId',
    'leadId', 'address', 'city', 'state', 'zip', 'ownerName', 'source'
  ];
  const next = { ...existing };
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
  }
  const saved = upsertDeal(next);
  applyCatalogStatusForDeal(saved);
  return saved;
}

function releaseDeal(dealId) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.leadId) {
    setLeadCatalogStatus(existing.leadId, 'active');
  }
  // Soft-delete: remove deal file + index entry
  const file = dealPath(dealId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  writeContractsIndex(readContractsIndex().filter((e) => e.dealId !== dealId));
  return { released: true, leadId: existing.leadId || null, dealId };
}

function resolveLeadIdFromAddress({ address, city, state }) {
  const leadId = buildLeadId({ address, city, state });
  const lead = getLead(leadId);
  return lead ? lead.leadId : null;
}

module.exports = {
  buildDealId,
  normalizeDeal,
  normalizeMoney,
  getDeal,
  listDeals,
  upsertDeal,
  findDealByGhlOpportunityId,
  findDealByLeadId,
  proofTotals,
  createDealFromVaultLead,
  patchDeal,
  releaseDeal,
  applyCatalogStatusForDeal,
  resolveLeadIdFromAddress,
  readContractsIndex
};
