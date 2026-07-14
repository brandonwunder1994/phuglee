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
const { computeDealPayouts, readPayoutSettings } = require('./payout-settings');

const DOC_KINDS = new Set(['purchase_contract', 'addendum', 'amendment', 'jv', 'aoc', 'other']);
const MAX_DOC_BYTES = 18 * 1024 * 1024;

/** Hardwired JV signers — always Brandon + Brad. */
const JV_DEFAULT_PARTIES = {
  sales: {
    name: 'Brandon Wunder',
    company: 'Wunderhaus Group LLC',
    email: 'brandon@wunderhausgroup.com'
  },
  dispos: {
    name: 'Brad Lewis',
    company: 'Green Oasis Solutions',
    email: 'buyhomes995@gmail.com'
  }
};

function slugPart(value) {
  return String(value || '').trim();
}

function contractsRoot() {
  return path.join(catalogRoot(), 'contracts');
}

function contractsIndexPath() {
  return path.join(contractsRoot(), 'index.json');
}

function dealFilesRoot(dealId) {
  const safe = String(dealId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return path.join(contractsRoot(), 'files', safe);
}

function classifyDocKind(name, fallback = 'other') {
  try {
    const { classifyDocumentKind } = require('./ghl-client');
    return classifyDocumentKind(name, fallback);
  } catch (_) {
    const n = String(name || '').toLowerCase();
    if (/\baoc\b|assignment\s+of\s+contract|assignment\s+of\s+purchase/.test(n)) return 'aoc';
    if (/\bjv\b|joint\s*venture/.test(n)) return 'jv';
    if (/amend/.test(n)) return 'amendment';
    if (/addend/.test(n)) return 'addendum';
    if (/purchase|psa|agreement/.test(n)) return 'purchase_contract';
    return fallback;
  }
}

function normalizeSignNowPending(list) {
  if (!Array.isArray(list)) return [];
  return list.map((raw) => ({
    documentId: slugPart(raw.documentId || raw.signNowDocumentId),
    documentName: slugPart(raw.documentName || raw.name),
    templateKey: slugPart(raw.templateKey || raw.kind),
    kind: slugPart(raw.kind),
    status: slugPart(raw.status) || 'sent',
    sentAt: slugPart(raw.sentAt) || null,
    lastCheckedAt: slugPart(raw.lastCheckedAt) || null,
    lastError: slugPart(raw.lastError) || null
  })).filter((x) => x.documentId);
}

function normalizeDocument(raw = {}) {
  const kind = DOC_KINDS.has(slugPart(raw.kind))
    ? slugPart(raw.kind)
    : classifyDocKind(raw.name || raw.label, 'other');
  const id = slugPart(raw.id) || `doc_${crypto.randomBytes(6).toString('hex')}`;
  const sourceRaw = slugPart(raw.source);
  const source = ['ghl', 'local', 'url', 'signnow'].includes(sourceRaw) ? sourceRaw : 'url';
  return {
    id,
    kind,
    name: slugPart(raw.name) || 'Document',
    label: slugPart(raw.label),
    mimeType: slugPart(raw.mimeType) || 'application/pdf',
    size: raw.size != null && Number.isFinite(Number(raw.size)) ? Number(raw.size) : null,
    source,
    ghlFieldId: slugPart(raw.ghlFieldId) || null,
    ghlDocumentId: slugPart(raw.ghlDocumentId) || null,
    ghlUuid: slugPart(raw.ghlUuid) || null,
    signNowDocumentId: slugPart(raw.signNowDocumentId) || null,
    url: slugPart(raw.url) || null,
    originalUrl: slugPart(raw.originalUrl) || null,
    localFile: slugPart(raw.localFile) || null,
    uploadedAt: slugPart(raw.uploadedAt) || new Date().toISOString()
  };
}

function mergeDocuments(existing = [], incoming = []) {
  const byKey = new Map();
  const keyFor = (d) => {
    if (d.signNowDocumentId) return `sn:${d.signNowDocumentId}`;
    if (d.ghlDocumentId) return `ghl:${d.ghlDocumentId}`;
    if (d.ghlUuid) return `uuid:${d.ghlUuid}`;
    if (d.localFile) return `local:${d.localFile}`;
    if (d.url || d.originalUrl) return `url:${d.url || d.originalUrl}`;
    return `id:${d.id}`;
  };
  for (const raw of [...(existing || []), ...(incoming || [])]) {
    const d = normalizeDocument(raw);
    const key = keyFor(d);
    const prev = byKey.get(key);
    byKey.set(key, prev ? { ...prev, ...d, id: prev.id || d.id } : d);
  }
  return [...byKey.values()].sort((a, b) => {
    const order = { purchase_contract: 0, addendum: 1, jv: 2, other: 3 };
    return (order[a.kind] ?? 9) - (order[b.kind] ?? 9)
      || String(a.name).localeCompare(String(b.name));
  });
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
    closingDate: normalizeClosingDate(raw.closingDate),
    emdDeposit: normalizeMoney(raw.emdDeposit),
    ghlContactId: slugPart(raw.ghlContactId) || null,
    ghlOpportunityId: slugPart(raw.ghlOpportunityId) || null,
    ghlPipelineId: slugPart(raw.ghlPipelineId) || null,
    ghlStageName: slugPart(raw.ghlStageName),
    ghlStageId: slugPart(raw.ghlStageId) || null,
    source: ['vault', 'ghl', 'manual'].includes(slugPart(raw.source)) ? slugPart(raw.source) : 'manual',
    notes: slugPart(raw.notes),
    ownerName: slugPart(raw.ownerName),
    phone: slugPart(raw.phone),
    email: slugPart(raw.email),
    streetViewUrl: slugPart(raw.streetViewUrl),
    satelliteUrl: slugPart(raw.satelliteUrl),
    lastFromNumber: slugPart(raw.lastFromNumber) || null,
    conversationId: slugPart(raw.conversationId) || null,
    documents: mergeDocuments([], Array.isArray(raw.documents) ? raw.documents : []),
    signNowPending: normalizeSignNowPending(raw.signNowPending),
    ownerEmail: slugPart(raw.ownerEmail || raw.sellerEmail),
    sellerNames: slugPart(raw.sellerNames),
    originalAgreementDate: slugPart(raw.originalAgreementDate || raw.agreementDate),
    buyerAssignment: normalizeBuyerAssignment(raw.buyerAssignment),
    jvAgreement: normalizeJvAgreement(raw.jvAgreement),
    aocSend: normalizeSendState(raw.aocSend),
    amendmentSend: normalizeSendState(raw.amendmentSend),
    accessType: normalizeAccessType(raw.accessType),
    accessDetail: slugPart(raw.accessDetail || raw.accessNotes || raw.doorCode),
    vacancy: normalizeVacancy(raw.vacancy),
    sellerEmdSubmitted: normalizeYesNo(raw.sellerEmdSubmitted),
    buyerEmdSubmitted: normalizeYesNo(raw.buyerEmdSubmitted),
    titleOpened: normalizeYesNo(raw.titleOpened),
    photosAvailable: normalizeYesNo(raw.photosAvailable),
    rehabInfo: normalizeRehabInfo(raw.rehabInfo),
    createdAt: slugPart(raw.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  deal.profit = computeDealProfit(deal);
  return deal;
}

const ACCESS_TYPES = new Set(['key', 'lockbox', 'door_code', 'open']);
const VACANCY_TYPES = new Set(['vacant', 'occupied', 'unknown']);

function normalizeYesNo(value) {
  if (value === true || value === 1) return 'yes';
  if (value === false || value === 0) return 'no';
  const v = slugPart(value).toLowerCase();
  if (v === 'yes' || v === 'y' || v === 'true' || v === '1' || v === 'submitted') return 'yes';
  if (v === 'no' || v === 'n' || v === 'false' || v === '0' || v === 'pending') return 'no';
  return '';
}

function yesNoLabel(value) {
  const v = normalizeYesNo(value);
  if (v === 'yes') return 'Yes';
  if (v === 'no') return 'No';
  return '—';
}

function normalizeRehabInfo(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      roof: '',
      ac: '',
      foundation: '',
      electrical: '',
      plumbing: '',
      other: ''
    };
  }
  return {
    roof: slugPart(raw.roof),
    ac: slugPart(raw.ac),
    foundation: slugPart(raw.foundation),
    electrical: slugPart(raw.electrical),
    plumbing: slugPart(raw.plumbing),
    other: slugPart(raw.other || raw.notes || raw.custom)
  };
}

