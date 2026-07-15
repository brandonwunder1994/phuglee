'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { catalogRoot, getLead, setLeadCatalogStatus } = require('./store');
const {
  DEAL_STAGES,
  SALES_STAGES,
  DISPO_STAGES,
  DEAL_STAGE_LABELS,
  isSalesStage,
  isDispoStage,
  canonicalizeDealStage,
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
    name: 'Bradley Lewis',
    company: 'Green Oasis Solutions LLC',
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

function dealMediaRoot(dealId) {
  return path.join(dealFilesRoot(dealId), 'media');
}

const MAX_MEDIA_BYTES = 40 * 1024 * 1024;

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

function mediaKindFromMime(mimeType, name) {
  const m = String(mimeType || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (m.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi)$/i.test(n)) return 'video';
  if (m.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(n)) return 'image';
  return 'other';
}

function guessExtFromMime(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('png')) return '.png';
  if (m.includes('gif')) return '.gif';
  if (m.includes('webp')) return '.webp';
  if (m.includes('mp4')) return '.mp4';
  if (m.includes('quicktime') || m.includes('mov')) return '.mov';
  if (m.includes('webm')) return '.webm';
  return '';
}

function normalizeSellerMediaItem(raw = {}) {
  const name = slugPart(raw.name) || 'attachment';
  const mimeType = slugPart(raw.mimeType) || 'application/octet-stream';
  const kindRaw = slugPart(raw.kind);
  const kind = ['image', 'video', 'other'].includes(kindRaw)
    ? kindRaw
    : mediaKindFromMime(mimeType, name);
  const uploadSource = slugPart(raw.uploadSource || raw.source) || 'seller';
  const item = {
    id: slugPart(raw.id) || `media_${crypto.randomBytes(6).toString('hex')}`,
    name,
    mimeType,
    kind,
    size: raw.size != null && Number.isFinite(Number(raw.size)) ? Number(raw.size) : null,
    sourceUrl: slugPart(raw.sourceUrl) || null,
    localFile: slugPart(raw.localFile) || null,
    messageId: slugPart(raw.messageId) || null,
    uploadSource: ['photographer', 'seller', 'desk'].includes(uploadSource) ? uploadSource : 'seller',
    savedAt: slugPart(raw.savedAt) || new Date().toISOString()
  };
  if (raw.aiLabel && typeof raw.aiLabel === 'object') {
    item.aiLabel = raw.aiLabel;
  }
  return item;
}

function normalizeSellerMediaList(list) {
  const byUrl = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    const item = normalizeSellerMediaItem(raw);
    if (!item.localFile) continue;
    const key = item.sourceUrl || item.id;
    const prev = byUrl.get(key);
    if (!prev || String(item.savedAt) > String(prev.savedAt)) byUrl.set(key, item);
  }
  return [...byUrl.values()].sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

function enrichSellerMediaForDisplay(deal) {
  if (!deal?.dealId) return [];
  return normalizeSellerMediaList(deal.sellerMedia).map((m) => ({
    ...m,
    viewUrl: `/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/media/${encodeURIComponent(m.id)}`,
    downloadUrl: `/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/media/${encodeURIComponent(m.id)}?download=1`
  }));
}

function dealPath(dealId) {
  const safe = String(dealId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return path.join(contractsRoot(), `${safe}.json`);
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Windows cannot rename over an existing file; Linux can.
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      fs.renameSync(tmp, filePath);
    } catch (err2) {
      try { fs.copyFileSync(tmp, filePath); } catch (_) { /* fall through */ }
      try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
      if (!fs.existsSync(filePath)) throw err2 || err;
    }
  }
}

/** Desk fields Brad/admin edit locally — never discard on GHL refresh. */
const DESK_LOCAL_KEYS = [
  'notes',
  'accessType',
  'accessDetail',
  'vacancy',
  'sellerEmdSubmitted',
  'buyerEmdSubmitted',
  'titleOpened',
  'photosAvailable',
  'photoCost',
  'rehabInfo',
  'teamMessages',
  'alertFlags',
  'sellerSms',
  'profitOverride',
  'fundedAt',
  'buyerAssignment',
  'jvAgreement',
  'aocSend',
  'amendmentSend',
  'documents',
  'sellerMedia',
  'signNowPending',
  'lastFromNumber',
  'conversationId',
  'ownerEmail',
  'sellerNames',
  'originalAgreementDate',
  'ghlContactLocked',
  'photographerSchedule',
  'conditionScan'
];

function pickDeskLocalFields(deal) {
  if (!deal || typeof deal !== 'object') return {};
  const out = {};
  for (const key of DESK_LOCAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(deal, key) && deal[key] != null) {
      out[key] = deal[key];
    }
  }
  return out;
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
  const stage = canonicalizeDealStage(raw.stage);
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
    sellerMedia: normalizeSellerMediaList(raw.sellerMedia),
    signNowPending: normalizeSignNowPending(raw.signNowPending),
    ownerEmail: slugPart(raw.ownerEmail || raw.sellerEmail),
    sellerNames: slugPart(raw.sellerNames),
    originalAgreementDate: slugPart(raw.originalAgreementDate || raw.agreementDate),
    buyerAssignment: normalizeBuyerAssignment(raw.buyerAssignment),
    jvAgreement: normalizeJvAgreement(raw.jvAgreement),
    aocSend: normalizeAocSend(raw.aocSend),
    amendmentSend: normalizeSendState(raw.amendmentSend),
    accessType: normalizeAccessType(raw.accessType),
    accessDetail: slugPart(raw.accessDetail || raw.accessNotes || raw.doorCode),
    vacancy: normalizeVacancy(raw.vacancy),
    sellerEmdSubmitted: normalizeYesNo(raw.sellerEmdSubmitted),
    buyerEmdSubmitted: normalizeYesNo(raw.buyerEmdSubmitted),
    titleOpened: normalizeYesNo(raw.titleOpened),
    photosAvailable: normalizeYesNo(raw.photosAvailable),
    photoCost: normalizeMoney(raw.photoCost) ?? 0,
    rehabInfo: normalizeRehabInfo(raw.rehabInfo),
    photographerSchedule: normalizePhotographerScheduleSafe(raw.photographerSchedule),
    conditionScan: normalizeConditionScan(raw.conditionScan),
    teamMessages: normalizeTeamMessages(raw.teamMessages),
    alertFlags: normalizeAlertFlags(raw.alertFlags),
    sellerSms: normalizeSellerSms(raw.sellerSms),
    /** ISO timestamp when stage first became funded (Yes in Funded column). */
    fundedAt: slugPart(raw.fundedAt) || null,
    /**
     * When true, GHL opportunity sync must not overwrite ghlContactId / phone /
     * conversationId — used when SMS POC differs from the opportunity contact
     * (e.g. sister's record vs seller POC).
     */
    ghlContactLocked: Boolean(raw.ghlContactLocked),
    createdAt: slugPart(raw.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  deal.profit = computeDealProfit(deal);
  return deal;
}

function normalizeAlertFlags(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    titleOpened: Boolean(src.titleOpened),
    sellerEmd: Boolean(src.sellerEmd),
    deskReady: Boolean(src.deskReady),
    photos: Boolean(src.photos),
    buyerEmd: Boolean(src.buyerEmd),
    funded: Boolean(src.funded),
    photographerDone: Boolean(src.photographerDone)
  };
}

function normalizePhotographerScheduleSafe(raw) {
  try {
    const { normalizePhotographerSchedule } = require('./photographer');
    return normalizePhotographerSchedule(raw);
  } catch (_) {
    return raw && typeof raw === 'object' ? raw : null;
  }
}

function normalizeConditionScan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    status: slugPart(raw.status) || 'idle',
    costBookVersion: slugPart(raw.costBookVersion) || null,
    finishGrade: ['retail', 'investor'].includes(slugPart(raw.finishGrade)) ? slugPart(raw.finishGrade) : 'investor',
    metroId: slugPart(raw.metroId) || null,
    metroLabel: slugPart(raw.metroLabel) || null,
    metroFactor: raw.metroFactor != null && Number.isFinite(Number(raw.metroFactor)) ? Number(raw.metroFactor) : null,
    livingSqft: raw.livingSqft != null && Number.isFinite(Number(raw.livingSqft)) ? Number(raw.livingSqft) : null,
    sqftSource: slugPart(raw.sqftSource) || null,
    contingencyPct: raw.contingencyPct != null && Number.isFinite(Number(raw.contingencyPct))
      ? Math.min(25, Math.max(0, Number(raw.contingencyPct)))
      : 10,
    coverage: raw.coverage && typeof raw.coverage === 'object' ? raw.coverage : {},
    coverageRatio: raw.coverageRatio != null ? Number(raw.coverageRatio) : null,
    confidence: slugPart(raw.confidence) || null,
    gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
    walkOrder: Array.isArray(raw.walkOrder) ? raw.walkOrder : [],
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    totals: raw.totals && typeof raw.totals === 'object' ? raw.totals : null,
    labeledCount: Number(raw.labeledCount) || 0,
    mediaCount: Number(raw.mediaCount) || 0,
    summary: slugPart(raw.summary),
    overPurchaseWarn: Boolean(raw.overPurchaseWarn),
    scannedAt: slugPart(raw.scannedAt) || null,
    honestyLabel: slugPart(raw.honestyLabel) || null,
    jobError: slugPart(raw.jobError) || null,
    bookedBy: slugPart(raw.bookedBy) || null
  };
}