function rehabInfoFilled(rehab) {
  const r = normalizeRehabInfo(rehab);
  return Boolean(r.roof || r.ac || r.foundation || r.electrical || r.plumbing || r.other);
}

/** Display closing as M/D/YY. */
function formatClosingSlash(value) {
  const raw = slugPart(value);
  if (!raw) return '';
  let y;
  let m;
  let d;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const slash = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (!slash) return raw;
    m = Number(slash[1]);
    d = Number(slash[2]);
    y = Number(slash[3]);
    if (y < 100) y += 2000;
  }
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return raw;
  return `${m}/${d}/${String(y % 100).padStart(2, '0')}`;
}

function normalizeClosingDate(value) {
  return formatClosingSlash(value) || slugPart(value);
}

function normalizeAccessType(value) {
  const v = slugPart(value).toLowerCase().replace(/\s+/g, '_');
  if (ACCESS_TYPES.has(v)) return v;
  if (/^just_?open$|^unlocked$|^open$/.test(v)) return 'open';
  if (/lock\s*box|lockbox/.test(v)) return 'lockbox';
  if (/door|code|keypad/.test(v)) return 'door_code';
  if (/^key$|keys?/.test(v)) return 'key';
  return '';
}

function normalizeVacancy(value) {
  const v = slugPart(value).toLowerCase();
  if (VACANCY_TYPES.has(v)) return v;
  if (/vacant|empty|unoccupied/.test(v)) return 'vacant';
  if (/occup|tenant|rented|lived/.test(v)) return 'occupied';
  return '';
}

function accessLabel(type) {
  return ({
    key: 'Key',
    lockbox: 'Lockbox',
    door_code: 'Door code',
    open: 'Open'
  })[type] || '';
}

function formatAccessDisplay(type, detail) {
  const label = accessLabel(type);
  if (!label) return '';
  const d = slugPart(detail);
  if (d && (type === 'door_code' || type === 'lockbox')) return `${label} · ${d}`;
  return label;
}

function vacancyFromLead(lead) {
  if (!lead) return '';
  const occ = slugPart(lead.occupancy).toLowerCase();
  if (occ === 'vacant') return 'vacant';
  if (occ === 'occupied' || occ === 'owner_occupied' || occ === 'tenant') return 'occupied';
  if (occ === 'unknown') return 'unknown';
  return '';
}

function accessFromLead(lead) {
  if (!lead) return { type: '', detail: '' };
  const pd = lead.propertyDetails && typeof lead.propertyDetails === 'object'
    ? lead.propertyDetails
    : {};
  return {
    type: normalizeAccessType(pd.accessType || pd.access || lead.accessType),
    detail: slugPart(pd.accessDetail || pd.doorCode || pd.lockboxCode || lead.accessDetail)
  };
}

function vacancyLabel(value) {
  return ({
    vacant: 'Vacant',
    occupied: 'Occupied',
    unknown: 'Unknown'
  })[value] || '';
}

function normalizeBuyerAssignment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    buyerEntity: slugPart(raw.buyerEntity),
    buyerContactName: slugPart(raw.buyerContactName),
    buyerEmail: slugPart(raw.buyerEmail).toLowerCase(),
    buyerPhone: slugPart(raw.buyerPhone),
    assignmentFee: normalizeMoney(raw.assignmentFee),
    closingDate: slugPart(raw.closingDate),
    buyerEmd: normalizeMoney(raw.buyerEmd),
    notes: slugPart(raw.notes),
    capturedAt: slugPart(raw.capturedAt) || null,
    capturedBy: slugPart(raw.capturedBy) || null
  };
}

function normalizeJvAgreement(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    status: slugPart(raw.status) || 'template_pending',
    notes: slugPart(raw.notes),
    salesPartner: slugPart(raw.salesPartner) || 'brandon',
    disposPartner: slugPart(raw.disposPartner) || 'brad',
    salesName: slugPart(raw.salesName) || JV_DEFAULT_PARTIES.sales.name,
    salesCompany: slugPart(raw.salesCompany) || JV_DEFAULT_PARTIES.sales.company,
    salesEmail: slugPart(raw.salesEmail) || JV_DEFAULT_PARTIES.sales.email,
    disposName: slugPart(raw.disposName) || JV_DEFAULT_PARTIES.dispos.name,
    disposCompany: slugPart(raw.disposCompany) || JV_DEFAULT_PARTIES.dispos.company,
    disposEmail: slugPart(raw.disposEmail) || JV_DEFAULT_PARTIES.dispos.email,
    requestedAt: slugPart(raw.requestedAt) || null,
    requestedBy: slugPart(raw.requestedBy) || null,
    signNowDocumentId: slugPart(raw.signNowDocumentId) || null,
    lastError: slugPart(raw.lastError) || null
  };
}

function normalizeSendState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    status: slugPart(raw.status) || 'template_pending',
    requestedAt: slugPart(raw.requestedAt) || null,
    requestedBy: slugPart(raw.requestedBy) || null,
    signNowDocumentId: slugPart(raw.signNowDocumentId) || null,
    lastError: slugPart(raw.lastError) || null
  };
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
    phone: deal.phone || '',
    streetViewUrl: deal.streetViewUrl || '',
    accessType: deal.accessType || '',
    vacancy: deal.vacancy || '',
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