function normalizeSellerSms(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const seenBy = src.seenBy && typeof src.seenBy === 'object' ? src.seenBy : {};
  return {
    lastInboundId: slugPart(src.lastInboundId) || null,
    lastInboundAt: slugPart(src.lastInboundAt) || null,
    lastInboundPreview: slugPart(src.lastInboundPreview).slice(0, 80),
    lastCheckedAt: slugPart(src.lastCheckedAt) || null,
    seenBy: {
      admin: slugPart(seenBy.admin) || null,
      brad: slugPart(seenBy.brad) || null
    }
  };
}

function teamUserFromUsername(username) {
  return slugPart(username).toLowerCase() === 'brad' ? 'brad' : 'admin';
}

function isSellerSmsUnreadForUser(deal, username) {
  const sms = normalizeSellerSms(deal?.sellerSms);
  if (!sms.lastInboundId || !sms.lastInboundAt) return false;
  const user = teamUserFromUsername(username);
  const seen = sms.seenBy[user];
  if (!seen) return true;
  return String(seen) < String(sms.lastInboundAt);
}

function messageHasAttachmentFlag(m) {
  const a = m?.attachments;
  if (Array.isArray(a) && a.some((x) => String(x || '').trim())) return true;
  if (typeof a === 'string' && a.trim()) return true;
  if (m?.hasAttachments) return true;
  return false;
}

function normalizeInboundPreview(m) {
  const body = slugPart(m?.body || m?.message);
  if (body) return body.slice(0, 80);
  if (messageHasAttachmentFlag(m)) {
    const n = Array.isArray(m.attachments) ? m.attachments.filter((x) => String(x || '').trim()).length : 0;
    return n > 1 ? `📷 ${n} photos` : '📷 Photo';
  }
  return '';
}

function parseMessageInstant(value) {
  try {
    const { parseGhlTimestamp } = require('./ghl-client');
    return parseGhlTimestamp(value);
  } catch (_) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ms = value < 1e12 ? value * 1000 : value;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)) {
      const d = new Date(`${raw}Z`);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
}

function findLatestInboundMessage(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  let best = null;
  let bestMs = -1;
  for (const m of list) {
    if (!m) continue;
    const dir = String(m.direction || '').toLowerCase();
    if (dir !== 'inbound' && dir !== 'in') continue;
    const id = slugPart(m.id);
    const preview = normalizeInboundPreview(m);
    if (!id && !preview) continue;
    const iso = parseMessageInstant(m.dateAdded) || null;
    const ms = iso ? Date.parse(iso) : 0;
    if (ms < bestMs) continue;
    bestMs = ms;
    best = {
      id: id || `inbound_${iso || Date.now()}`,
      body: preview,
      dateAdded: iso || new Date().toISOString(),
      hasAttachments: messageHasAttachmentFlag(m)
    };
  }
  return best;
}

function findLatestOutboundMessage(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  let best = null;
  let bestMs = -1;
  for (const m of list) {
    if (!m) continue;
    const dir = String(m.direction || '').toLowerCase();
    if (dir !== 'outbound' && dir !== 'out') continue;
    const id = slugPart(m.id);
    const body = slugPart(m.body || m.message) || normalizeInboundPreview(m);
    if (!id && !body) continue;
    const iso = parseMessageInstant(m.dateAdded) || null;
    const ms = iso ? Date.parse(iso) : 0;
    if (ms < bestMs) continue;
    bestMs = ms;
    best = {
      id: id || `outbound_${iso || Date.now()}`,
      body,
      dateAdded: iso || new Date().toISOString()
    };
  }
  return best;
}

function applySellerSmsInbound(existingSms, inbound, { checkedAt } = {}) {
  const prev = normalizeSellerSms(existingSms);
  const next = { ...prev };
  if (checkedAt) next.lastCheckedAt = parseMessageInstant(checkedAt) || new Date().toISOString();
  if (inbound && inbound.id) {
    const same = prev.lastInboundId && prev.lastInboundId === inbound.id;
    const inboundAt = parseMessageInstant(inbound.dateAdded) || new Date().toISOString();
    const inboundMs = Date.parse(inboundAt);
    const prevMs = prev.lastInboundAt ? Date.parse(prev.lastInboundAt) : -1;
    if (!same) {
      // Never regress to an older inbound (incomplete GHL peeks can omit newer texts).
      if (prev.lastInboundId && Number.isFinite(prevMs) && Number.isFinite(inboundMs) && inboundMs < prevMs) {
        return normalizeSellerSms(next);
      }
      next.lastInboundId = inbound.id;
      next.lastInboundAt = inboundAt;
      next.lastInboundPreview = String(inbound.body || '').slice(0, 80);
      // New seller text after a prior seen state → clear seen so the alert returns.
      if (!prev.lastInboundId || inboundMs > prevMs) {
        next.seenBy = { admin: null, brad: null };
      }
    } else {
      if (inboundAt && (!prev.lastInboundAt || prev.lastInboundAt !== inboundAt)) {
        next.lastInboundAt = inboundAt;
      }
      if (inbound.body && inbound.body !== prev.lastInboundPreview) {
        next.lastInboundPreview = String(inbound.body).slice(0, 80);
      }
    }
  }
  return normalizeSellerSms(next);
}

/**
 * If desk already replied after the latest seller text (GHL or in-app), clear unread for both.
 */
function clearSellerSmsUnreadIfDeskReplied(dealId, messages) {
  const existing = getDeal(dealId);
  if (!existing) return null;
  const inbound = findLatestInboundMessage(messages);
  const outbound = findLatestOutboundMessage(messages);
  if (!inbound?.dateAdded || !outbound?.dateAdded) return existing;
  const inMs = Date.parse(inbound.dateAdded);
  const outMs = Date.parse(outbound.dateAdded);
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs) || outMs < inMs) return existing;

  const sms = normalizeSellerSms(existing.sellerSms);
  // Prefer stored last inbound (may be newer than incomplete message list).
  const seenAt = sms.lastInboundAt || inbound.dateAdded;
  const seenMs = Date.parse(seenAt);
  // Only clear when the outbound is at/after the stored last seller text.
  if (Number.isFinite(seenMs) && outMs < seenMs) return existing;
  if (sms.seenBy.admin === seenAt && sms.seenBy.brad === seenAt) return existing;
  return upsertDeal({
    ...existing,
    sellerSms: {
      ...sms,
      seenBy: { admin: seenAt, brad: seenAt }
    }
  });
}

function recordSellerSmsFromMessages(dealId, messages) {
  const existing = getDeal(dealId);
  if (!existing) return null;
  const inbound = findLatestInboundMessage(messages);
  const now = new Date().toISOString();
  const prev = normalizeSellerSms(existing.sellerSms);
  const sellerSms = applySellerSmsInbound(prev, inbound, { checkedAt: now });
  const changed = sellerSms.lastInboundId !== prev.lastInboundId
    || sellerSms.lastInboundAt !== prev.lastInboundAt
    || sellerSms.lastInboundPreview !== prev.lastInboundPreview
    || sellerSms.lastCheckedAt !== prev.lastCheckedAt
    || sellerSms.seenBy.admin !== prev.seenBy.admin
    || sellerSms.seenBy.brad !== prev.seenBy.brad;
  let deal = existing;
  if (changed) {
    deal = upsertDeal({ ...existing, sellerSms });
  }
  return clearSellerSmsUnreadIfDeskReplied(deal.dealId, messages) || getDeal(deal.dealId);
}

function markSellerSmsSeen(dealId, username) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const user = teamUserFromUsername(username);
  const sms = normalizeSellerSms(existing.sellerSms);
  const seenAt = sms.lastInboundAt || new Date().toISOString();
  sms.seenBy = { ...sms.seenBy, [user]: seenAt };
  return upsertDeal({ ...existing, sellerSms: sms });
}

function listUnreadSellerSmsForUser(username) {
  const user = teamUserFromUsername(username);
  const out = [];
  for (const deal of listDeals()) {
    if (!isSellerSmsUnreadForUser(deal, user)) continue;
    const sms = normalizeSellerSms(deal.sellerSms);
    out.push({
      dealId: deal.dealId,
      address: deal.address,
      city: deal.city,
      state: deal.state,
      preview: sms.lastInboundPreview,
      createdAt: sms.lastInboundAt,
      count: 1
    });
  }
  out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return out;
}