function enrichDealForDisplay(deal) {
  if (!deal) return null;
  const lead = deal.leadId ? getLead(deal.leadId) : null;
  let streetViewUrl = deal.streetViewUrl || lead?.streetViewUrl || '';
  let satelliteUrl = deal.satelliteUrl || lead?.satelliteUrl || '';
  try {
    const { resolveImageryForAnalyzerResult } = require('./imagery-resolve');
    const imagery = resolveImageryForAnalyzerResult({
      street: deal.address,
      address: deal.address,
      city: deal.city,
      state: deal.state,
      streetViewUrl,
      satelliteUrl,
      viewMeta: lead?.viewMeta || null
    });
    streetViewUrl = imagery.streetViewUrl || streetViewUrl;
    satelliteUrl = imagery.satelliteUrl || satelliteUrl;
  } catch (_) { /* imagery optional */ }

  const documents = (Array.isArray(deal.documents) ? deal.documents : []).map((d) => ({
    ...d,
    viewUrl: `/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/documents/${encodeURIComponent(d.id)}`
  }));

  const leadAccess = accessFromLead(lead);
  const accessType = normalizeAccessType(deal.accessType) || leadAccess.type;
  const accessDetail = slugPart(deal.accessDetail) || leadAccess.detail;
  const vacancy = normalizeVacancy(deal.vacancy) || vacancyFromLead(lead) || '';
  const payouts = computeDealPayouts(deal.assignmentFee);

  return {
    ...deal,
    streetViewUrl,
    satelliteUrl,
    phone: deal.phone || (lead?.phones && lead.phones[0]) || lead?.phone || '',
    email: deal.email || lead?.email || '',
    ownerName: deal.ownerName || lead?.ownerName || '',
    thumbUrl: streetViewUrl || satelliteUrl || '',
    accessType,
    accessDetail,
    accessLabel: accessLabel(accessType),
    accessDisplay: formatAccessDisplay(accessType, accessDetail) || '—',
    vacancy,
    vacancyLabel: vacancyLabel(vacancy) || '—',
    sellerEmdSubmitted: normalizeYesNo(deal.sellerEmdSubmitted),
    buyerEmdSubmitted: normalizeYesNo(deal.buyerEmdSubmitted),
    sellerEmdLabel: yesNoLabel(deal.sellerEmdSubmitted),
    buyerEmdLabel: yesNoLabel(deal.buyerEmdSubmitted),
    titleOpened: normalizeYesNo(deal.titleOpened),
    titleOpenedLabel: yesNoLabel(deal.titleOpened),
    photosAvailable: normalizeYesNo(deal.photosAvailable),
    photosLabel: yesNoLabel(deal.photosAvailable),
    rehabInfo: normalizeRehabInfo(deal.rehabInfo),
    rehabInfoReady: rehabInfoFilled(deal.rehabInfo) ? 'yes' : 'no',
    rehabInfoLabel: rehabInfoFilled(deal.rehabInfo) ? 'Yes' : 'No',
    closingDisplay: formatClosingSlash(deal.closingDate),
    tcPay: payouts.tcPay,
    acqPay: payouts.acqPay,
    dispoPay: payouts.dispoPay,
    netAfterTc: payouts.netAfterTc,
    documents,
    lead: lead || null
  };
}

function listDealsEnriched() {
  return listDeals().map(enrichDealForDisplay);
}

function getDealProfile(dealId) {
  const deal = getDeal(dealId);
  if (!deal) return null;
  return enrichDealForDisplay(deal);
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
  const settings = readPayoutSettings();
  const byStage = {
    under_contract: 0,
    buyer_found: 0,
    closing: 0,
    funded: 0
  };

  let openAssignmentFees = 0;
  let openPurchasePrice = 0;
  let openTcPay = 0;
  let openAcqPay = 0;
  let openDispoPay = 0;

  let closedAssignmentFees = 0;
  let closedPurchasePrice = 0;
  let closedTcPay = 0;
  let closedAcqPay = 0;
  let closedDispoPay = 0;

  for (const d of list) {
    if (byStage[d.stage] != null) byStage[d.stage] += 1;
    const fee = d.assignmentFee == null ? null : Number(d.assignmentFee);
    const purchase = d.purchasePrice == null ? null : Number(d.purchasePrice);
    const p = computeDealPayouts(fee, settings);
    const isClosed = d.stage === 'funded';

    if (isClosed) {
      if (fee != null && Number.isFinite(fee)) closedAssignmentFees += fee;
      if (purchase != null && Number.isFinite(purchase)) closedPurchasePrice += purchase;
      if (p.tcPay != null) closedTcPay += p.tcPay;
      if (p.acqPay != null) closedAcqPay += p.acqPay;
      if (p.dispoPay != null) closedDispoPay += p.dispoPay;
    } else {
      if (fee != null && Number.isFinite(fee)) openAssignmentFees += fee;
      if (purchase != null && Number.isFinite(purchase)) openPurchasePrice += purchase;
      if (p.tcPay != null) openTcPay += p.tcPay;
      if (p.acqPay != null) openAcqPay += p.acqPay;
      if (p.dispoPay != null) openDispoPay += p.dispoPay;
    }
  }

  const openCount = byStage.under_contract + byStage.buyer_found + byStage.closing;
  return {
    dealCount: list.length,
    byStage,
    underContract: byStage.under_contract,
    buyerFound: byStage.buyer_found,
    closing: byStage.closing,
    funded: byStage.funded,
    openCount,
    // Current pipeline (not yet funded)
    openAssignmentFees,
    openPurchasePrice,
    openTcPay,
    openAcqPay,
    openDispoPay,
    // Overall closings (funded)
    closedCount: byStage.funded,
    closedAssignmentFees,
    closedPurchasePrice,
    closedTcPay,
    closedAcqPay,
    closedDispoPay,
    // Back-compat aliases → closings overall
    totalAssignmentFees: closedAssignmentFees,
    totalTcPay: closedTcPay,
    totalAcqPay: closedAcqPay,
    totalDispoPay: closedDispoPay,
    totalProfit: closedAcqPay + closedDispoPay,
    totalPurchasePrice: closedPurchasePrice,
    payoutSettings: settings
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
    phone: (lead.phones && lead.phones[0]) || '',
    email: lead.email || '',
    streetViewUrl: lead.streetViewUrl || '',
    satelliteUrl: lead.satelliteUrl || '',
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
    'leadId', 'address', 'city', 'state', 'zip', 'ownerName', 'source',
    'phone', 'email', 'streetViewUrl', 'satelliteUrl', 'lastFromNumber', 'conversationId',
    'documents', 'signNowPending', 'buyerAssignment', 'jvAgreement', 'aocSend', 'amendmentSend',
    'ownerEmail', 'sellerNames', 'originalAgreementDate',
    'accessType', 'accessDetail', 'vacancy',
    'sellerEmdSubmitted', 'buyerEmdSubmitted', 'titleOpened',
    'photosAvailable', 'rehabInfo'
  ];
  const next = { ...existing };
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rehabInfo')) {
    next.rehabInfo = normalizeRehabInfo(patch.rehabInfo);
  }
  if (Array.isArray(patch.documents)) {
    next.documents = mergeDocuments([], patch.documents);
  }
  if (Array.isArray(patch.signNowPending)) {
    next.signNowPending = normalizeSignNowPending(patch.signNowPending);
  }
  const saved = upsertDeal(next);
  applyCatalogStatusForDeal(saved);
  return saved;
}

function pushSignNowPending(dealId, entry) {
  const existing = getDeal(dealId);
  if (!existing) return null;
  const pending = normalizeSignNowPending([
    ...(existing.signNowPending || []),
    {
      ...entry,
      sentAt: entry.sentAt || new Date().toISOString(),
      status: entry.status || 'sent'
    }
  ]);
  // de-dupe by documentId
  const byId = new Map();
  for (const p of pending) byId.set(p.documentId, p);
  return upsertDeal({ ...existing, signNowPending: [...byId.values()] });
}

function setSignNowPending(dealId, pending) {
  const existing = getDeal(dealId);
  if (!existing) return null;
  return upsertDeal({ ...existing, signNowPending: normalizeSignNowPending(pending) });
}

/**
 * Capture end-buyer info and send AOC via SignNow.
 */