/** In-memory peek throttle keyed by dealId (ms since epoch). */
const sellerSmsPeekMemory = new Map();
const SELLER_SMS_PEEK_TTL_MS = 20000;
const SELLER_SMS_PEEK_CONCURRENCY = 3;

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Throttled GHL peek for newest inbound SMS on active deals.
 * Updates deal.sellerSms; never throws to callers.
 */
async function peekSellerSmsForOpenDeals() {
  let ghl;
  try {
    ghl = require('./ghl-client');
  } catch (_) {
    return { peeked: 0, updated: 0 };
  }
  if (!ghl.isConfigured || !ghl.isConfigured()) return { peeked: 0, updated: 0 };

  const now = Date.now();
  const candidates = listDeals().filter((d) => {
    if (!d?.ghlContactId) return false;
    if (slugPart(d.stage) === 'funded') return false;
    const mem = sellerSmsPeekMemory.get(d.dealId) || 0;
    if (now - mem < SELLER_SMS_PEEK_TTL_MS) return false;
    const checked = d.sellerSms?.lastCheckedAt ? Date.parse(d.sellerSms.lastCheckedAt) : 0;
    if (checked && now - checked < SELLER_SMS_PEEK_TTL_MS) return false;
    return true;
  });

  let peeked = 0;
  let updated = 0;

  await mapPool(candidates, SELLER_SMS_PEEK_CONCURRENCY, async (deal) => {
    sellerSmsPeekMemory.set(deal.dealId, Date.now());
    try {
      peeked += 1;
      let conversationId = slugPart(deal.conversationId) || null;
      let batch = [];
      if (conversationId) {
        const data = await ghl.getConversationMessages(conversationId, { limit: 25 });
        const bundle = data.messages || data;
        batch = Array.isArray(bundle.messages) ? bundle.messages
          : (Array.isArray(bundle) ? bundle : []);
      } else {
        const conversations = await ghl.searchConversationsByContact(deal.ghlContactId);
        const conv = conversations[0] || null;
        conversationId = conv?.id || null;
        if (conversationId) {
          const data = await ghl.getConversationMessages(conversationId, { limit: 25 });
          const bundle = data.messages || data;
          batch = Array.isArray(bundle.messages) ? bundle.messages
            : (Array.isArray(bundle) ? bundle : []);
        }
      }
      const human = batch.filter((m) => ghl.isHumanSmsMessage(m));
      human.sort((a, b) => ghl.parseGhlTimestampMs(a.dateAdded) - ghl.parseGhlTimestampMs(b.dateAdded));
      const before = getDeal(deal.dealId);
      const saved = recordSellerSmsFromMessages(deal.dealId, human.map((m) => ({
        id: m.id,
        body: ghl.smsPreviewText(m),
        direction: String(m.direction || '').toLowerCase(),
        dateAdded: ghl.parseGhlTimestamp(m.dateAdded) || m.dateAdded || null,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        hasAttachments: ghl.messageHasAttachments(m)
      })));
      if (conversationId && before && before.conversationId !== conversationId) {
        upsertDeal({ ...getDeal(deal.dealId), conversationId });
      }
      if (saved && saved.sellerSms?.lastInboundId !== before?.sellerSms?.lastInboundId) {
        updated += 1;
      }
    } catch (err) {
      console.warn('[seller-sms] peek failed for', deal.dealId, err.message);
      try {
        const existing = getDeal(deal.dealId);
        if (existing) {
          upsertDeal({
            ...existing,
            sellerSms: {
              ...normalizeSellerSms(existing.sellerSms),
              lastCheckedAt: new Date().toISOString()
            }
          });
        }
      } catch (_) { /* ignore */ }
    }
  });

  return { peeked, updated };
}

const TEAM_REACTION_KEYS = ['like', 'dislike', 'laugh', 'explain', 'fire', 'hundred'];
const TEAM_REACTION_EMOJI = {
  like: '👍',
  dislike: '👎',
  laugh: '😂',
  explain: '❗',
  fire: '🔥',
  hundred: '💯'
};

function emptyTeamReactions() {
  const out = {};
  for (const key of TEAM_REACTION_KEYS) {
    out[key] = { admin: null, brad: null };
  }
  return out;
}

function normalizeTeamReactions(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = emptyTeamReactions();
  for (const key of TEAM_REACTION_KEYS) {
    const entry = src[key];
    if (!entry || typeof entry !== 'object') continue;
    out[key] = {
      admin: slugPart(entry.admin) || null,
      brad: slugPart(entry.brad) || null
    };
  }
  return out;
}

function normalizeTeamMessages(list) {
  if (!Array.isArray(list)) return [];
  return list.map((raw) => {
    const fromUser = slugPart(raw.fromUser).toLowerCase() === 'brad' ? 'brad' : 'admin';
    const readBy = raw.readBy && typeof raw.readBy === 'object' ? raw.readBy : {};
    return {
      id: slugPart(raw.id) || `tm_${crypto.randomBytes(6).toString('hex')}`,
      fromUser,
      body: slugPart(raw.body),
      createdAt: slugPart(raw.createdAt) || new Date().toISOString(),
      readBy: {
        admin: slugPart(readBy.admin) || null,
        brad: slugPart(readBy.brad) || null
      },
      reactions: normalizeTeamReactions(raw.reactions)
    };
  }).filter((m) => m.body);
}

function isDeskReady(deal) {
  return Boolean(
    normalizeAccessType(deal?.accessType)
    && normalizeVacancy(deal?.vacancy)
    && rehabInfoFilled(deal?.rehabInfo)
  );
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
    signedAt: slugPart(raw.signedAt) || null,
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
    signedAt: slugPart(raw.signedAt) || null,
    signNowDocumentId: slugPart(raw.signNowDocumentId) || null,
    lastError: slugPart(raw.lastError) || null
  };
}