async function markBuyerFound(dealId, input = {}, actor = '') {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const buyerEntity = slugPart(input.buyerEntity || input.cashBuyerName || input.buyerName);
  const buyerContactName = slugPart(input.buyerContactName || input.contactName);
  const buyerEmail = slugPart(input.buyerEmail || input.email).toLowerCase();
  const buyerPhone = slugPart(input.buyerPhone || input.phone);
  if (!buyerEntity && !buyerContactName) {
    const err = new Error('Buyer name or entity is required');
    err.code = 'MISSING_BUYER';
    throw err;
  }
  if (!buyerEmail && !buyerPhone) {
    const err = new Error('Buyer email or phone is required');
    err.code = 'MISSING_BUYER_CONTACT';
    throw err;
  }

  const assignmentFee = input.assignmentFee != null && input.assignmentFee !== ''
    ? normalizeMoney(input.assignmentFee)
    : existing.assignmentFee;
  const closingDate = slugPart(input.closingDate) || existing.closingDate || '';
  const buyerAssignment = normalizeBuyerAssignment({
    buyerEntity,
    buyerContactName,
    buyerEmail,
    buyerPhone,
    assignmentFee,
    closingDate,
    buyerEmd: input.buyerEmd,
    notes: input.notes,
    capturedAt: new Date().toISOString(),
    capturedBy: slugPart(actor) || null
  });

  let aocSend = normalizeSendState({
    ...(existing.aocSend || {}),
    status: 'sending',
    requestedAt: new Date().toISOString(),
    requestedBy: slugPart(actor) || null
  });

  let saved = upsertDeal({
    ...existing,
    stage: 'buyer_found',
    cashBuyerName: buyerEntity || buyerContactName,
    assignmentFee: assignmentFee ?? existing.assignmentFee,
    closingDate,
    buyerAssignment,
    aocSend,
    notes: input.appendNotes
      ? [existing.notes, slugPart(input.notes)].filter(Boolean).join('\n')
      : (slugPart(input.dealNotes) || existing.notes)
  });
  applyCatalogStatusForDeal(saved);

  const skipSignNow = input.skipSignNow === true;
  if (skipSignNow) {
    aocSend = normalizeSendState({ ...aocSend, status: 'saved_only' });
    saved = upsertDeal({ ...saved, aocSend });
    return {
      deal: saved,
      aoc: { status: 'saved_only', message: 'Buyer saved. AOC send skipped.' }
    };
  }

  try {
    const { sendAocForDeal } = require('./signnow-send');
    const aoc = await sendAocForDeal(saved, {
      buyerEntity,
      buyerContactName,
      buyerEmail,
      buyerPhone,
      buyerEmd: input.buyerEmd,
      closingDate,
      notes: input.notes,
      assignmentPurchasePrice: input.assignmentPurchasePrice
    });
    aocSend = normalizeSendState({
      ...aocSend,
      status: 'sent',
      signNowDocumentId: aoc.documentId,
      lastError: null
    });
    saved = upsertDeal({ ...saved, aocSend });
    pushSignNowPending(saved.dealId, {
      documentId: aoc.documentId,
      documentName: aoc.documentName,
      templateKey: 'aoc',
      kind: 'aoc',
      status: 'sent'
    });
    saved = getDeal(saved.dealId);
    return {
      deal: saved,
      aoc: {
        status: 'sent',
        documentId: aoc.documentId,
        message: aoc.message
      }
    };
  } catch (err) {
    aocSend = normalizeSendState({
      ...aocSend,
      status: 'error',
      lastError: err.message
    });
    saved = upsertDeal({ ...saved, aocSend });
    const wrapped = new Error(err.message || 'AOC SignNow send failed');
    wrapped.code = err.code || 'SIGNNOW_SEND_FAILED';
    wrapped.deal = saved;
    throw wrapped;
  }
}

/**
 * Confirm + send JV between hardwired Brandon + Brad via SignNow.
 */
async function requestJvSend(dealId, input = {}, actor = '') {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const sales = JV_DEFAULT_PARTIES.sales;
  const dispos = JV_DEFAULT_PARTIES.dispos;
  let jvAgreement = normalizeJvAgreement({
    ...(existing.jvAgreement || {}),
    status: 'sending',
    notes: input.notes,
    salesPartner: 'brandon',
    disposPartner: 'brad',
    salesName: sales.name,
    salesCompany: sales.company,
    salesEmail: sales.email,
    disposName: dispos.name,
    disposCompany: dispos.company,
    disposEmail: dispos.email,
    requestedAt: new Date().toISOString(),
    requestedBy: slugPart(actor) || null,
    signNowDocumentId: existing.jvAgreement?.signNowDocumentId || null,
    lastError: null
  });
  let saved = upsertDeal({ ...existing, jvAgreement });

  try {
    const { sendJvForDeal } = require('./signnow-send');
    const jv = await sendJvForDeal(saved);
    jvAgreement = normalizeJvAgreement({
      ...jvAgreement,
      status: 'sent',
      signNowDocumentId: jv.documentId,
      lastError: null
    });
    saved = upsertDeal({ ...saved, jvAgreement });
    pushSignNowPending(saved.dealId, {
      documentId: jv.documentId,
      documentName: jv.documentName,
      templateKey: 'jv',
      kind: 'jv',
      status: 'sent'
    });
    saved = getDeal(saved.dealId);
    return {
      deal: saved,
      jv: {
        status: 'sent',
        documentId: jv.documentId,
        parties: { sales, dispos },
        message: jv.message
      }
    };
  } catch (err) {
    jvAgreement = normalizeJvAgreement({
      ...jvAgreement,
      status: 'error',
      lastError: err.message
    });
    saved = upsertDeal({ ...saved, jvAgreement });
    const wrapped = new Error(err.message || 'JV SignNow send failed');
    wrapped.code = err.code || 'SIGNNOW_SEND_FAILED';
    wrapped.deal = saved;
    throw wrapped;
  }
}

/**
 * Send Amendment via SignNow (quick button or Documents).
 */
async function requestAmendmentSend(dealId, input = {}, actor = '') {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  let amendmentSend = normalizeSendState({
    ...(existing.amendmentSend || {}),
    status: 'sending',
    requestedAt: new Date().toISOString(),
    requestedBy: slugPart(actor) || null
  });

  const patchFields = {};
  if (slugPart(input.originalAgreementDate)) {
    patchFields.originalAgreementDate = slugPart(input.originalAgreementDate);
  }
  if (slugPart(input.sellerName) && !existing.ownerName) {
    patchFields.ownerName = slugPart(input.sellerName);
  }
  if (slugPart(input.sellerEmail) && !existing.ownerEmail && !existing.email) {
    patchFields.ownerEmail = slugPart(input.sellerEmail).toLowerCase();
  }

  let saved = upsertDeal({
    ...existing,
    ...patchFields,
    amendmentSend
  });

  try {
    const { sendAmendmentForDeal } = require('./signnow-send');
    const amd = await sendAmendmentForDeal(saved, input);
    amendmentSend = normalizeSendState({
      ...amendmentSend,
      status: 'sent',
      signNowDocumentId: amd.documentId,
      lastError: null
    });
    saved = upsertDeal({ ...saved, amendmentSend });
    pushSignNowPending(saved.dealId, {
      documentId: amd.documentId,
      documentName: amd.documentName,
      templateKey: 'amendment',
      kind: 'amendment',
      status: 'sent'
    });
    saved = getDeal(saved.dealId);
    return {
      deal: saved,
      amendment: {
        status: 'sent',
        documentId: amd.documentId,
        message: amd.message
      }
    };
  } catch (err) {
    amendmentSend = normalizeSendState({
      ...amendmentSend,
      status: 'error',
      lastError: err.message
    });
    saved = upsertDeal({ ...saved, amendmentSend });
    const wrapped = new Error(err.message || 'Amendment SignNow send failed');
    wrapped.code = err.code || 'SIGNNOW_SEND_FAILED';
    wrapped.deal = saved;
    throw wrapped;
  }
}

/**
 * Send a document type from the Documents panel via SignNow.
 */
async function requestDocumentSend(dealId, kind, input = {}, actor = '') {
  const k = slugPart(kind).toLowerCase();
  if (k === 'aoc' || k === 'assignment') {
    // Prefer buyerAssignment already on deal; allow overrides from input
    const deal = getDeal(dealId);
    if (!deal) {
      const err = new Error('Deal not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const ba = deal.buyerAssignment || {};
    return markBuyerFound(dealId, {
      buyerEntity: input.buyerEntity || ba.buyerEntity || deal.cashBuyerName,
      buyerContactName: input.buyerContactName || ba.buyerContactName,
      buyerEmail: input.buyerEmail || ba.buyerEmail,
      buyerPhone: input.buyerPhone || ba.buyerPhone,
      assignmentFee: input.assignmentFee != null ? input.assignmentFee : ba.assignmentFee,
      closingDate: input.closingDate || ba.closingDate || deal.closingDate,
      buyerEmd: input.buyerEmd != null ? input.buyerEmd : ba.buyerEmd,
      notes: input.notes || ba.notes,
      skipSignNow: false
    }, actor);
  }
  if (k === 'jv' || k === 'jv_agreement') {
    return requestJvSend(dealId, input, actor);
  }
  if (k === 'amendment' || k === 'addendum') {
    return requestAmendmentSend(dealId, input, actor);
  }
  const err = new Error(`Unsupported SignNow document type: ${kind}`);
  err.code = 'UNSUPPORTED_DOC_KIND';
  throw err;
}

async function syncSignedSignNowDocuments(dealId) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!(existing.signNowPending || []).length) {
    return { deal: existing, ingested: 0, pending: [], added: [] };
  }
  const { ingestSignedSignNowDocuments } = require('./signnow-send');
  return ingestSignedSignNowDocuments(existing, {
    addDealDocument,
    upsertDeal,
    patchPending: setSignNowPending
  });
}