/** AOC send snapshot — form fields + SignNow status (does not imply buyer_found stage). */
function normalizeAocSend(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = normalizeSendState(raw) || {};
  return {
    status: base.status || 'template_pending',
    requestedAt: base.requestedAt || null,
    requestedBy: base.requestedBy || null,
    signNowDocumentId: base.signNowDocumentId || null,
    lastError: base.lastError || null,
    signedAt: slugPart(raw.signedAt) || null,
    buyerEmail: slugPart(raw.buyerEmail).toLowerCase(),
    legalDescription: slugPart(raw.legalDescription),
    apn: slugPart(raw.apn),
    assigneePurchasePrice: normalizeMoney(raw.assigneePurchasePrice),
    titleCompanyName: slugPart(raw.titleCompanyName),
    titleCompanyAddress: slugPart(raw.titleCompanyAddress),
    escrowOfficerName: slugPart(raw.escrowOfficerName),
    titleCompanyEmail: slugPart(raw.titleCompanyEmail).toLowerCase(),
    buyerEmd: normalizeMoney(raw.buyerEmd != null ? raw.buyerEmd : raw.assigneeEmd),
    closingDate: slugPart(raw.closingDate || raw.coe),
    additionalTerms: slugPart(raw.additionalTerms)
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
  // Prefer full deal files. Index stubs omit desk fields (rehab, title, EMD…)
  // and made saves look like they vanished after reload.
  return index
    .map((e) => getDeal(e.dealId))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function enrichDealForDisplay(deal, opts = {}) {
  if (!deal) return null;
  const lead = deal.leadId ? getLead(deal.leadId) : null;
  const { resolveDealPropertyAddress } = require('./deal-property-address');
  const property = resolveDealPropertyAddress(deal, lead);
  let streetViewUrl = deal.streetViewUrl || lead?.streetViewUrl || '';
  let satelliteUrl = deal.satelliteUrl || lead?.satelliteUrl || '';
  try {
    const { resolveImageryForAnalyzerResult } = require('./imagery-resolve');
    const imagery = resolveImageryForAnalyzerResult({
      street: property.address,
      address: property.address,
      city: property.city,
      state: property.state,
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
  const sellerMedia = enrichSellerMediaForDisplay(deal);

  const leadAccess = accessFromLead(lead);
  const accessType = normalizeAccessType(deal.accessType) || leadAccess.type;
  const accessDetail = slugPart(deal.accessDetail) || leadAccess.detail;
  const vacancy = normalizeVacancy(deal.vacancy) || vacancyFromLead(lead) || '';
  const photoCost = normalizeMoney(deal.photoCost) ?? 0;
  const payouts = computeDealPayouts(deal.assignmentFee, photoCost);
  const fundedYes = slugPart(deal.stage) === 'funded';

  return {
    ...deal,
    address: property.address || deal.address,
    city: property.city || deal.city,
    state: property.state || deal.state,
    zip: property.zip || deal.zip,
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
    photoCost,
    funded: fundedYes ? 'yes' : 'no',
    fundedLabel: fundedYes ? 'Yes' : 'No',
    buyerFound: (() => {
      const stage = slugPart(deal.stage);
      if (stage === 'buyer_found' || stage === 'funded') return 'yes';
      if (slugPart(deal.cashBuyerName)) return 'yes';
      if (deal.buyerAssignment && (deal.buyerAssignment.buyerEntity || deal.buyerAssignment.buyerEmail || deal.buyerAssignment.buyerContactName)) {
        return 'yes';
      }
      return 'no';
    })(),
    buyerFoundLabel: (() => {
      const stage = slugPart(deal.stage);
      if (stage === 'buyer_found' || stage === 'funded') return 'Yes';
      if (slugPart(deal.cashBuyerName)) return 'Yes';
      if (deal.buyerAssignment && (deal.buyerAssignment.buyerEntity || deal.buyerAssignment.buyerEmail || deal.buyerAssignment.buyerContactName)) {
        return 'Yes';
      }
      return 'No';
    })(),
    rehabInfo: normalizeRehabInfo(deal.rehabInfo),
    rehabInfoReady: rehabInfoFilled(deal.rehabInfo) ? 'yes' : 'no',
    rehabInfoLabel: rehabInfoFilled(deal.rehabInfo) ? 'Yes' : 'No',
    closingDisplay: formatClosingSlash(deal.closingDate),
    tcPay: payouts.tcPay,
    acqPay: payouts.acqPay,
    dispoPay: payouts.dispoPay,
    netAfterTc: payouts.netAfterTc,
    netAfterCosts: payouts.netAfterCosts,
    photoCostApplied: payouts.photoCost,
    documents,
    sellerMedia,
    mediaZipUrl: `/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/media/zip`,
    amendmentDefaults: {
      seller: resolveAmendmentDefaults(deal, null, 'seller'),
      end_buyer: resolveAmendmentDefaults(deal, null, 'end_buyer')
    },
    teamMessages: normalizeTeamMessages(deal.teamMessages),
    sellerSms: normalizeSellerSms(deal.sellerSms),
    sellerSmsPreview: normalizeSellerSms(deal.sellerSms).lastInboundPreview || '',
    sellerSmsAt: normalizeSellerSms(deal.sellerSms).lastInboundAt || null,
    sellerSmsUnread: opts.username
      ? isSellerSmsUnreadForUser(deal, opts.username)
      : false,
    lead: lead || null
  };
}

function listDealsEnriched(username) {
  return listDeals().map((d) => enrichDealForDisplay(d, { username }));
}

/** Contract Tracker board = dispo stages only; pipeline = all deal stages. */
function filterDealsForBoard(deals, board = 'contracts') {
  const list = Array.isArray(deals) ? deals : [];
  if (board === 'pipeline') return list;
  return list.filter((d) => isDispoStage(d.stage));
}

/**
 * Brad-safe card for pre-UC Sales Pipeline: address + imagery only.
 * Full enrich for admin or dispo-stage deals.
 */
function projectDealForViewer(deal, username) {
  if (!deal) return null;
  const enriched = enrichDealForDisplay(deal, { username });
  const isBrad = String(username || '').trim().toLowerCase() === 'brad';
  if (!isBrad || isDispoStage(enriched.stage)) return enriched;
  return {
    dealId: enriched.dealId,
    address: enriched.address,
    city: enriched.city,
    state: enriched.state,
    zip: enriched.zip,
    stage: enriched.stage,
    ghlStageName: enriched.ghlStageName || '',
    thumbUrl: enriched.thumbUrl || '',
    streetViewUrl: enriched.streetViewUrl || '',
    satelliteUrl: enriched.satelliteUrl || '',
    restricted: true
  };
}

function listDealsForBoard(board, username) {
  const filtered = filterDealsForBoard(listDeals(), board);
  return filtered.map((d) => projectDealForViewer(d, username));
}

function assertBradCanWriteDeal(deal, username) {
  const isBrad = String(username || '').trim().toLowerCase() === 'brad';
  if (!isBrad || !deal) return;
  if (isSalesStage(deal.stage)) {
    const err = new Error('Disposition partner cannot edit sales-stage deals');
    err.code = 'FORBIDDEN_SALES_STAGE';
    throw err;
  }
}

function getDealProfile(dealId) {
  const deal = getDeal(dealId);
  if (!deal) return null;
  return enrichDealForDisplay(deal);
}

function stampFundedAt(existing, merged) {
  const wasFunded = existing && slugPart(existing.stage) === 'funded';
  const isFunded = slugPart(merged.stage) === 'funded';
  if (!isFunded) {
    // Keep historical stamp if they move off Funded (won't count until funded again)
    merged.fundedAt = slugPart(existing?.fundedAt || merged.fundedAt) || null;
    return merged;
  }
  if (existing?.fundedAt) {
    merged.fundedAt = existing.fundedAt;
  } else if (slugPart(merged.fundedAt)) {
    // Explicit stamp on create / import
    merged.fundedAt = merged.fundedAt;
  } else if (wasFunded && existing?.updatedAt) {
    // Already funded before stamp existed — backfill once from last update
    merged.fundedAt = existing.updatedAt;
  } else {
    merged.fundedAt = new Date().toISOString();
  }
  return merged;
}

function upsertDeal(raw) {
  const existing = raw.dealId ? getDeal(raw.dealId) : null;
  let merged = normalizeDeal({
    ...(existing || {}),
    ...raw,
    createdAt: existing?.createdAt || raw.createdAt
  });
  merged = stampFundedAt(existing, merged);
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
    funded: 0,
    terminated: 0
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
    const stage = canonicalizeDealStage(d.stage);
    if (!isDispoStage(stage)) continue;
    if (byStage[stage] != null) byStage[stage] += 1;
    // Terminated / funded closes don't count toward open pipeline money
    if (stage === 'terminated') continue;
    const fee = d.assignmentFee == null ? null : Number(d.assignmentFee);
    const purchase = d.purchasePrice == null ? null : Number(d.purchasePrice);
    const p = computeDealPayouts(fee, settings);
    const isClosed = stage === 'funded';

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

  const openCount = byStage.under_contract + byStage.buyer_found;
  return {
    dealCount: list.filter((d) => isDispoStage(canonicalizeDealStage(d.stage))).length,
    byStage,
    underContract: byStage.under_contract,
    buyerFound: byStage.buyer_found,
    closing: 0,
    funded: byStage.funded,
    terminated: byStage.terminated,
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

const DEFAULT_FUNDED_GOAL = Object.freeze({
  targetCount: 10,
  windowDays: 60,
  label: '60-day funded closings'
});

function goalConfigPath() {
  return path.join(contractsRoot(), 'funded-goal.json');
}

function readFundedGoalConfig() {
  const raw = readJson(goalConfigPath(), null);
  if (!raw || typeof raw !== 'object') return null;
  const targetCount = Math.max(1, Math.min(100, Number(raw.targetCount) || DEFAULT_FUNDED_GOAL.targetCount));
  const windowDays = Math.max(1, Math.min(365, Number(raw.windowDays) || DEFAULT_FUNDED_GOAL.windowDays));
  const startedAt = slugPart(raw.startedAt);
  if (!startedAt || Number.isNaN(Date.parse(startedAt))) return null;
  return {
    targetCount,
    windowDays,
    startedAt,
    label: slugPart(raw.label) || DEFAULT_FUNDED_GOAL.label
  };
}

function writeFundedGoalConfig(config) {
  const next = {
    targetCount: Math.max(1, Math.min(100, Number(config.targetCount) || DEFAULT_FUNDED_GOAL.targetCount)),
    windowDays: Math.max(1, Math.min(365, Number(config.windowDays) || DEFAULT_FUNDED_GOAL.windowDays)),
    startedAt: slugPart(config.startedAt) || new Date().toISOString(),
    label: slugPart(config.label) || DEFAULT_FUNDED_GOAL.label,
    updatedAt: new Date().toISOString()
  };
  writeJsonAtomic(goalConfigPath(), next);
  return next;
}

/** Ensure a 60-day / 10-deal goal exists (starts on first desk visit). */
function ensureFundedGoalConfig() {
  const existing = readFundedGoalConfig();
  if (existing) return existing;
  return writeFundedGoalConfig({
    ...DEFAULT_FUNDED_GOAL,
    startedAt: new Date().toISOString()
  });
}

function resolveDealFundedAt(deal) {
  if (!deal) return null;
  if (slugPart(deal.stage) !== 'funded') return null;
  const stamped = slugPart(deal.fundedAt);
  if (stamped && !Number.isNaN(Date.parse(stamped))) return stamped;
  const fallback = slugPart(deal.updatedAt) || slugPart(deal.createdAt);
  if (fallback && !Number.isNaN(Date.parse(fallback))) return fallback;
  return null;
}

/**
 * Count Funded (Yes) deals inside the active 60-day window for the goal tracker.
 */
function computeFundedGoal(deals = listDeals()) {
  const config = ensureFundedGoalConfig();
  const startMs = Date.parse(config.startedAt);
  const endMs = startMs + config.windowDays * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const list = Array.isArray(deals) ? deals : [];

  const fundedInWindow = [];
  for (const d of list) {
    const at = resolveDealFundedAt(d);
    if (!at) continue;
    const t = Date.parse(at);
    if (Number.isNaN(t)) continue;
    if (t >= startMs && t <= endMs) fundedInWindow.push(d);
  }

  const currentCount = fundedInWindow.length;
  const targetCount = config.targetCount;
  const pct = targetCount > 0
    ? Math.min(100, Math.round((currentCount / targetCount) * 100))
    : 0;
  const msRemaining = Math.max(0, endMs - nowMs);
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  const expired = nowMs > endMs;

  return {
    targetCount,
    windowDays: config.windowDays,
    startedAt: config.startedAt,
    endsAt: new Date(endMs).toISOString(),
    label: config.label,
    currentCount,
    remainingToGoal: Math.max(0, targetCount - currentCount),
    percentToGoal: pct,
    msRemaining,
    daysRemaining: expired ? 0 : daysRemaining,
    expired,
    met: currentCount >= targetCount,
    fundedDealIds: fundedInWindow.map((d) => d.dealId).filter(Boolean)
  };
}

function restartFundedGoal(opts = {}) {
  return writeFundedGoalConfig({
    targetCount: opts.targetCount != null ? opts.targetCount : DEFAULT_FUNDED_GOAL.targetCount,
    windowDays: opts.windowDays != null ? opts.windowDays : DEFAULT_FUNDED_GOAL.windowDays,
    label: opts.label || DEFAULT_FUNDED_GOAL.label,
    startedAt: new Date().toISOString()
  });
}

function applyCatalogStatusForDeal(deal) {
  if (!deal?.leadId) return null;
  const status = catalogStatusForDealStage(deal.stage);
  return setLeadCatalogStatus(deal.leadId, status);
}

/**
 * Before SignNow send / display: rewrite denormalized deal address from linked lead
 * when the lead has a complete address (prevents GHL city/state mix-ups on docs).
 */
function healDealAddressFromLinkedLead(dealId) {
  const existing = getDeal(dealId);
  if (!existing) return null;
  const lead = existing.leadId ? getLead(existing.leadId) : null;
  const { resolveDealPropertyAddress } = require('./deal-property-address');
  const resolved = resolveDealPropertyAddress(existing, lead);
  if (resolved.source !== 'lead' && resolved.source !== 'lead-partial') {
    return existing;
  }
  const same = slugPart(existing.address) === resolved.address
    && slugPart(existing.city) === resolved.city
    && slugPart(existing.state).toUpperCase() === resolved.state
    && slugPart(existing.zip) === resolved.zip;
  if (same) return existing;
  console.warn(
    '[contracts] healed deal address from linked lead',
    existing.dealId,
    `${existing.address} / ${existing.city} ${existing.state} ${existing.zip}`,
    '→',
    `${resolved.address} / ${resolved.city} ${resolved.state} ${resolved.zip}`
  );
  return upsertDeal({
    ...existing,
    address: resolved.address,
    city: resolved.city,
    state: resolved.state,
    zip: resolved.zip
  });
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
    'documents', 'sellerMedia', 'signNowPending', 'buyerAssignment', 'jvAgreement', 'aocSend', 'amendmentSend',
    'ownerEmail', 'sellerNames',
    // originalAgreementDate is PSA-locked — only GHL sync / deal open may set it
    'accessType', 'accessDetail', 'vacancy',
    'sellerEmdSubmitted', 'buyerEmdSubmitted', 'titleOpened',
    'photosAvailable', 'photoCost', 'rehabInfo', 'teamMessages', 'alertFlags', 'sellerSms',
    'ghlContactLocked', 'photographerSchedule', 'conditionScan'
  ];
  const next = { ...existing };
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rehabInfo')) {
    next.rehabInfo = normalizeRehabInfo(patch.rehabInfo);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'photographerSchedule')) {
    next.photographerSchedule = normalizePhotographerScheduleSafe(patch.photographerSchedule);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'conditionScan')) {
    next.conditionScan = normalizeConditionScan(patch.conditionScan);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'photoCost')) {
    next.photoCost = normalizeMoney(patch.photoCost) ?? 0;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'sellerSms')) {
    next.sellerSms = normalizeSellerSms(patch.sellerSms);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'sellerMedia')) {
    next.sellerMedia = normalizeSellerMediaList(patch.sellerMedia);
  }
  if (Array.isArray(patch.documents)) {
    next.documents = mergeDocuments([], patch.documents);
  }
  if (Array.isArray(patch.signNowPending)) {
    next.signNowPending = normalizeSignNowPending(patch.signNowPending);
  }
  if (Array.isArray(patch.teamMessages)) {
    next.teamMessages = normalizeTeamMessages(patch.teamMessages);
  }
  if (patch.alertFlags && typeof patch.alertFlags === 'object') {
    next.alertFlags = normalizeAlertFlags({ ...existing.alertFlags, ...patch.alertFlags });
  }
  const saved = upsertDeal(next);
  applyCatalogStatusForDeal(saved);
  return saved;
}

function addTeamMessage(dealId, { fromUser, body }) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const user = slugPart(fromUser).toLowerCase() === 'brad' ? 'brad' : 'admin';
  const text = slugPart(body);
  if (!text) {
    const err = new Error('Message body required');
    err.code = 'MISSING_BODY';
    throw err;
  }
  const msg = {
    id: `tm_${crypto.randomBytes(6).toString('hex')}`,
    fromUser: user,
    body: text,
    createdAt: new Date().toISOString(),
    readBy: { [user]: new Date().toISOString(), admin: null, brad: null },
    reactions: emptyTeamReactions()
  };
  msg.readBy[user] = new Date().toISOString();
  const teamMessages = normalizeTeamMessages([...(existing.teamMessages || []), msg]);
  const saved = upsertDeal({ ...existing, teamMessages });
  return { deal: saved, message: teamMessages[teamMessages.length - 1] };
}

function toggleTeamMessageReaction(dealId, messageId, emojiKey, username) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const key = slugPart(emojiKey).toLowerCase();
  if (!TEAM_REACTION_KEYS.includes(key)) {
    const err = new Error('Invalid reaction');
    err.code = 'INVALID_REACTION';
    throw err;
  }
  const user = slugPart(username).toLowerCase() === 'brad' ? 'brad' : 'admin';
  const msgId = slugPart(messageId);
  let found = false;
  const now = new Date().toISOString();
  const teamMessages = normalizeTeamMessages(existing.teamMessages || []).map((m) => {
    if (m.id !== msgId) return m;
    found = true;
    const reactions = normalizeTeamReactions(m.reactions);
    const already = !!reactions[key][user];
    reactions[key] = {
      ...reactions[key],
      [user]: already ? null : now
    };
    return { ...m, reactions };
  });
  if (!found) {
    const err = new Error('Message not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const saved = upsertDeal({ ...existing, teamMessages });
  const message = normalizeTeamMessages(saved.teamMessages).find((m) => m.id === msgId);
  return { deal: saved, message };
}

function markTeamMessagesRead(dealId, username) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const user = slugPart(username).toLowerCase() === 'brad' ? 'brad' : 'admin';
  const now = new Date().toISOString();
  const teamMessages = normalizeTeamMessages(existing.teamMessages || []).map((m) => ({
    ...m,
    readBy: {
      ...m.readBy,
      [user]: m.readBy?.[user] || now
    }
  }));
  const saved = upsertDeal({ ...existing, teamMessages });
  return saved;
}

function listUnreadTeamForUser(username) {
  const user = slugPart(username).toLowerCase() === 'brad' ? 'brad' : 'admin';
  const out = [];
  for (const deal of listDeals()) {
    const msgs = normalizeTeamMessages(deal.teamMessages || []).filter(
      (m) => m.fromUser !== user && !m.readBy?.[user]
    );
    if (!msgs.length) continue;
    const latest = msgs[msgs.length - 1];
    out.push({
      dealId: deal.dealId,
      address: deal.address,
      city: deal.city,
      state: deal.state,
      fromUser: latest.fromUser,
      preview: latest.body.slice(0, 120),
      createdAt: latest.createdAt,
      count: msgs.length
    });
  }
  out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return out;
}

/**
 * Detect one-shot alert transitions and fire team SMS/email. Updates alertFlags on deal.
 */