function mergeGhlDocumentsOntoDeal(dealId, ghlDocs = []) {
  const existing = getDeal(dealId);
  if (!existing) return null;
  const documents = mergeDocuments(existing.documents || [], ghlDocs || []);
  return upsertDeal({ ...existing, documents });
}

function addDealDocument(dealId, input = {}) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  let doc = normalizeDocument({
    ...input,
    kind: input.kind || classifyDocKind(input.name),
    source: input.source || (input.contentBase64 || input.buffer ? 'local' : (input.url ? 'url' : 'local'))
  });

  if (input.buffer || input.contentBase64) {
    let buf = input.buffer || null;
    if (!buf && input.contentBase64) {
      const raw = String(input.contentBase64).replace(/^data:[^;]+;base64,/, '');
      buf = Buffer.from(raw, 'base64');
    }
    if (!buf || !buf.length) {
      const err = new Error('Empty document upload');
      err.code = 'EMPTY_DOC';
      throw err;
    }
    if (buf.length > MAX_DOC_BYTES) {
      const err = new Error('Document too large (max 18MB)');
      err.code = 'DOC_TOO_LARGE';
      throw err;
    }
    const ext = (path.extname(doc.name) || '.pdf').slice(0, 8) || '.pdf';
    const fileName = `${doc.id}${ext}`;
    const dir = dealFilesRoot(dealId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), buf);
    doc = {
      ...doc,
      source: doc.source === 'signnow' ? 'signnow' : 'local',
      localFile: fileName,
      size: buf.length,
      mimeType: input.mimeType || doc.mimeType || 'application/pdf',
      signNowDocumentId: slugPart(input.signNowDocumentId) || doc.signNowDocumentId || null,
      url: null,
      originalUrl: null
    };
  } else if (doc.url || doc.originalUrl) {
    doc = { ...doc, source: doc.source === 'ghl' ? 'ghl' : 'url' };
  } else {
    const err = new Error('Provide a file upload or a document URL');
    err.code = 'MISSING_DOC_BODY';
    throw err;
  }

  const documents = mergeDocuments(existing.documents || [], [doc]);
  const saved = upsertDeal({ ...existing, documents });
  return { deal: saved, document: documents.find((d) => d.id === doc.id) || doc };
}

function getDealDocument(dealId, docId) {
  const deal = getDeal(dealId);
  if (!deal) return null;
  const doc = (deal.documents || []).find((d) => d.id === docId);
  if (!doc) return null;
  return { deal, document: doc };
}

function resolveLocalDocumentPath(dealId, doc) {
  if (!doc?.localFile) return null;
  const safe = path.basename(String(doc.localFile));
  const full = path.join(dealFilesRoot(dealId), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

function removeDealDocument(dealId, docId) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const doc = (existing.documents || []).find((d) => d.id === docId);
  if (!doc) {
    const err = new Error('Document not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (doc.localFile) {
    const full = resolveLocalDocumentPath(dealId, doc);
    if (full) {
      try { fs.unlinkSync(full); } catch (_) { /* ignore */ }
    }
  }
  const documents = (existing.documents || []).filter((d) => d.id !== docId);
  const saved = upsertDeal({ ...existing, documents });
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
  DOC_KINDS,
  buildDealId,
  normalizeDeal,
  normalizeMoney,
  normalizeDocument,
  mergeDocuments,
  getDeal,
  listDeals,
  listDealsEnriched,
  enrichDealForDisplay,
  getDealProfile,
  upsertDeal,
  findDealByGhlOpportunityId,
  findDealByLeadId,
  proofTotals,
  createDealFromVaultLead,
  patchDeal,
  releaseDeal,
  applyCatalogStatusForDeal,
  resolveLeadIdFromAddress,
  readContractsIndex,
  mergeGhlDocumentsOntoDeal,
  addDealDocument,
  getDealDocument,
  resolveLocalDocumentPath,
  removeDealDocument,
  markBuyerFound,
  requestJvSend,
  requestAmendmentSend,
  requestDocumentSend,
  syncSignedSignNowDocuments,
  pushSignNowPending,
  setSignNowPending,
  JV_DEFAULT_PARTIES,
  ACCESS_TYPES,
  VACANCY_TYPES,
  normalizeAccessType,
  normalizeVacancy,
  accessLabel,
  vacancyLabel,
  formatAccessDisplay,
  normalizeYesNo,
  yesNoLabel,
  formatClosingSlash,
  normalizeClosingDate,
  normalizeRehabInfo,
  rehabInfoFilled
};