async function fireDealTransitionAlerts(before, after) {
  if (!after) return { fired: [] };
  const flags = normalizeAlertFlags(after.alertFlags);
  const fired = [];
  const notify = require('./team-notify');
  let nextFlags = { ...flags };

  const titleNow = normalizeYesNo(after.titleOpened) === 'yes';
  const titleWas = normalizeYesNo(before?.titleOpened) === 'yes';
  if (titleNow && !titleWas && !flags.titleOpened) {
    await notify.alertTitleOpened({ deal: after }).catch(() => {});
    nextFlags.titleOpened = true;
    fired.push('titleOpened');
  }

  const emdNow = normalizeYesNo(after.sellerEmdSubmitted) === 'yes';
  const emdWas = normalizeYesNo(before?.sellerEmdSubmitted) === 'yes';
  if (emdNow && !emdWas && !flags.sellerEmd) {
    await notify.alertSellerEmd({ deal: after }).catch(() => {});
    nextFlags.sellerEmd = true;
    fired.push('sellerEmd');
  }

  const deskNow = isDeskReady(after);
  const deskWas = before ? isDeskReady(before) : false;
  if (deskNow && !deskWas && !flags.deskReady) {
    await notify.alertDeskReady({ deal: after }).catch(() => {});
    nextFlags.deskReady = true;
    fired.push('deskReady');
  }

  const photosNow = normalizeYesNo(after.photosAvailable) === 'yes';
  const photosWas = normalizeYesNo(before?.photosAvailable) === 'yes';
  if (photosNow && !photosWas && !flags.photos) {
    await notify.alertPhotosReady({ deal: after }).catch(() => {});
    nextFlags.photos = true;
    fired.push('photos');
  }

  const buyerEmdNow = normalizeYesNo(after.buyerEmdSubmitted) === 'yes';
  const buyerEmdWas = normalizeYesNo(before?.buyerEmdSubmitted) === 'yes';
  if (buyerEmdNow && !buyerEmdWas && !flags.buyerEmd) {
    await notify.alertBuyerEmd({ deal: after }).catch(() => {});
    nextFlags.buyerEmd = true;
    fired.push('buyerEmd');
  }

  const fundedNow = slugPart(after.stage) === 'funded';
  const fundedWas = slugPart(before?.stage) === 'funded';
  if (fundedNow && !fundedWas && !flags.funded) {
    const totals = proofTotals(listDeals());
    await notify.alertFunded({
      deal: after,
      assignmentFee: after.assignmentFee,
      lifetimeAssignments: totals.closedAssignmentFees ?? totals.totalAssignmentFees ?? 0
    }).catch(() => {});
    nextFlags.funded = true;
    fired.push('funded');
  }

  if (fired.length) {
    upsertDeal({ ...after, alertFlags: normalizeAlertFlags(nextFlags) });
  }
  return { fired };
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

/** PSA-locked write path — only used when syncing GHL contract signed date. */
function setOriginalAgreementDateFromPsa(dealId, signedDate) {
  const existing = getDeal(dealId);
  if (!existing) return null;
  const next = formatClosingSlash(signedDate);
  if (!next) return existing;
  if (existing.originalAgreementDate) return existing;
  return upsertDeal({ ...existing, originalAgreementDate: next });
}

/**
 * Smart amendment counterparties + original PSA date from deal / GHL / buyer assignment.
 * partyType: 'seller' | 'end_buyer'
 */
function resolveAmendmentDefaults(deal, contact = null, partyType = 'seller') {
  const party = String(partyType || 'seller').toLowerCase() === 'end_buyer'
    ? 'end_buyer'
    : 'seller';
  const ba = deal?.buyerAssignment || {};
  const originalAgreementDate = formatClosingSlash(
    deal?.originalAgreementDate
      || deal?.agreementDate
      || deal?.contractDate
      || contact?.contractSignedDate
      || ''
  );

  let counterpartyName = '';
  let counterpartyEmail = '';
  if (party === 'end_buyer') {
    counterpartyName = slugPart(
      ba.buyerEntity
        || ba.buyerContactName
        || deal?.cashBuyerName
        || contact?.cashBuyerName
    );
    counterpartyEmail = slugPart(ba.buyerEmail || '').toLowerCase();
  } else {
    counterpartyName = slugPart(
      deal?.ownerName
        || deal?.sellerNames
        || contact?.sellersName
        || contact?.name
    );
    counterpartyEmail = slugPart(
      deal?.ownerEmail
        || deal?.email
        || contact?.email
        || ''
    ).toLowerCase();
  }

  return {
    party,
    originalAgreementDate,
    counterpartyName,
    counterpartyEmail,
    sellerName: party === 'seller' ? counterpartyName : slugPart(deal?.ownerName || contact?.sellersName || contact?.name),
    sellerEmail: party === 'seller' ? counterpartyEmail : slugPart(deal?.ownerEmail || deal?.email || contact?.email || '').toLowerCase(),
    endBuyerName: party === 'end_buyer'
      ? counterpartyName
      : slugPart(ba.buyerEntity || ba.buyerContactName || deal?.cashBuyerName || contact?.cashBuyerName),
    endBuyerEmail: party === 'end_buyer'
      ? counterpartyEmail
      : slugPart(ba.buyerEmail || '').toLowerCase()
  };
}

/**
 * Send AOC only — does not move deal stage to buyer_found.
 * Property address comes from the deal; remaining fields from the form payload.
 */
async function requestAocSend(dealId, input = {}, actor = '') {
  const existing = healDealAddressFromLinkedLead(dealId) || getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const buyerEmail = slugPart(input.buyerEmail || input.email).toLowerCase();
  if (!buyerEmail) {
    const err = new Error('Buyer email is required');
    err.code = 'MISSING_BUYER_EMAIL';
    throw err;
  }

  const form = {
    buyerEmail,
    legalDescription: slugPart(input.legalDescription),
    apn: slugPart(input.apn),
    assigneePurchasePrice: input.assigneePurchasePrice,
    titleCompanyName: slugPart(input.titleCompanyName),
    titleCompanyAddress: slugPart(input.titleCompanyAddress),
    escrowOfficerName: slugPart(input.escrowOfficerName),
    titleCompanyEmail: slugPart(input.titleCompanyEmail).toLowerCase(),
    buyerEmd: input.buyerEmd != null ? input.buyerEmd : input.assigneeEmd,
    closingDate: slugPart(input.closingDate || input.coe),
    additionalTerms: slugPart(input.additionalTerms) || 'NA'
  };

  let aocSend = normalizeAocSend({
    ...(existing.aocSend || {}),
    ...form,
    status: 'sending',
    requestedAt: new Date().toISOString(),
    requestedBy: slugPart(actor) || null,
    signedAt: null,
    signNowDocumentId: null,
    lastError: null
  });

  let saved = upsertDeal({ ...existing, aocSend });

  try {
    const { sendAocForDeal } = require('./signnow-send');
    const aoc = await sendAocForDeal(saved, form);
    aocSend = normalizeAocSend({
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
        documentName: aoc.documentName,
        message: aoc.message
      }
    };
  } catch (err) {
    aocSend = normalizeAocSend({
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

  let aocSend = normalizeAocSend({
    ...(existing.aocSend || {}),
    status: 'sending',
    requestedAt: new Date().toISOString(),
    requestedBy: slugPart(actor) || null,
    buyerEmail,
    buyerEmd: input.buyerEmd,
    closingDate,
    additionalTerms: slugPart(input.notes)
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
    aocSend = normalizeAocSend({ ...aocSend, status: 'saved_only' });
    saved = upsertDeal({ ...saved, aocSend });
    return {
      deal: saved,
      aoc: { status: 'saved_only', message: 'Buyer saved. AOC send skipped.' }
    };
  }

  try {
    const { sendAocForDeal } = require('./signnow-send');
    const aoc = await sendAocForDeal(saved, {
      buyerEmail,
      legalDescription: input.legalDescription,
      apn: input.apn,
      assigneePurchasePrice: input.assigneePurchasePrice != null
        ? input.assigneePurchasePrice
        : input.assignmentPurchasePrice,
      titleCompanyName: input.titleCompanyName,
      titleCompanyAddress: input.titleCompanyAddress,
      escrowOfficerName: input.escrowOfficerName,
      titleCompanyEmail: input.titleCompanyEmail,
      buyerEmd: input.buyerEmd,
      closingDate,
      additionalTerms: input.additionalTerms || input.notes
    });
    aocSend = normalizeAocSend({
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
    aocSend = normalizeAocSend({
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
  const existing = healDealAddressFromLinkedLead(dealId) || getDeal(dealId);
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
    signedAt: null,
    signNowDocumentId: null,
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
  const existing = healDealAddressFromLinkedLead(dealId) || getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const partyType = slugPart(input.partyType || input.party || 'seller').toLowerCase() === 'end_buyer'
    ? 'end_buyer'
    : 'seller';
  const defaults = resolveAmendmentDefaults(existing, input.contact || null, partyType);

  const counterpartyName = slugPart(input.sellerName || input.counterpartyName || defaults.counterpartyName);
  const counterpartyEmail = slugPart(input.sellerEmail || input.counterpartyEmail || defaults.counterpartyEmail).toLowerCase();
  // Always use PSA / GHL signed date from the deal — never trust a client override
  const originalAgreementDate = slugPart(defaults.originalAgreementDate);
  if (!originalAgreementDate) {
    const err = new Error('Original PSA agreement date is missing on this deal. Sync from GHL or open the profile so the signed date can load first.');
    err.code = 'MISSING_ORIGINAL_DATE';
    throw err;
  }

  const sellers = Array.isArray(input.sellers) && input.sellers.length
    ? input.sellers
    : (counterpartyName && counterpartyEmail
      ? [{ name: counterpartyName, email: counterpartyEmail }]
      : []);

  let amendmentSend = normalizeSendState({
    ...(existing.amendmentSend || {}),
    status: 'sending',
    requestedAt: new Date().toISOString(),
    requestedBy: slugPart(actor) || null
  });

  const patchFields = {};
  if (partyType === 'seller' && counterpartyName && !existing.ownerName) {
    patchFields.ownerName = counterpartyName;
  }
  if (partyType === 'seller' && counterpartyEmail && !existing.ownerEmail && !existing.email) {
    patchFields.ownerEmail = counterpartyEmail;
  }

  let saved = upsertDeal({
    ...existing,
    ...patchFields,
    amendmentSend
  });

  try {
    const { sendAmendmentForDeal } = require('./signnow-send');
    const amd = await sendAmendmentForDeal(saved, {
      ...input,
      amendmentTerms: input.amendmentTerms || input.terms,
      originalAgreementDate,
      sellerName: counterpartyName,
      sellerEmail: counterpartyEmail,
      sellers
    });
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
        partyType,
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
    return requestAocSend(dealId, input, actor);
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

/** In-memory throttle for background SignNow signed-doc imports. */
const signNowSyncMemory = new Map();
const SIGNNOW_SYNC_TTL_MS = 45000;
const SIGNNOW_SYNC_CONCURRENCY = 2;

/**
 * Auto-import fully signed SignNow packages into deal documents for any deal
 * with pending invites. Throttled so board polls stay cheap.
 */
async function syncPendingSignNowAcrossDeals() {
  const { isSignNowConfigured } = require('./signnow-client');
  if (!isSignNowConfigured()) return { checked: 0, ingested: 0, deals: 0 };

  const now = Date.now();
  const candidates = listDeals().filter((d) => {
    if (!(d.signNowPending || []).length) return false;
    const mem = signNowSyncMemory.get(d.dealId) || 0;
    if (now - mem < SIGNNOW_SYNC_TTL_MS) return false;
    return true;
  });
  if (!candidates.length) return { checked: 0, ingested: 0, deals: 0 };

  let checked = 0;
  let ingested = 0;
  let dealsTouched = 0;

  await mapPool(candidates, SIGNNOW_SYNC_CONCURRENCY, async (deal) => {
    signNowSyncMemory.set(deal.dealId, Date.now());
    try {
      checked += 1;
      const out = await syncSignedSignNowDocuments(deal.dealId);
      const n = Number(out.ingested) || 0;
      if (n > 0) {
        ingested += n;
        dealsTouched += 1;
      }
    } catch (err) {
      console.warn('[signnow] auto-sync failed for', deal.dealId, err.message);
    }
  });

  return { checked, ingested, deals: dealsTouched };
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

function resolveLocalMediaPath(dealId, item) {
  if (!item?.localFile) return null;
  const safe = path.basename(String(item.localFile));
  const full = path.join(dealMediaRoot(dealId), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

function getDealMediaItem(dealId, mediaId) {
  const deal = getDeal(dealId);
  if (!deal) return null;
  const item = normalizeSellerMediaList(deal.sellerMedia).find((m) => m.id === mediaId);
  if (!item) return null;
  return { deal, item };
}

function filenameFromUrl(url, fallback = 'attachment') {
  try {
    const u = new URL(String(url));
    const base = path.basename(u.pathname || '');
    if (base && base !== '/' && base !== '.') return base.slice(0, 120);
  } catch (_) { /* ignore */ }
  return fallback;
}

async function fetchSellerMediaBytes(url) {
  const target = String(url || '').trim();
  if (!target) {
    const err = new Error('Media URL required');
    err.code = 'MISSING_MEDIA_URL';
    throw err;
  }
  let lastErr = null;
  try {
    const ghl = require('./ghl-client');
    if (ghl.isConfigured && ghl.isConfigured()) {
      return await ghl.fetchGhlDocumentBytes({ url: target, originalUrl: target });
    }
  } catch (err) {
    lastErr = err;
  }
  try {
    const res = await fetch(target, { redirect: 'follow' });
    if (!res.ok) {
      const e = new Error(`Download ${res.status}`);
      e.code = 'MEDIA_DOWNLOAD_FAILED';
      throw e;
    }
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
      fromUrl: target
    };
  } catch (err) {
    const e = lastErr || err;
    e.code = e.code || 'MEDIA_DOWNLOAD_FAILED';
    throw e;
  }
}

async function saveSellerMediaFromUrl(dealId, input = {}) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const sourceUrl = slugPart(input.url || input.sourceUrl || input.originalUrl);
  if (!sourceUrl) {
    const err = new Error('Media URL required');
    err.code = 'MISSING_MEDIA_URL';
    throw err;
  }
  const already = normalizeSellerMediaList(existing.sellerMedia).find((m) => {
    const a = String(m.sourceUrl || '').split('?')[0].split('#')[0].toLowerCase();
    const b = String(sourceUrl).split('?')[0].split('#')[0].toLowerCase();
    return a && a === b;
  });
  if (already) {
    return {
      deal: existing,
      item: enrichSellerMediaForDisplay(existing).find((m) => m.id === already.id) || already,
      skipped: true
    };
  }

  const downloaded = await fetchSellerMediaBytes(sourceUrl);
  const buf = downloaded.buffer;
  if (!buf?.length) {
    const err = new Error('Empty media download');
    err.code = 'EMPTY_MEDIA';
    throw err;
  }
  if (buf.length > MAX_MEDIA_BYTES) {
    const err = new Error('Media too large (max 40MB)');
    err.code = 'MEDIA_TOO_LARGE';
    throw err;
  }

  const mimeType = slugPart(input.mimeType) || downloaded.contentType || 'application/octet-stream';
  const rawName = slugPart(input.name) || filenameFromUrl(sourceUrl, 'seller-media');
  let ext = path.extname(rawName).slice(0, 8);
  if (!ext) ext = guessExtFromMime(mimeType) || '.bin';
  const baseName = path.basename(rawName, path.extname(rawName)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48) || 'media';
  const id = `media_${crypto.randomBytes(6).toString('hex')}`;
  const fileName = `${id}_${baseName}${ext}`;
  const dir = dealMediaRoot(dealId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buf);

  const item = normalizeSellerMediaItem({
    id,
    name: `${baseName}${ext}`,
    mimeType,
    kind: mediaKindFromMime(mimeType, `${baseName}${ext}`),
    size: buf.length,
    sourceUrl,
    localFile: fileName,
    messageId: slugPart(input.messageId),
    savedAt: new Date().toISOString()
  });
  const sellerMedia = normalizeSellerMediaList([...(existing.sellerMedia || []), item]);
  const saved = upsertDeal({ ...existing, sellerMedia });
  if (!already) {
    try {
      const vision = require('./media-vision');
      vision.enqueueLabelDealMedia(dealId, { runScan: true });
    } catch (_) { /* best effort */ }
  }
  return {
    deal: saved,
    item: enrichSellerMediaForDisplay(saved).find((m) => m.id === item.id) || item,
    skipped: false
  };
}

function guessExtFromMimeLocal(mimeType) {
  return guessExtFromMime(mimeType);
}

/**
 * Save media from raw buffer / base64 (photographer upload or desk drop).
 */
function saveSellerMediaFromBuffer(dealId, input = {}) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  let buf = input.buffer || null;
  if (!buf && input.contentBase64) {
    const b64 = String(input.contentBase64).replace(/^data:[^;]+;base64,/, '');
    buf = Buffer.from(b64, 'base64');
  }
  if (!buf?.length) {
    const err = new Error('Media bytes required');
    err.code = 'EMPTY_MEDIA';
    throw err;
  }
  if (buf.length > MAX_MEDIA_BYTES) {
    const err = new Error('Media too large (max 40MB)');
    err.code = 'MEDIA_TOO_LARGE';
    throw err;
  }

  const mimeType = slugPart(input.mimeType) || 'application/octet-stream';
  const uploadSource = ['photographer', 'seller', 'desk'].includes(slugPart(input.uploadSource))
    ? slugPart(input.uploadSource)
    : 'desk';
  const rawName = slugPart(input.name) || `${uploadSource}-media`;
  let ext = path.extname(rawName).slice(0, 8);
  if (!ext) ext = guessExtFromMimeLocal(mimeType) || '.bin';
  const baseName = path.basename(rawName, path.extname(rawName)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48) || 'media';
  const id = `media_${crypto.randomBytes(6).toString('hex')}`;
  const fileName = `${id}_${baseName}${ext}`;
  const dir = dealMediaRoot(dealId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buf);

  const item = normalizeSellerMediaItem({
    id,
    name: `${baseName}${ext}`,
    mimeType,
    kind: mediaKindFromMime(mimeType, `${baseName}${ext}`),
    size: buf.length,
    sourceUrl: null,
    localFile: fileName,
    messageId: slugPart(input.messageId),
    uploadSource,
    savedAt: new Date().toISOString()
  });
  const sellerMedia = normalizeSellerMediaList([...(existing.sellerMedia || []), item]);
  const saved = upsertDeal({ ...existing, sellerMedia });
  try {
    const vision = require('./media-vision');
    vision.enqueueLabelDealMedia(dealId, { runScan: true });
  } catch (_) { /* best effort */ }
  return {
    deal: saved,
    item: enrichSellerMediaForDisplay(saved).find((m) => m.id === item.id) || item,
    skipped: false
  };
}

function guessExtFromMimeLocal(mimeType) {
  return guessExtFromMime(mimeType);
}

/**
 * Save media from raw buffer / base64 (photographer upload or desk drop).
 */
function saveSellerMediaFromBuffer(dealId, input = {}) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  let buf = input.buffer || null;
  if (!buf && input.contentBase64) {
    const b64 = String(input.contentBase64).replace(/^data:[^;]+;base64,/, '');
    buf = Buffer.from(b64, 'base64');
  }
  if (!buf?.length) {
    const err = new Error('Media bytes required');
    err.code = 'EMPTY_MEDIA';
    throw err;
  }
  if (buf.length > MAX_MEDIA_BYTES) {
    const err = new Error('Media too large (max 40MB)');
    err.code = 'MEDIA_TOO_LARGE';
    throw err;
  }

  const mimeType = slugPart(input.mimeType) || 'application/octet-stream';
  const uploadSource = ['photographer', 'seller', 'desk'].includes(slugPart(input.uploadSource))
    ? slugPart(input.uploadSource)
    : 'desk';
  const rawName = slugPart(input.name) || `${uploadSource}-media`;
  let ext = path.extname(rawName).slice(0, 8);
  if (!ext) ext = guessExtFromMimeLocal(mimeType) || '.bin';
  const baseName = path.basename(rawName, path.extname(rawName)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48) || 'media';
  const id = `media_${crypto.randomBytes(6).toString('hex')}`;
  const fileName = `${id}_${baseName}${ext}`;
  const dir = dealMediaRoot(dealId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buf);

  const item = normalizeSellerMediaItem({
    id,
    name: `${baseName}${ext}`,
    mimeType,
    kind: mediaKindFromMime(mimeType, `${baseName}${ext}`),
    size: buf.length,
    sourceUrl: null,
    localFile: fileName,
    messageId: slugPart(input.messageId),
    uploadSource,
    savedAt: new Date().toISOString()
  });
  const sellerMedia = normalizeSellerMediaList([...(existing.sellerMedia || []), item]);
  const saved = upsertDeal({ ...existing, sellerMedia });
  try {
    const vision = require('./media-vision');
    vision.enqueueLabelDealMedia(dealId, { runScan: true });
  } catch (_) { /* best effort */ }
  return {
    deal: saved,
    item: enrichSellerMediaForDisplay(saved).find((m) => m.id === item.id) || item,
    skipped: false
  };
}

async function saveSellerMediaMany(dealId, items = []) {
  const list = Array.isArray(items) ? items : [];
  const results = [];
  for (const raw of list) {
    try {
      const out = await saveSellerMediaFromUrl(dealId, raw);
      results.push({
        ok: true,
        skipped: !!out.skipped,
        item: out.item,
        url: raw.url || raw.sourceUrl || null
      });
    } catch (err) {
      results.push({
        ok: false,
        error: err.message,
        code: err.code || 'ERROR',
        url: raw.url || raw.sourceUrl || null
      });
    }
  }
  const deal = getDeal(dealId);
  return {
    deal,
    sellerMedia: enrichSellerMediaForDisplay(deal),
    results,
    saved: results.filter((r) => r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.ok && r.skipped).length,
    failed: results.filter((r) => !r.ok).length
  };
}

function removeSellerMedia(dealId, mediaId) {
  const existing = getDeal(dealId);
  if (!existing) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const item = normalizeSellerMediaList(existing.sellerMedia).find((m) => m.id === mediaId);
  if (!item) {
    const err = new Error('Media not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const full = resolveLocalMediaPath(dealId, item);
  if (full) {
    try { fs.unlinkSync(full); } catch (_) { /* ignore */ }
  }
  const sellerMedia = normalizeSellerMediaList(existing.sellerMedia).filter((m) => m.id !== mediaId);
  return upsertDeal({ ...existing, sellerMedia });
}

async function buildSellerMediaZip(dealId) {
  const deal = getDeal(dealId);
  if (!deal) {
    const err = new Error('Deal not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const items = normalizeSellerMediaList(deal.sellerMedia);
  if (!items.length) {
    const err = new Error('No saved media yet');
    err.code = 'NO_MEDIA';
    throw err;
  }
  const JSZip = require('jszip');
  const zip = new JSZip();
  let added = 0;
  const usedNames = new Set();
  for (const item of items) {
    const full = resolveLocalMediaPath(dealId, item);
    if (!full) continue;
    let name = item.name || path.basename(item.localFile);
    if (usedNames.has(name)) {
      const ext = path.extname(name);
      const stem = path.basename(name, ext);
      name = `${stem}_${item.id.slice(-6)}${ext}`;
    }
    usedNames.add(name);
    zip.file(name, fs.readFileSync(full));
    added += 1;
  }
  if (!added) {
    const err = new Error('Media files missing on disk');
    err.code = 'FILE_MISSING';
    throw err;
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const addr = slugPart(deal.address).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40) || 'property';
  return {
    buffer,
    filename: `${addr}-media.zip`,
    count: added
  };
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
  listDealsForBoard,
  filterDealsForBoard,
  projectDealForViewer,
  assertBradCanWriteDeal,
  isSalesStage,
  isDispoStage,
  canonicalizeDealStage,
  SALES_STAGES,
  DISPO_STAGES,
  DEAL_STAGE_LABELS,
  enrichDealForDisplay,
  getDealProfile,
  upsertDeal,
  findDealByGhlOpportunityId,
  findDealByLeadId,
  proofTotals,
  ensureFundedGoalConfig,
  computeFundedGoal,
  restartFundedGoal,
  resolveDealFundedAt,
  createDealFromVaultLead,
  patchDeal,
  pickDeskLocalFields,
  releaseDeal,
  applyCatalogStatusForDeal,
  healDealAddressFromLinkedLead,
  resolveLeadIdFromAddress,
  readContractsIndex,
  mergeGhlDocumentsOntoDeal,
  addDealDocument,
  getDealDocument,
  resolveLocalDocumentPath,
  removeDealDocument,
  saveSellerMediaFromUrl,
  saveSellerMediaFromBuffer,
  saveSellerMediaMany,
  removeSellerMedia,
  getDealMediaItem,
  resolveLocalMediaPath,
  buildSellerMediaZip,
  enrichSellerMediaForDisplay,
  normalizeSellerMediaList,
  fetchSellerMediaBytes,
  markBuyerFound,
  requestAocSend,
  requestJvSend,
  requestAmendmentSend,
  requestDocumentSend,
  syncSignedSignNowDocuments,
  syncPendingSignNowAcrossDeals,
  pushSignNowPending,
  setSignNowPending,
  setOriginalAgreementDateFromPsa,
  resolveAmendmentDefaults,
  addTeamMessage,
  markTeamMessagesRead,
  listUnreadTeamForUser,
  toggleTeamMessageReaction,
  TEAM_REACTION_KEYS,
  TEAM_REACTION_EMOJI,
  fireDealTransitionAlerts,
  isDeskReady,
  normalizeTeamMessages,
  normalizeSellerSms,
  isSellerSmsUnreadForUser,
  listUnreadSellerSmsForUser,
  markSellerSmsSeen,
  recordSellerSmsFromMessages,
  clearSellerSmsUnreadIfDeskReplied,
  peekSellerSmsForOpenDeals,
  findLatestInboundMessage,
  findLatestOutboundMessage,
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
  rehabInfoFilled,
  normalizeConditionScan,
  normalizePhotographerScheduleSafe
};
