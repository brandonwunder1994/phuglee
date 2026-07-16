const { readPhugleeUser, readPhugleePlan } = require('../phuglee-user');
const {
  ADMIN_USERNAME,
  isAdminUsername,
  isDisposUsername,
  isContractDeskUsername,
  hasVaultAccess
} = require('../phuglee-roles');
const {
  queryLeads,
  queryMapMarkers,
  getLead,
  getMeta,
  getLeadsByIds,
  upsertLead,
  upsertLeadsBatch,
  readIndex,
  collectMatchingLeadIds
} = require('./store');
const { readOverlays, toggleFavorite, bulkSetFavorites, upsertNote, upsertDisposition, savePresets } = require('./user-overlays');
const { publishLead, publishBatch } = require('./publish');
const { ensureAnalyzerSync, scheduleBackgroundSync, getLastSyncStats } = require('./analyzer-sync');
const { normalizeLeadRecord, validateLeadRecord } = require('./schema');
const { computePriorityScore, explainPriorityScore } = require('./scoring');
const { mergeEnrichmentIntoLead, matchKey } = require('./csv-enrich');
const {
  listDeals,
  listDealsEnriched,
  filterDealsForBoard,
  projectDealForViewer,
  assertBradCanWriteDeal,
  isSalesStage,
  getDeal,
  getDealProfile,
  proofTotals,
  computeFundedGoal,
  restartFundedGoal,
  createDealFromVaultLead,
  patchDeal,
  releaseDeal,
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
  fetchSellerMediaBytes,
  enrichDealForDisplay,
  markBuyerFound,
  requestAocSend,
  requestAocReminder,
  requestJvSend,
  requestAmendmentSend,
  requestDocumentSend,
  syncSignedSignNowDocuments,
  syncPendingSignNowAcrossDeals,
  setOriginalAgreementDateFromPsa,
  addTeamMessage,
  markTeamMessagesRead,
  listUnreadTeamForUser,
  fireDealTransitionAlerts,
  toggleTeamMessageReaction,
  listUnreadSellerSmsForUser,
  markSellerSmsSeen,
  recordSellerSmsFromMessages,
  peekSellerSmsForOpenDeals
} = require('./contracts');
const photographer = require('./photographer');
const mediaVision = require('./media-vision');
const { synthesizeConditionScan, applyLineVoid, loadCostBook } = require('./rehab-cost-engine');
const { isSignNowConfigured } = require('./signnow-client');
const teamNotify = require('./team-notify');
const { normalizeTeamUser } = require('./team-contacts');
const {
  isConfigured: isGhlConfigured,
  getContact,
  summarizeContactMoney,
  searchConversationsByContact,
  listAllConversationMessages,
  isHumanSmsMessage,
  messageHasAttachments,
  smsPreviewText,
  parseGhlTimestamp,
  resolveLastOutboundFromNumber,
  resolveContactToNumber,
  sendSms,
  listLocationPhoneNumbers,
  extractContactDocuments,
  fetchGhlDocumentBytes
} = require('./ghl-client');
const { syncContractsFromGhl } = require('./ghl-contract-sync');
const { readPayoutSettings, writePayoutSettings } = require('./payout-settings');
const config = require('../config');
const { runAutoComp } = require('./comping/run-comp');
const { buildManualCompReport } = require('./comping/manual-comp');
const { createReapiClient } = require('./comping/reapi-client');
const { isNonDisclosureState } = require('./comping/nd-states');
const { saveCompReportFile, readCompReportFile } = require('./comping/report-files');
const fs = require('fs');

const MAX_EXPORT_ROWS = 500;
const MAX_EXPORTS_PER_DAY = 5;

const exportCounts = new Map();

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

async function readBody(req, opts = {}) {
  const maxBytes = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : 2_000_000;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error(`Request body too large (max ${Math.round(maxBytes / 1_000_000)}MB)`);
      err.code = 'PAYLOAD_TOO_LARGE';
      err.maxBytes = maxBytes;
      throw err;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function isMaxAccess(req) {
  return hasVaultAccess(readPhugleeUser(req), readPhugleePlan(req));
}

function isAdmin(req) {
  return isAdminUsername(readPhugleeUser(req));
}

function isContractDesk(req) {
  return isContractDeskUsername(readPhugleeUser(req));
}

function requireAuth(req, res) {
  const user = readPhugleeUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return null;
  }
  return user;
}

function requireMax(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!isMaxAccess(req)) {
    sendJson(res, 403, { ok: false, error: 'Max plan required', code: 'PLAN_REQUIRED' });
    return null;
  }
  return user;
}

function requireContractDesk(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!isContractDesk(req)) {
    sendJson(res, 403, { ok: false, error: 'Contract desk access required', code: 'FORBIDDEN' });
    return null;
  }
  return user;
}

/** Brad may not open sales-stage deal dossiers (address+photo glance only on pipeline board). */
function denyBradSalesRead(req, res, deal) {
  const user = readPhugleeUser(req);
  if (!isDisposUsername(user)) return false;
  if (!deal || !isSalesStage(deal.stage)) return false;
  sendJson(res, 403, {
    ok: false,
    error: 'Sales-stage deals are view-only (address and photo) for disposition',
    code: 'FORBIDDEN_SALES_STAGE'
  });
  return true;
}

function denyBradSalesWrite(req, res, dealId) {
  const user = readPhugleeUser(req);
  if (!isDisposUsername(user)) return false;
  const deal = getDeal(dealId);
  if (!deal) {
    sendJson(res, 404, { ok: false, error: 'Deal not found', code: 'NOT_FOUND' });
    return true;
  }
  try {
    assertBradCanWriteDeal(deal, user);
  } catch (err) {
    sendJson(res, 403, { ok: false, error: err.message, code: err.code || 'FORBIDDEN' });
    return true;
  }
  return false;
}

function parseListQuery(url) {
  const signals = url.searchParams.getAll('signal');
  const sincePreset = url.searchParams.get('since');
  let since = url.searchParams.get('sinceDate') || null;
  if (!since && sincePreset) {
    const days = { '7d': 7, '30d': 30, '90d': 90 }[sincePreset];
    if (days) since = new Date(Date.now() - days * 86400000).toISOString();
  }
  return normalizeListQuery({
    leadType: url.searchParams.get('leadType') || 'all',
    state: url.searchParams.get('state') || '',
    city: url.searchParams.get('city') || '',
    minScore: url.searchParams.get('minScore'),
    maxScore: url.searchParams.get('maxScore'),
    q: url.searchParams.get('q') || '',
    page: url.searchParams.get('page') || '1',
    limit: url.searchParams.get('limit') || '50',
    sort: url.searchParams.get('sort') || 'priorityScore',
    sortDir: url.searchParams.get('sortDir') || 'desc',
    signals,
    since,
    sincePreset: sincePreset || '',
    favoritesOnly: url.searchParams.get('favoritesOnly') === '1',
    hasPhone: url.searchParams.get('hasPhone') === '1',
    hasImagery: url.searchParams.get('hasImagery') === '1',
    includeHidden: url.searchParams.get('includeHidden') === '1',
    originLat: url.searchParams.get('originLat') || null,
    originLng: url.searchParams.get('originLng') || null,
    radiusMiles: url.searchParams.get('radiusMiles') || null,
    entityType: url.searchParams.get('entityType') || '',
    minEquity: url.searchParams.get('minEquity') || null
  });
}

function normalizeListQuery(raw = {}) {
  const signals = Array.isArray(raw.signals)
    ? raw.signals.map(String).filter(Boolean)
    : [];

  let since = null;
  const sinceRaw = raw.sinceDate || raw.since || raw.sincePreset || '';
  if (['7d', '30d', '90d'].includes(String(sinceRaw))) {
    const days = { '7d': 7, '30d': 30, '90d': 90 }[String(sinceRaw)];
    since = new Date(Date.now() - days * 86400000).toISOString();
  } else if (sinceRaw && !Number.isNaN(Date.parse(sinceRaw))) {
    since = new Date(sinceRaw).toISOString();
  }

  return {
    leadType: raw.leadType || 'all',
    state: raw.state || '',
    city: raw.city || '',
    minScore: raw.minScore != null && raw.minScore !== '' ? raw.minScore : null,
    maxScore: raw.maxScore != null && raw.maxScore !== '' ? raw.maxScore : null,
    q: raw.q || '',
    page: raw.page || '1',
    limit: raw.limit || '50',
    sort: raw.sort || 'priorityScore',
    sortDir: raw.sortDir || 'desc',
    signals,
    since,
    favoritesOnly: raw.favoritesOnly === true || raw.favoritesOnly === '1' || raw.favoritesOnly === 1,
    hasPhone: raw.hasPhone === true || raw.hasPhone === '1' || raw.hasPhone === 1,
    hasImagery: raw.hasImagery === true || raw.hasImagery === '1' || raw.hasImagery === 1,
    includeHidden: raw.includeHidden === true || raw.includeHidden === '1' || raw.includeHidden === 1,
    originLat: raw.originLat != null && raw.originLat !== '' ? raw.originLat : null,
    originLng: raw.originLng != null && raw.originLng !== '' ? raw.originLng : null,
    radiusMiles: raw.radiusMiles != null && raw.radiusMiles !== '' ? raw.radiusMiles : null,
    entityType: raw.entityType || '',
    minEquity: raw.minEquity != null && raw.minEquity !== '' ? raw.minEquity : null
  };
}

function buildListResponse(user, query, req) {
  const overlays = readOverlays(user);
  if (query.favoritesOnly) query.favoriteIds = new Set(overlays.favorites);
  // Only admin may include hidden (under contract / sold) leads in Vault list
  if (query.includeHidden && !isAdmin(req)) query.includeHidden = false;
  if (!isAdmin(req)) query.includeHidden = false;
  const result = queryLeads(query);
  result.leads = result.leads.map((row) => ({
    ...row,
    favorite: overlays.favorites.includes(row.leadId)
  }));
  return result;
}

function syncMetaPayload() {
  const sync = getLastSyncStats();
  return sync ? {
    lastSyncAt: sync.lastSyncAt,
    published: sync.published,
    eligible: sync.eligible,
    scanned: sync.scanned
  } : null;
}

function leadExportRow(l) {
  const phones = Array.isArray(l.phones) ? l.phones : [];
  const signals = Array.isArray(l.signalTags) ? l.signalTags.join('; ') : '';
  return {
    Address: l.address || '',
    City: l.city || '',
    State: l.state || '',
    Zip: l.zip || '',
    'Lead Type': l.leadType || '',
    Score: l.priorityScore ?? '',
    'Distress Tier': l.distressTier ?? '',
    Signals: signals,
    'Top Signal': (l.signalTags && l.signalTags[0]) || '',
    Owner: l.ownerName || '',
    Entity: l.entityType || '',
    Phone: phones[0] || '',
    'Phone 2': phones[1] || '',
    'Phone 3': phones[2] || '',
    Email: l.email || '',
    'Mailing Address': l.mailingAddress || '',
    ARV: l.estARV ?? '',
    Equity: l.estEquity ?? '',
    Repairs: l.estRepairs ?? '',
    Parcel: l.parcel || '',
    Lat: l.lat ?? '',
    Lng: l.lng ?? '',
    'Source City': l.sourceCity || '',
    'Street View': l.streetViewUrl || (Array.isArray(l.photos) && l.photos[0]) || '',
    Published: l.publishedAt || ''
  };
}

function leadsToCsv(leads = []) {
  const rows = (leads || []).map(leadExportRow);
  const headers = rows.length
    ? Object.keys(rows[0])
    : Object.keys(leadExportRow({}));
  const escape = (v) => {
    const text = String(v ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))
  ];
  return `${lines.join('\n')}\n`;
}

function leadsToXlsxBase64(leads = []) {
  const XLSX = require('xlsx');
  const rows = (leads || []).map(leadExportRow);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [leadExportRow({})]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Vault');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer).toString('base64');
}

function slugFilenamePart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function buildExportFilename({ format = 'xlsx', filters = {}, label = '' } = {}) {
  const stamp = new Date().toISOString().slice(0, 10);
  const parts = ['vault'];
  const labelSlug = slugFilenamePart(label);
  if (labelSlug) parts.push(labelSlug);
  else {
    if (filters.state) parts.push(slugFilenamePart(filters.state));
    if (filters.city) parts.push(slugFilenamePart(filters.city));
    if (filters.leadType && filters.leadType !== 'all') {
      const typeSlug = filters.leadType === 'well_maintained' ? 'code' : slugFilenamePart(filters.leadType);
      if (typeSlug) parts.push(typeSlug);
    }
    if (filters.hasPhone) parts.push('phone');
    if (filters.entityType) parts.push(slugFilenamePart(filters.entityType));
  }
  parts.push(stamp);
  const ext = format === 'csv' ? 'csv' : 'xlsx';
  return `${parts.filter(Boolean).join('-')}.${ext}`;
}

function exportRateKey(user) {
  const day = new Date().toISOString().slice(0, 10);
  return `${user}:${day}`;
}

function createReapiClientFromConfig() {
  const apiKey = config.REALESTATE_API_KEY;
  if (!apiKey) return null;
  return createReapiClient({
    apiKey,
    baseUrl: config.REALESTATE_API_BASE
  });
}

function mergeCompOntoLead(lead, leadPatch) {
  const merged = { ...lead, ...leadPatch };
  merged.priorityScore = computePriorityScore(merged);
  return upsertLead(merged);
}

function compSummaryFromLead(lead) {
  return {
    compingReport: lead.compingReport || null,
    compReportFiles: Array.isArray(lead.compReportFiles) ? lead.compReportFiles : [],
    compedAt: lead.compedAt || null,
    estARV: lead.estARV ?? null,
    compConfidence: lead.compConfidence || null,
    compSource: lead.compSource || null,
    comps: Array.isArray(lead.comps) ? lead.comps : [],
    compBlockPass: lead.compBlockPass || null
  };
}

async function readRawBody(req, opts = {}) {
  const maxBytes = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : 26 * 1024 * 1024;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error(`Request body too large (max ${Math.round(maxBytes / 1_000_000)}MB)`);
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function checkExportLimit(user) {
  const key = exportRateKey(user);
  const count = exportCounts.get(key) || 0;
  if (count >= MAX_EXPORTS_PER_DAY) {
    const err = new Error('Daily export limit reached');
    err.code = 'EXPORT_LIMIT';
    throw err;
  }
  exportCounts.set(key, count + 1);
}

async function handle(req, res, pathname, url) {
  if (!pathname.startsWith('/api/leads')) return false;

  // —— Public photographer upload (token auth, no desk login) ——
  const publicUploadMatch = /^\/api\/leads\/public\/photo-upload\/([a-zA-Z0-9]+)$/.exec(pathname);
  if (publicUploadMatch && req.method === 'GET') {
    try {
      const meta = photographer.publicUploadMeta(publicUploadMatch[1]);
      sendJson(res, 200, meta);
    } catch (err) {
      const status = err.code === 'INVALID_TOKEN' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  if (publicUploadMatch && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (body === null) {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
        return true;
      }
      const found = photographer.findDealByUploadToken(publicUploadMatch[1]);
      if (!found) {
        sendJson(res, 404, { ok: false, error: 'Upload link invalid or expired', code: 'INVALID_TOKEN' });
        return true;
      }
      if (found.schedule.doneAt) {
        sendJson(res, 409, { ok: false, error: 'Upload already marked done', code: 'ALREADY_DONE' });
        return true;
      }
      const files = Array.isArray(body.files) ? body.files
        : (body.contentBase64 ? [body] : []);
      if (!files.length) {
        sendJson(res, 400, { ok: false, error: 'Provide files[] or contentBase64', code: 'MISSING_MEDIA' });
        return true;
      }
      const results = [];
      for (const f of files.slice(0, 40)) {
        try {
          const out = saveSellerMediaFromBuffer(found.deal.dealId, {
            contentBase64: f.contentBase64 || f.base64,
            mimeType: f.mimeType || f.type || 'image/jpeg',
            name: f.name || `photographer-${Date.now()}`,
            uploadSource: 'photographer'
          });
          results.push({ ok: true, item: out.item });
        } catch (err) {
          results.push({ ok: false, error: err.message, code: err.code || 'ERROR' });
        }
      }
      const deal = getDeal(found.deal.dealId);
      sendJson(res, 200, {
        ok: true,
        saved: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
        mediaCount: enrichSellerMediaForDisplay(deal).length
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const publicDoneMatch = /^\/api\/leads\/public\/photo-upload\/([a-zA-Z0-9]+)\/done$/.exec(pathname);
  if (publicDoneMatch && req.method === 'POST') {
    try {
      const out = await photographer.markPhotographerDone(publicDoneMatch[1]);
      sendJson(res, 200, out);
    } catch (err) {
      const status = err.code === 'INVALID_TOKEN' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const isReadRoute = (pathname === '/api/leads' && req.method === 'GET')
    || (pathname === '/api/leads/meta' && req.method === 'GET')
    || (pathname === '/api/leads/bootstrap' && req.method === 'GET')
    || (pathname === '/api/leads/map' && req.method === 'GET')
    || (pathname === '/api/leads/geocode' && req.method === 'GET');

  if (isReadRoute) {
    scheduleBackgroundSync();
  }

  if (pathname === '/api/leads/sync' && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    const stats = await ensureAnalyzerSync({ force: true });
    sendJson(res, 200, { ok: true, sync: stats });
    return true;
  }

  if (pathname === '/api/leads/publish-from-analyzer' && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
      return true;
    }
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
      return true;
    }
    const result = body?.result;
    if (!result || typeof result !== 'object') {
      sendJson(res, 400, { ok: false, error: 'result object required' });
      return true;
    }
    // Manual Keep/Change is the gate — stamp as reviewed so Vault eligibility passes.
    const stamped = {
      ...result,
      manuallyReviewed: true,
      manuallyReviewedAt: result.manuallyReviewedAt || Date.now(),
      manuallyReviewedVia: result.manuallyReviewedVia || 'review_keep',
      reviewResolved: true,
      needsReviewLater: false
    };
    const { publishAnalyzerResult } = require('./analyzer-sync');
    let out;
    try {
      out = publishAnalyzerResult(stamped, {
        storageKey: body.storageKey || 'admin',
        forceApprove: true
      });
    } catch (err) {
      sendJson(res, 422, {
        ok: false,
        published: false,
        error: err.message || 'publish_failed',
        code: err.code || 'PUBLISH_FAILED'
      });
      return true;
    }
    sendJson(res, out.published ? 200 : 422, { ok: !!out.published, ...out });
    return true;
  }

  if (pathname === '/api/leads/bootstrap' && req.method === 'GET') {
    const user = requireMax(req, res);
    if (!user) return true;
    const query = parseListQuery(url);
    sendJson(res, 200, {
      ok: true,
      meta: getMeta(),
      sync: syncMetaPayload(),
      overlays: readOverlays(user),
      ...buildListResponse(user, query, req)
    });
    return true;
  }

  if (pathname === '/api/leads/meta' && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    sendJson(res, 200, {
      ok: true,
      meta: getMeta(),
      sync: syncMetaPayload()
    });
    return true;
  }

  if (pathname === '/api/leads' && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    const user = readPhugleeUser(req);
    const query = parseListQuery(url);
    sendJson(res, 200, { ok: true, ...buildListResponse(user, query, req) });
    return true;
  }

  if (pathname === '/api/leads/map' && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    const user = readPhugleeUser(req);
    const query = parseListQuery(url);
    const overlays = readOverlays(user);
    if (query.favoritesOnly) query.favoriteIds = new Set(overlays.favorites);
    if (query.includeHidden && !isAdmin(req)) query.includeHidden = false;
    if (!isAdmin(req)) query.includeHidden = false;
    const result = queryMapMarkers(query);
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (pathname === '/api/leads/geocode' && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    const q = String(url.searchParams.get('q') || '').trim();
    if (q.length < 3) {
      sendJson(res, 400, { ok: false, error: 'Enter an address (3+ characters)', code: 'BAD_QUERY' });
      return true;
    }
    try {
      const endpoint = new URL('https://nominatim.openstreetmap.org/search');
      endpoint.searchParams.set('q', q);
      endpoint.searchParams.set('format', 'json');
      endpoint.searchParams.set('limit', '1');
      const resp = await fetch(endpoint.toString(), {
        headers: {
          'User-Agent': 'PhugleeVault/1.0 (local; distress-os)',
          Accept: 'application/json'
        }
      });
      if (!resp.ok) {
        sendJson(res, 502, { ok: false, error: 'Geocoder unavailable', code: 'GEOCODE_UPSTREAM' });
        return true;
      }
      const rows = await resp.json();
      const hit = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!hit) {
        sendJson(res, 404, { ok: false, error: 'Address not found', code: 'GEOCODE_NOT_FOUND' });
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        label: hit.display_name || q
      });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message || 'Geocode failed', code: 'GEOCODE_FAILED' });
    }
    return true;
  }

  // ── Admin Under Contract (proof) desk ──────────────────────────────────
  if (pathname === '/api/leads/admin/contracts/team-inbox' && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    const user = readPhugleeUser(req);
    const teamUser = normalizeTeamUser(user) || (isAdmin(req) ? 'admin' : 'brad');
    sendJson(res, 200, {
      ok: true,
      unreadTeam: listUnreadTeamForUser(teamUser)
    });
    return true;
  }

  if (pathname === '/api/leads/admin/contracts' && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    const user = readPhugleeUser(req);
    const teamUser = normalizeTeamUser(user) || (isAdmin(req) ? 'admin' : 'brad');
    const board = String(new URL(req.url, 'http://localhost').searchParams.get('board') || 'contracts')
      .trim()
      .toLowerCase() === 'pipeline'
      ? 'pipeline'
      : 'contracts';
    // Throttled GHL peek — never fail the board if peek errors
    try {
      await peekSellerSmsForOpenDeals();
    } catch (err) {
      console.warn('[seller-sms] peek on list failed:', err.message);
    }
    // Auto-import fully signed SignNow packages into deal documents
    try {
      await syncPendingSignNowAcrossDeals();
    } catch (err) {
      console.warn('[signnow] board auto-sync failed:', err.message);
    }
    const rawDeals = filterDealsForBoard(listDeals(), board);
    const deals = rawDeals.map((d) => projectDealForViewer(d, teamUser));
    sendJson(res, 200, {
      ok: true,
      board,
      deals,
      totals: proofTotals(board === 'pipeline' ? listDeals() : rawDeals),
      goal: computeFundedGoal(listDeals()),
      ghlConfigured: isGhlConfigured(),
      payoutSettings: readPayoutSettings(),
      unreadTeam: listUnreadTeamForUser(teamUser),
      unreadSellerSms: listUnreadSellerSmsForUser(teamUser)
    });
    return true;
  }

  if (pathname === '/api/leads/admin/contracts/funded-goal/restart' && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    const body = await readBody(req);
    const config = restartFundedGoal(body && typeof body === 'object' ? body : {});
    sendJson(res, 200, {
      ok: true,
      goal: computeFundedGoal(listDeals()),
      config
    });
    return true;
  }

  if (pathname === '/api/leads/admin/contracts/payout-settings' && req.method === 'GET') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    sendJson(res, 200, { ok: true, settings: readPayoutSettings() });
    return true;
  }

  if (pathname === '/api/leads/admin/contracts/payout-settings' && req.method === 'PUT') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const settings = writePayoutSettings(body || {});
      sendJson(res, 200, {
        ok: true,
        settings,
        totals: proofTotals(listDeals()),
        deals: listDealsEnriched()
      });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  if (pathname === '/api/leads/admin/contracts/from-vault' && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const leadId = String(body.leadId || '').trim();
    if (!leadId) {
      sendJson(res, 400, { ok: false, error: 'leadId required', code: 'MISSING_LEAD' });
      return true;
    }
    try {
      const deal = createDealFromVaultLead(leadId, body);
      sendJson(res, 200, { ok: true, deal });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  if (pathname === '/api/leads/admin/contracts/sync-ghl' && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    try {
      const stats = await syncContractsFromGhl();
      sendJson(res, 200, {
        ok: true,
        sync: stats,
        deals: listDealsEnriched(),
        totals: proofTotals(),
        unreadTeam: listUnreadTeamForUser(normalizeTeamUser(readPhugleeUser(req)) || 'admin')
      });
    } catch (err) {
      const status = err.code === 'GHL_NOT_CONFIGURED' ? 503 : 502;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'GHL_SYNC_FAILED' });
    }
    return true;
  }

  const messagesMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/messages$/.exec(pathname);
  if (messagesMatch && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    try {
      const profile = getDealProfile(messagesMatch[1]);
      if (!profile) {
        sendJson(res, 404, { ok: false, error: 'Deal not found', code: 'NOT_FOUND' });
        return true;
      }
      if (!profile.ghlContactId) {
        sendJson(res, 200, {
          ok: true,
          messages: [],
          fromNumber: profile.lastFromNumber || null,
          toNumber: profile.phone || null,
          conversationId: null,
          warning: 'No GHL contact linked'
        });
        return true;
      }
      if (!isGhlConfigured()) {
        sendJson(res, 503, { ok: false, error: 'GHL not configured', code: 'GHL_NOT_CONFIGURED' });
        return true;
      }
      const conversations = await searchConversationsByContact(profile.ghlContactId);
      const conv = conversations[0] || null;
      let messages = [];
      if (conv?.id) {
        messages = await listAllConversationMessages(conv.id);
      }
      const human = messages.filter(isHumanSmsMessage).map((m) => ({
        id: m.id,
        body: smsPreviewText(m),
        direction: String(m.direction || '').toLowerCase(),
        dateAdded: parseGhlTimestamp(m.dateAdded) || m.dateAdded || null,
        messageType: m.messageType || m.type || '',
        from: m.from || m.fromNumber || null,
        to: m.to || m.toNumber || null,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        hasAttachments: messageHasAttachments(m)
      }));
      let fromNumber = resolveLastOutboundFromNumber(messages) || profile.lastFromNumber || null;
      if (!fromNumber) {
        const nums = await listLocationPhoneNumbers();
        const first = nums[0];
        fromNumber = first?.phoneNumber || first?.number || first?.phone || null;
      }
      const contact = await getContact(profile.ghlContactId).catch(() => null);
      const toNumber = resolveContactToNumber(contact, messages) || profile.phone || null;
      if (fromNumber || conv?.id) {
        patchDeal(profile.dealId, {
          lastFromNumber: fromNumber || profile.lastFromNumber,
          conversationId: conv?.id || profile.conversationId,
          phone: toNumber || profile.phone
        });
      }
      try {
        recordSellerSmsFromMessages(profile.dealId, human);
      } catch (err) {
        console.warn('[seller-sms] record inbound failed:', err.message);
      }
      // Do not mark seen on open/poll — unread clears only via /messages/seen or a sent reply.
      const deskUser = normalizeTeamUser(readPhugleeUser(req)) || (isAdmin(req) ? 'admin' : 'brad');
      sendJson(res, 200, {
        ok: true,
        messages: human,
        fromNumber,
        toNumber,
        conversationId: conv?.id || null,
        deal: enrichDealForDisplay(getDeal(profile.dealId), { username: deskUser }),
        unreadSellerSms: listUnreadSellerSmsForUser(deskUser)
      });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message, code: err.code || 'GHL_MESSAGES_FAILED' });
    }
    return true;
  }

  const messagesSeenMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/messages\/seen$/.exec(pathname);
  if (messagesSeenMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    try {
      const teamUser = normalizeTeamUser(user) || (isAdminUsername(user) ? 'admin' : 'brad');
      const deal = markSellerSmsSeen(messagesSeenMatch[1], teamUser);
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(deal, { username: teamUser }),
        unreadSellerSms: listUnreadSellerSmsForUser(teamUser)
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  if (messagesMatch && req.method === 'POST') {
    if (!requireContractDesk(req, res)) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const text = String(body.message || body.body || '').trim();
    if (!text) {
      sendJson(res, 400, { ok: false, error: 'message required', code: 'MISSING_MESSAGE' });
      return true;
    }
    try {
      const profile = getDealProfile(messagesMatch[1]);
      if (!profile?.ghlContactId) {
        sendJson(res, 400, { ok: false, error: 'Deal has no GHL contact', code: 'NO_GHL_CONTACT' });
        return true;
      }
      if (!isGhlConfigured()) {
        sendJson(res, 503, { ok: false, error: 'GHL not configured', code: 'GHL_NOT_CONFIGURED' });
        return true;
      }
      let fromNumber = String(body.fromNumber || profile.lastFromNumber || '').trim() || null;
      let toNumber = String(body.toNumber || profile.phone || '').trim() || null;
      if (!fromNumber || !toNumber) {
        const conversations = await searchConversationsByContact(profile.ghlContactId);
        const conv = conversations[0];
        const messages = conv?.id ? await listAllConversationMessages(conv.id) : [];
        fromNumber = fromNumber || resolveLastOutboundFromNumber(messages);
        if (!fromNumber) {
          const nums = await listLocationPhoneNumbers();
          fromNumber = nums[0]?.phoneNumber || nums[0]?.number || nums[0]?.phone || null;
        }
        const contact = await getContact(profile.ghlContactId).catch(() => null);
        toNumber = toNumber || resolveContactToNumber(contact, messages);
      }
      if (!fromNumber || !toNumber) {
        sendJson(res, 422, {
          ok: false,
          error: 'Could not resolve fromNumber/toNumber for SMS thread',
          code: 'SMS_NUMBERS_MISSING',
          fromNumber,
          toNumber
        });
        return true;
      }
      const sent = await sendSms({
        contactId: profile.ghlContactId,
        message: text,
        fromNumber,
        toNumber
      });
      patchDeal(profile.dealId, { lastFromNumber: fromNumber, phone: toNumber });
      const deskUser = normalizeTeamUser(readPhugleeUser(req)) || (isAdmin(req) ? 'admin' : 'brad');
      let deal = null;
      try {
        deal = markSellerSmsSeen(profile.dealId, deskUser);
      } catch (_) { /* ignore */ }
      sendJson(res, 200, {
        ok: true,
        sent,
        fromNumber,
        toNumber,
        messageId: sent.messageId || sent.id || null,
        conversationId: sent.conversationId || null,
        deal: enrichDealForDisplay(deal || getDeal(profile.dealId), { username: deskUser }),
        unreadSellerSms: listUnreadSellerSmsForUser(deskUser)
      });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message, code: err.code || 'GHL_SEND_FAILED' });
    }
    return true;
  }

  const dealGetMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (dealGetMatch && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    let profile = getDealProfile(dealGetMatch[1]);
    if (!profile) {
      sendJson(res, 404, { ok: false, error: 'Deal not found', code: 'NOT_FOUND' });
      return true;
    }
    if (denyBradSalesRead(req, res, profile)) return true;
    let contact = null;
    if (profile.ghlContactId && isGhlConfigured()) {
      try {
        const rawContact = await getContact(profile.ghlContactId);
        contact = summarizeContactMoney(rawContact);
        const ghlDocs = extractContactDocuments(rawContact);
        if (ghlDocs.length) {
          mergeGhlDocumentsOntoDeal(profile.dealId, ghlDocs);
          profile = getDealProfile(profile.dealId) || profile;
        }
        // Persist PSA signed date from GHL when we have it
        if (contact?.contractSignedDate && !profile.originalAgreementDate) {
          try {
            setOriginalAgreementDateFromPsa(profile.dealId, contact.contractSignedDate);
            profile = getDealProfile(profile.dealId) || profile;
          } catch (_) { /* optional */ }
        }
      } catch (_) { /* optional */ }
    }
    if ((profile.signNowPending || []).length && isSignNowConfigured()) {
      try {
        const sn = await syncSignedSignNowDocuments(profile.dealId);
        if (sn.ingested || (sn.added && sn.added.length)) {
          profile = getDealProfile(profile.dealId) || sn.deal || profile;
        } else {
          profile = getDealProfile(profile.dealId) || sn.deal || profile;
        }
      } catch (_) { /* optional */ }
    }
    const deskUser = normalizeTeamUser(readPhugleeUser(req)) || (isAdmin(req) ? 'admin' : 'brad');
    const deal = enrichDealForDisplay(getDeal(profile.dealId) || profile, { username: deskUser });
    sendJson(res, 200, { ok: true, deal, contact });
    return true;
  }

  const docsListMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/documents$/.exec(pathname);
  if (docsListMatch && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    let profile = getDealProfile(docsListMatch[1]);
    if (!profile) {
      sendJson(res, 404, { ok: false, error: 'Deal not found', code: 'NOT_FOUND' });
      return true;
    }
    if ((profile.signNowPending || []).length && isSignNowConfigured()) {
      try {
        const sn = await syncSignedSignNowDocuments(profile.dealId);
        profile = getDealProfile(profile.dealId) || sn.deal || profile;
      } catch (_) { /* optional */ }
    }
    if (profile.ghlContactId && isGhlConfigured()) {
      try {
        const ghlDocs = extractContactDocuments(await getContact(profile.ghlContactId));
        if (ghlDocs.length) {
          mergeGhlDocumentsOntoDeal(profile.dealId, ghlDocs);
          profile = getDealProfile(profile.dealId) || profile;
        }
      } catch (_) { /* optional */ }
    }
    sendJson(res, 200, { ok: true, documents: profile.documents || [] });
    return true;
  }

  if (docsListMatch && req.method === 'POST') {
    if (!requireContractDesk(req, res)) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const { deal, document } = addDealDocument(docsListMatch[1], {
        kind: body.kind,
        name: body.name || body.fileName,
        mimeType: body.mimeType,
        url: body.url,
        originalUrl: body.originalUrl || body.url,
        contentBase64: body.contentBase64 || body.content,
        source: body.source
      });
      sendJson(res, 200, {
        ok: true,
        document: {
          ...document,
          viewUrl: `/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/documents/${encodeURIComponent(document.id)}`
        },
        deal: enrichDealForDisplay(deal)
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : (err.code === 'DOC_TOO_LARGE' || err.code === 'MISSING_DOC_BODY' || err.code === 'EMPTY_DOC' ? 400 : 500);
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const docFileMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/documents\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (docFileMatch && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    const found = getDealDocument(docFileMatch[1], docFileMatch[2]);
    if (!found) {
      sendJson(res, 404, { ok: false, error: 'Document not found', code: 'NOT_FOUND' });
      return true;
    }
    const { document: doc } = found;
    try {
      if (doc.source === 'local' || doc.localFile) {
        const full = resolveLocalDocumentPath(docFileMatch[1], doc);
        if (!full) {
          sendJson(res, 404, { ok: false, error: 'Local file missing', code: 'FILE_MISSING' });
          return true;
        }
        const buf = fs.readFileSync(full);
        res.writeHead(200, {
          'Content-Type': doc.mimeType || 'application/pdf',
          'Content-Length': buf.length,
          'Content-Disposition': `inline; filename="${String(doc.name || 'document.pdf').replace(/"/g, '')}"`,
          'Cache-Control': 'private, max-age=120'
        });
        res.end(buf);
        return true;
      }

      if (doc.source === 'url' && (doc.url || doc.originalUrl) && !doc.ghlDocumentId) {
        const target = doc.originalUrl || doc.url;
        const upstream = await fetch(target, { redirect: 'follow' });
        if (!upstream.ok) {
          sendJson(res, 502, { ok: false, error: `Upstream ${upstream.status}`, code: 'UPSTREAM_FAILED' });
          return true;
        }
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(200, {
          'Content-Type': upstream.headers.get('content-type') || doc.mimeType || 'application/pdf',
          'Content-Length': buf.length,
          'Content-Disposition': `inline; filename="${String(doc.name || 'document.pdf').replace(/"/g, '')}"`,
          'Cache-Control': 'private, max-age=120'
        });
        res.end(buf);
        return true;
      }

      const downloaded = await fetchGhlDocumentBytes({
        documentId: doc.ghlDocumentId,
        url: doc.url,
        originalUrl: doc.originalUrl
      });
      res.writeHead(200, {
        'Content-Type': downloaded.contentType || doc.mimeType || 'application/pdf',
        'Content-Length': downloaded.buffer.length,
        'Content-Disposition': `inline; filename="${String(doc.name || 'document.pdf').replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=120'
      });
      res.end(downloaded.buffer);
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message, code: err.code || 'DOC_FETCH_FAILED' });
    }
    return true;
  }

  if (docFileMatch && req.method === 'DELETE') {
    if (!requireContractDesk(req, res)) return true;
    try {
      const deal = removeDealDocument(docFileMatch[1], docFileMatch[2]);
      sendJson(res, 200, { ok: true, deal: enrichDealForDisplay(deal) });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const mediaProxyMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/media-proxy$/.exec(pathname);
  if (mediaProxyMatch && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    try {
      const url = String(new URL(req.url || '', 'http://localhost').searchParams.get('url') || '').trim();
      if (!url) {
        sendJson(res, 400, { ok: false, error: 'url required', code: 'MISSING_MEDIA_URL' });
        return true;
      }
      const downloaded = await fetchSellerMediaBytes(url);
      res.writeHead(200, {
        'Content-Type': downloaded.contentType || 'application/octet-stream',
        'Content-Length': downloaded.buffer.length,
        'Cache-Control': 'private, max-age=300'
      });
      res.end(downloaded.buffer);
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message, code: err.code || 'MEDIA_PROXY_FAILED' });
    }
    return true;
  }

  // Photographer schedule + rehab scan (desk)
  const photoSchedMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/photographer\/schedule$/.exec(pathname);
  if (photoSchedMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const out = await photographer.schedulePhotographer(photoSchedMatch[1], body, user);
      sendJson(res, 200, { ok: true, ...out });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : (err.code === 'MISSING_FIELDS' ? 400 : 500);
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const photoTokenMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/photographer\/upload-token$/.exec(pathname);
  if (photoTokenMatch && req.method === 'POST') {
    if (!requireContractDesk(req, res)) return true;
    try {
      const out = await photographer.regenerateUploadToken(photoTokenMatch[1]);
      sendJson(res, 200, { ok: true, ...out });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' || err.code === 'NOT_SCHEDULED' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const photoMsgMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/photographer\/messages$/.exec(pathname);
  if (photoMsgMatch && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    try {
      const deal = getDeal(photoMsgMatch[1]);
      if (!deal) {
        sendJson(res, 404, { ok: false, error: 'Deal not found', code: 'NOT_FOUND' });
        return true;
      }
      const sched = photographer.normalizePhotographerSchedule(deal.photographerSchedule);
      if (!sched?.ghlContactId || !isGhlConfigured()) {
        sendJson(res, 200, { ok: true, messages: [], warning: 'No photographer GHL thread yet' });
        return true;
      }
      const convos = await searchConversationsByContact(sched.ghlContactId);
      const convo = Array.isArray(convos) ? convos[0] : null;
      const convoId = convo?.id || convo?.conversationId || sched.conversationId;
      let messages = [];
      if (convoId) {
        messages = await listAllConversationMessages(convoId);
        messages = (messages || []).filter(isHumanSmsMessage);
      }
      sendJson(res, 200, {
        ok: true,
        messages,
        contactId: sched.ghlContactId,
        conversationId: convoId || null,
        photographerName: sched.photographerName,
        uploadUrl: sched.uploadUrl
      });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  if (photoMsgMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const deal = getDeal(photoMsgMatch[1]);
      if (!deal) {
        sendJson(res, 404, { ok: false, error: 'Deal not found', code: 'NOT_FOUND' });
        return true;
      }
      const sched = photographer.normalizePhotographerSchedule(deal.photographerSchedule);
      if (!sched?.ghlContactId) {
        sendJson(res, 400, { ok: false, error: 'Photographer not linked to GHL', code: 'NO_PHOTO_CONTACT' });
        return true;
      }
      const text = String(body.message || body.body || '').trim();
      if (!text) {
        sendJson(res, 400, { ok: false, error: 'message required', code: 'MISSING_BODY' });
        return true;
      }
      const nums = await listLocationPhoneNumbers().catch(() => []);
      const fromNumber = nums[0]?.phoneNumber || nums[0]?.number || undefined;
      await sendSms({
        contactId: sched.ghlContactId,
        message: text,
        fromNumber: fromNumber || undefined,
        toNumber: sched.photographerPhone || undefined
      });
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const rehabScanMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/rehab-scan$/.exec(pathname);
  if (rehabScanMatch && req.method === 'POST') {
    if (!requireContractDesk(req, res)) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const dealId = rehabScanMatch[1];
      const force = Boolean(body.force);
      const sync = Boolean(body.sync);
      if (sync) {
        const out = await mediaVision.labelDealMedia(dealId, { force, runScan: true });
        sendJson(res, 200, { ok: true, ...out });
      } else {
        const q = mediaVision.enqueueLabelDealMedia(dealId, { force, runScan: true });
        sendJson(res, 202, { ok: true, queued: q.queued, already: q.already });
      }
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 500;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const rehabVoidMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/rehab-scan\/lines\/([a-zA-Z0-9_-]+)\/void$/.exec(pathname);
  if (rehabVoidMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const deal = getDeal(rehabVoidMatch[1]);
      if (!deal?.conditionScan) {
        sendJson(res, 404, { ok: false, error: 'No condition scan', code: 'NO_SCAN' });
        return true;
      }
      const voided = body.voided !== false;
      const nextScan = applyLineVoid(deal.conditionScan, rehabVoidMatch[2], voided);
      const saved = patchDeal(rehabVoidMatch[1], { conditionScan: nextScan });
      sendJson(res, 200, {
        ok: true,
        conditionScan: saved.conditionScan,
        deal: enrichDealForDisplay(saved, { username: normalizeTeamUser(user) || 'admin' })
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const rehabOptsMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/rehab-scan\/options$/.exec(pathname);
  if (rehabOptsMatch && req.method === 'POST') {
    if (!requireContractDesk(req, res)) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const deal = getDeal(rehabOptsMatch[1]);
      if (!deal) {
        sendJson(res, 404, { ok: false, error: 'Deal not found', code: 'NOT_FOUND' });
        return true;
      }
      const mediaItems = enrichSellerMediaForDisplay(deal).map((m) => {
        const raw = (deal.sellerMedia || []).find((x) => x.id === m.id);
        return { ...m, aiLabel: raw?.aiLabel || m.aiLabel };
      });
      const scan = synthesizeConditionScan({
        deal,
        mediaItems,
        options: {
          finishGrade: body.finishGrade,
          contingencyPct: body.contingencyPct,
          livingSqft: body.livingSqft,
          metroId: body.metroId
        }
      });
      const saved = patchDeal(rehabOptsMatch[1], { conditionScan: scan });
      sendJson(res, 200, {
        ok: true,
        conditionScan: saved.conditionScan,
        costBook: { version: loadCostBook().version }
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const mediaZipMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/media\/zip$/.exec(pathname);
  if (mediaZipMatch && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    try {
      const { buffer, filename } = await buildSellerMediaZip(mediaZipMatch[1]);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': buffer.length,
        'Content-Disposition': `attachment; filename="${String(filename).replace(/"/g, '')}"`,
        'Cache-Control': 'no-store'
      });
      res.end(buffer);
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : (err.code === 'NO_MEDIA' || err.code === 'FILE_MISSING' ? 400 : 500);
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const mediaListMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/media$/.exec(pathname);
  if (mediaListMatch && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    const deal = getDeal(mediaListMatch[1]);
    if (!deal) {
      sendJson(res, 404, { ok: false, error: 'Deal not found', code: 'NOT_FOUND' });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      sellerMedia: enrichSellerMediaForDisplay(deal),
      mediaZipUrl: `/api/leads/admin/contracts/${encodeURIComponent(deal.dealId)}/media/zip`
    });
    return true;
  }

  if (mediaListMatch && req.method === 'POST') {
    if (!requireContractDesk(req, res)) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const items = Array.isArray(body.items) ? body.items
        : (body.url || body.sourceUrl || body.contentBase64 ? [body] : []);
      if (!items.length) {
        sendJson(res, 400, { ok: false, error: 'Provide url, contentBase64, or items[]', code: 'MISSING_MEDIA_URL' });
        return true;
      }
      const results = [];
      for (const raw of items) {
        try {
          if (raw.contentBase64 || raw.base64 || raw.buffer) {
            const one = saveSellerMediaFromBuffer(mediaListMatch[1], {
              ...raw,
              contentBase64: raw.contentBase64 || raw.base64,
              uploadSource: raw.uploadSource || 'desk'
            });
            results.push({ ok: true, skipped: false, item: one.item });
          } else {
            const one = await saveSellerMediaFromUrl(mediaListMatch[1], raw);
            results.push({
              ok: true,
              skipped: !!one.skipped,
              item: one.item,
              url: raw.url || raw.sourceUrl
            });
          }
        } catch (err) {
          results.push({
            ok: false,
            error: err.message,
            code: err.code || 'ERROR',
            url: raw.url || raw.sourceUrl || null
          });
        }
      }
      const deal = getDeal(mediaListMatch[1]);
      const out = {
        deal,
        sellerMedia: enrichSellerMediaForDisplay(deal),
        results,
        saved: results.filter((r) => r.ok && !r.skipped).length,
        skipped: results.filter((r) => r.ok && r.skipped).length,
        failed: results.filter((r) => !r.ok).length
      };
      const deskUser = normalizeTeamUser(readPhugleeUser(req)) || (isAdmin(req) ? 'admin' : 'brad');
      sendJson(res, 200, {
        ok: true,
        ...out,
        deal: enrichDealForDisplay(out.deal, { username: deskUser })
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : (err.code === 'MISSING_MEDIA_URL' || err.code === 'EMPTY_MEDIA' || err.code === 'MEDIA_TOO_LARGE' ? 400 : 502);
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const mediaFileMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/media\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (mediaFileMatch && req.method === 'GET') {
    if (!requireContractDesk(req, res)) return true;
    const found = getDealMediaItem(mediaFileMatch[1], mediaFileMatch[2]);
    if (!found) {
      sendJson(res, 404, { ok: false, error: 'Media not found', code: 'NOT_FOUND' });
      return true;
    }
    const full = resolveLocalMediaPath(mediaFileMatch[1], found.item);
    if (!full) {
      sendJson(res, 404, { ok: false, error: 'Media file missing', code: 'FILE_MISSING' });
      return true;
    }
    const buf = fs.readFileSync(full);
    const download = String(new URL(req.url || '', 'http://localhost').searchParams.get('download') || '') === '1';
    res.writeHead(200, {
      'Content-Type': found.item.mimeType || 'application/octet-stream',
      'Content-Length': buf.length,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${String(found.item.name || 'media').replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300'
    });
    res.end(buf);
    return true;
  }

  if (mediaFileMatch && req.method === 'DELETE') {
    if (!requireContractDesk(req, res)) return true;
    try {
      const deal = removeSellerMedia(mediaFileMatch[1], mediaFileMatch[2]);
      const deskUser = normalizeTeamUser(readPhugleeUser(req)) || (isAdmin(req) ? 'admin' : 'brad');
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(deal, { username: deskUser }),
        sellerMedia: enrichSellerMediaForDisplay(deal)
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const releaseMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/release$/.exec(pathname);
  if (releaseMatch && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    try {
      const out = releaseDeal(releaseMatch[1]);
      sendJson(res, 200, { ok: true, ...out });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const dealPatchMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  const buyerFoundMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/buyer-found$/.exec(pathname);
  if (buyerFoundMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    if (denyBradSalesWrite(req, res, buyerFoundMatch[1])) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const out = await markBuyerFound(buyerFoundMatch[1], body || {}, user);
      const buyerName = out.deal?.cashBuyerName
        || out.deal?.buyerAssignment?.buyerEntity
        || body.buyerEntity
        || body.buyerName;
      teamNotify.alertBuyerFound({ deal: out.deal, buyerName }).catch((err) => {
        console.warn('[team-notify] buyer found alert failed:', err.message);
      });
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(out.deal),
        aoc: out.aoc,
        signNowConfigured: isSignNowConfigured()
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'SIGNNOW_NOT_CONFIGURED' ? 503
          : err.code === 'SIGNNOW_API_ERROR' || err.code === 'SIGNNOW_SEND_FAILED' ? 502
            : 400;
      sendJson(res, status, {
        ok: false,
        error: err.message,
        code: err.code || 'ERROR',
        deal: err.deal ? enrichDealForDisplay(err.deal) : undefined
      });
    }
    return true;
  }

  const aocSendMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/send-aoc$/.exec(pathname);
  if (aocSendMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    if (denyBradSalesWrite(req, res, aocSendMatch[1])) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const out = await requestAocSend(aocSendMatch[1], body || {}, user);
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(out.deal),
        aoc: out.aoc,
        signNowConfigured: isSignNowConfigured()
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'SIGNNOW_NOT_CONFIGURED' ? 503
          : err.code === 'SIGNNOW_API_ERROR' || err.code === 'SIGNNOW_SEND_FAILED' ? 502
            : 400;
      sendJson(res, status, {
        ok: false,
        error: err.message,
        code: err.code || 'ERROR',
        deal: err.deal ? enrichDealForDisplay(err.deal) : undefined
      });
    }
    return true;
  }

  const aocRemindMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/remind-aoc$/.exec(pathname);
  if (aocRemindMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    if (denyBradSalesWrite(req, res, aocRemindMatch[1])) return true;
    try {
      const out = await requestAocReminder(aocRemindMatch[1], user);
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(out.deal),
        reminder: out.reminder,
        signNowConfigured: isSignNowConfigured()
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'AOC_NOT_SENT' ? 400
          : err.code === 'SIGNNOW_NOT_CONFIGURED' ? 503
            : err.code === 'SIGNNOW_API_ERROR' || err.code === 'SIGNNOW_REMIND_FAILED' ? 502
              : 400;
      sendJson(res, status, {
        ok: false,
        error: err.message,
        code: err.code || 'ERROR',
        deal: err.deal ? enrichDealForDisplay(err.deal) : undefined
      });
    }
    return true;
  }

  const jvSendMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/send-jv$/.exec(pathname);
  if (jvSendMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    if (denyBradSalesWrite(req, res, jvSendMatch[1])) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const out = await requestJvSend(jvSendMatch[1], body || {}, user);
      teamNotify.alertJvSent({
        deal: out.deal,
        awaiting: [
          'Brandon Wunder (Party A)',
          'Brad Lewis (Party B)'
        ]
      }).catch((err) => console.warn('[team-notify] JV alert failed:', err.message));
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(out.deal),
        jv: out.jv,
        signNowConfigured: isSignNowConfigured()
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'SIGNNOW_NOT_CONFIGURED' ? 503
          : err.code === 'SIGNNOW_API_ERROR' || err.code === 'SIGNNOW_SEND_FAILED' ? 502
            : 400;
      sendJson(res, status, {
        ok: false,
        error: err.message,
        code: err.code || 'ERROR',
        deal: err.deal ? enrichDealForDisplay(err.deal) : undefined
      });
    }
    return true;
  }

  const amendmentMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/send-amendment$/.exec(pathname);
  if (amendmentMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    if (denyBradSalesWrite(req, res, amendmentMatch[1])) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const out = await requestAmendmentSend(amendmentMatch[1], body || {}, user);
      const party = out.amendment?.partyType === 'end_buyer' ? 'End buyer' : 'Seller';
      teamNotify.alertAmendmentSent({
        deal: out.deal,
        awaiting: [
          'Wunderhaus Group LLC (Buyer)',
          `${party} (${body.sellerEmail || body.counterpartyEmail || 'counterparty'})`
        ]
      }).catch((err) => console.warn('[team-notify] amendment alert failed:', err.message));
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(out.deal),
        amendment: out.amendment,
        signNowConfigured: isSignNowConfigured()
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'SIGNNOW_NOT_CONFIGURED' ? 503
          : err.code === 'SIGNNOW_API_ERROR' || err.code === 'SIGNNOW_SEND_FAILED' ? 502
            : 400;
      sendJson(res, status, {
        ok: false,
        error: err.message,
        code: err.code || 'ERROR',
        deal: err.deal ? enrichDealForDisplay(err.deal) : undefined
      });
    }
    return true;
  }

  const sendDocMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/send-document$/.exec(pathname);
  if (sendDocMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const kind = String(body.kind || body.type || '').trim();
    if (!kind) {
      sendJson(res, 400, { ok: false, error: 'kind required', code: 'MISSING_KIND' });
      return true;
    }
    try {
      const out = await requestDocumentSend(sendDocMatch[1], kind, body || {}, user);
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(out.deal),
        result: out.aoc || out.jv || out.amendment || out,
        signNowConfigured: isSignNowConfigured()
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'SIGNNOW_NOT_CONFIGURED' ? 503
          : err.code === 'SIGNNOW_API_ERROR' || err.code === 'SIGNNOW_SEND_FAILED' ? 502
            : 400;
      sendJson(res, status, {
        ok: false,
        error: err.message,
        code: err.code || 'ERROR',
        deal: err.deal ? enrichDealForDisplay(err.deal) : undefined
      });
    }
    return true;
  }

  const syncSnMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/sync-signnow$/.exec(pathname);
  if (syncSnMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    try {
      const out = await syncSignedSignNowDocuments(syncSnMatch[1]);
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(out.deal),
        ingested: out.ingested,
        pending: out.pending,
        added: out.added || []
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'SIGNNOW_NOT_CONFIGURED' ? 503
          : 502;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  if (dealPatchMatch && (req.method === 'PATCH' || req.method === 'POST')) {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    if (denyBradSalesWrite(req, res, dealPatchMatch[1])) return true;
    // POST .../contracts/:id is only a save alias (some clients/proxies block PATCH).
    // Nested routes like /buyer-found are matched above and never reach here.
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const before = getDeal(dealPatchMatch[1]);
      const deal = patchDeal(dealPatchMatch[1], body || {});
      fireDealTransitionAlerts(before, deal).catch((err) => {
        console.warn('[team-notify] patch alerts failed:', err.message);
      });
      sendJson(res, 200, { ok: true, deal: enrichDealForDisplay(deal) });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const teamMsgMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/team-messages$/.exec(pathname);
  if (teamMsgMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const fromUser = normalizeTeamUser(user) || (isAdminUsername(user) ? 'admin' : 'brad');
      const out = addTeamMessage(teamMsgMatch[1], {
        fromUser,
        body: body.body || body.message || body.text
      });
      const notifyResult = await teamNotify.alertTeamMessage({
        deal: out.deal,
        fromUser,
        body: out.message?.body
      }).catch((err) => {
        console.warn('[team-notify] team message alert failed:', err.message);
        return { ok: false, error: err.message };
      });
      if (notifyResult && !notifyResult.ok) {
        console.warn('[team-notify] team message alert result:', JSON.stringify(notifyResult));
      }
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(out.deal),
        message: out.message,
        unreadTeam: listUnreadTeamForUser(fromUser),
        notify: notifyResult || null
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const teamReactionMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/team-messages\/([a-zA-Z0-9_-]+)\/reactions$/.exec(pathname);
  if (teamReactionMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const teamUser = normalizeTeamUser(user) || (isAdminUsername(user) ? 'admin' : 'brad');
      const out = toggleTeamMessageReaction(
        teamReactionMatch[1],
        teamReactionMatch[2],
        body.emoji || body.reaction || body.key,
        teamUser
      );
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(out.deal),
        message: out.message
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const teamReadMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/team-messages\/read$/.exec(pathname);
  if (teamReadMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
    try {
      const teamUser = normalizeTeamUser(user) || (isAdminUsername(user) ? 'admin' : 'brad');
      const deal = markTeamMessagesRead(teamReadMatch[1], teamUser);
      sendJson(res, 200, {
        ok: true,
        deal: enrichDealForDisplay(deal),
        unreadTeam: listUnreadTeamForUser(teamUser)
      });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }


  const compBlockPassMatch = /^\/api\/leads\/([a-zA-Z0-9_-]+)\/comp\/block-pass$/.exec(pathname);
  if (compBlockPassMatch && req.method === 'POST') {
    if (!requireMax(req, res)) return true;
    const lead = getLead(compBlockPassMatch[1]);
    if (!lead) {
      sendJson(res, 404, { ok: false, error: 'Lead not found', code: 'NOT_FOUND' });
      return true;
    }
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const pass = String(body.pass || '').trim().toLowerCase();
    if (!['pass', 'kill'].includes(pass)) {
      sendJson(res, 400, {
        ok: false,
        error: 'pass must be "pass" or "kill"',
        code: 'INVALID_PASS'
      });
      return true;
    }
    lead.compBlockPass = pass;
    const saved = upsertLead(lead);
    sendJson(res, 200, { ok: true, lead: saved, compBlockPass: pass });
    return true;
  }

  const compReportFileMatch = /^\/api\/leads\/([a-zA-Z0-9_-]+)\/comp\/report-file\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (compReportFileMatch && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    const lead = getLead(compReportFileMatch[1]);
    if (!lead) {
      sendJson(res, 404, { ok: false, error: 'Lead not found', code: 'NOT_FOUND' });
      return true;
    }
    try {
      const file = readCompReportFile(compReportFileMatch[1], compReportFileMatch[2]);
      const buf = fs.readFileSync(file.path);
      const download = String(url.searchParams.get('download') || '') === '1';
      res.writeHead(200, {
        'Content-Type': file.mime || 'application/octet-stream',
        'Content-Length': buf.length,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${String(file.filename || 'report').replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=120'
      });
      res.end(buf);
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const compReportUploadMatch = /^\/api\/leads\/([a-zA-Z0-9_-]+)\/comp\/report-file$/.exec(pathname);
  if (compReportUploadMatch && req.method === 'POST') {
    if (!requireMax(req, res)) return true;
    const lead = getLead(compReportUploadMatch[1]);
    if (!lead) {
      sendJson(res, 404, { ok: false, error: 'Lead not found', code: 'NOT_FOUND' });
      return true;
    }
    try {
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      let buffer;
      let filename;
      let mime;
      if (contentType.includes('application/json')) {
        const body = await readBody(req, { maxBytes: 26 * 1024 * 1024 });
        if (body === null) {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
          return true;
        }
        const b64 = body.contentBase64 || body.base64 || body.content;
        if (!b64) {
          sendJson(res, 400, { ok: false, error: 'contentBase64 required', code: 'MISSING_FILE' });
          return true;
        }
        buffer = Buffer.from(String(b64), 'base64');
        filename = body.filename || body.name || 'report.pdf';
        mime = body.mime || body.mimeType || 'application/pdf';
      } else {
        buffer = await readRawBody(req, { maxBytes: 26 * 1024 * 1024 });
        if (!buffer.length) {
          sendJson(res, 400, { ok: false, error: 'Empty file', code: 'EMPTY_FILE' });
          return true;
        }
        mime = contentType.split(';')[0].trim() || 'application/octet-stream';
        filename = String(req.headers['x-filename'] || 'report').trim() || 'report';
      }
      const file = saveCompReportFile(compReportUploadMatch[1], { buffer, filename, mime });
      const files = Array.isArray(lead.compReportFiles) ? [...lead.compReportFiles] : [];
      files.push(file);
      lead.compReportFiles = files;
      const saved = upsertLead(lead);
      sendJson(res, 200, {
        ok: true,
        file,
        lead: saved,
        downloadUrl: `/api/leads/${encodeURIComponent(saved.leadId)}/comp/report-file/${encodeURIComponent(file.id)}`
      });
    } catch (err) {
      const status = err.code === 'UNSUPPORTED_MIME' || err.code === 'FILE_TOO_LARGE'
        || err.code === 'EMPTY_FILE' ? 400 : 500;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const compManualMatch = /^\/api\/leads\/([a-zA-Z0-9_-]+)\/comp\/manual$/.exec(pathname);
  if (compManualMatch && req.method === 'POST') {
    if (!requireMax(req, res)) return true;
    const lead = getLead(compManualMatch[1]);
    if (!lead) {
      sendJson(res, 404, { ok: false, error: 'Lead not found', code: 'NOT_FOUND' });
      return true;
    }
    if (lead.leadType === 'land') {
      sendJson(res, 400, { ok: false, error: 'Land Comp out of scope', code: 'LAND_OUT_OF_SCOPE' });
      return true;
    }
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const { leadPatch, report } = buildManualCompReport({
        lead,
        arv: body.arv,
        comps: body.comps,
        note: body.note
      });
      const saved = mergeCompOntoLead(lead, leadPatch);
      sendJson(res, 200, { ok: true, lead: saved, report });
    } catch (err) {
      const status = err.code === 'ARV_REQUIRED' || err.code === 'COMPS_REQUIRED'
        || err.code === 'COMP_PRICE_REQUIRED' ? 400 : 500;
      sendJson(res, status, { ok: false, error: err.message, code: err.code || 'ERROR' });
    }
    return true;
  }

  const compMatch = /^\/api\/leads\/([a-zA-Z0-9_-]+)\/comp$/.exec(pathname);
  if (compMatch && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    const lead = getLead(compMatch[1]);
    if (!lead) {
      sendJson(res, 404, { ok: false, error: 'Lead not found', code: 'NOT_FOUND' });
      return true;
    }
    sendJson(res, 200, { ok: true, ...compSummaryFromLead(lead) });
    return true;
  }

  if (compMatch && req.method === 'POST') {
    if (!requireMax(req, res)) return true;
    const lead = getLead(compMatch[1]);
    if (!lead) {
      sendJson(res, 404, { ok: false, error: 'Lead not found', code: 'NOT_FOUND' });
      return true;
    }
    if (lead.leadType === 'land') {
      sendJson(res, 400, { ok: false, error: 'Land Comp out of scope', code: 'LAND_OUT_OF_SCOPE' });
      return true;
    }
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const replace = body.replace === true || url.searchParams.get('replace') === '1';
    if (lead.compedAt && !replace) {
      sendJson(res, 200, {
        ok: true,
        confirmReplace: true,
        lead,
        report: lead.compingReport || null
      });
      return true;
    }
    if (isNonDisclosureState(lead.state)) {
      sendJson(res, 200, {
        ok: true,
        needsManual: true,
        state: lead.state
      });
      return true;
    }
    const reapi = createReapiClientFromConfig();
    if (!reapi) {
      sendJson(res, 503, {
        ok: false,
        error: 'REALESTATE_API_KEY is not configured',
        code: 'REAPI_NOT_CONFIGURED'
      });
      return true;
    }
    try {
      const out = await runAutoComp(lead, { reapi });
      if (out.needsManual) {
        sendJson(res, 200, {
          ok: true,
          needsManual: true,
          state: lead.state
        });
        return true;
      }
      if (!out.ok) {
        const status = /not configured/i.test(out.error || '') ? 503 : 400;
        sendJson(res, status, { ok: false, error: out.error || 'Comp failed', code: 'COMP_FAILED' });
        return true;
      }
      const saved = mergeCompOntoLead(lead, out.leadPatch);
      sendJson(res, 200, { ok: true, lead: saved, report: out.report });
    } catch (err) {
      const status = err.status === 401 || err.status === 429 ? 502 : 500;
      sendJson(res, status, {
        ok: false,
        error: err.message || 'Comp failed',
        code: err.code || 'COMP_FAILED'
      });
    }
    return true;
  }

  const detailMatch = /^\/api\/leads\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (detailMatch && req.method === 'GET') {
    if (!requireMax(req, res)) return true;
    const lead = getLead(detailMatch[1]);
    if (!lead) {
      sendJson(res, 404, { ok: false, error: 'Lead not found', code: 'NOT_FOUND' });
      return true;
    }
    const status = lead.catalogStatus || 'active';
    if (status !== 'active' && !isAdmin(req)) {
      sendJson(res, 404, { ok: false, error: 'Lead not found', code: 'NOT_FOUND' });
      return true;
    }
    const user = readPhugleeUser(req);
    const overlays = readOverlays(user);
    sendJson(res, 200, {
      ok: true,
      lead,
      scoreExplain: explainPriorityScore(lead),
      favorite: overlays.favorites.includes(lead.leadId),
      note: overlays.notes[lead.leadId] || '',
      disposition: overlays.dispositions?.[lead.leadId] || ''
    });
    return true;
  }

  if (pathname === '/api/leads/export' && req.method === 'POST') {
    const user = requireMax(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }

    const format = String(body.format || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
    const scope = String(body.scope || 'ids').toLowerCase() === 'filtered' ? 'filtered' : 'ids';
    let ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    let truncated = false;
    let matchTotal = ids.length;
    let filtersForName = body.filters && typeof body.filters === 'object' ? body.filters : {};

    if (scope === 'filtered') {
      const query = normalizeListQuery(body.filters || {});
      if (query.favoritesOnly) {
        const overlays = readOverlays(user);
        query.favoriteIds = new Set(overlays.favorites);
      }
      if (!isAdmin(req)) query.includeHidden = false;
      const collected = collectMatchingLeadIds(query, MAX_EXPORT_ROWS);
      ids = collected.ids;
      truncated = collected.truncated;
      matchTotal = collected.total;
      filtersForName = body.filters || {};
    }

    if (!ids.length) {
      sendJson(res, 400, {
        ok: false,
        error: scope === 'filtered' ? 'No leads match these filters' : 'No leads selected',
        code: scope === 'filtered' ? 'NO_MATCHES' : 'NO_IDS'
      });
      return true;
    }
    if (ids.length > MAX_EXPORT_ROWS) {
      sendJson(res, 400, { ok: false, error: `Max ${MAX_EXPORT_ROWS} rows per export`, code: 'TOO_MANY' });
      return true;
    }
    try {
      checkExportLimit(user);
    } catch (err) {
      sendJson(res, 429, { ok: false, error: err.message, code: err.code });
      return true;
    }
    const leads = getLeadsByIds(ids).filter((l) => {
      const status = l.catalogStatus || 'active';
      return status === 'active' || isAdmin(req);
    });
    const filename = buildExportFilename({
      format,
      filters: filtersForName,
      label: body.label || body.filename || ''
    });
    if (format === 'csv') {
      sendJson(res, 200, {
        ok: true,
        format: 'csv',
        filename,
        csv: leadsToCsv(leads),
        count: leads.length,
        matchTotal,
        truncated
      });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      format: 'xlsx',
      filename,
      xlsxBase64: leadsToXlsxBase64(leads),
      count: leads.length,
      matchTotal,
      truncated
    });
    return true;
  }

  if (pathname === '/api/leads/user/overlays' && req.method === 'GET') {
    const user = requireMax(req, res);
    if (!user) return true;
    sendJson(res, 200, { ok: true, overlays: readOverlays(user) });
    return true;
  }

  if (pathname === '/api/leads/user/favorites/bulk' && req.method === 'POST') {
    const user = requireMax(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const favorite = body.favorite !== false;
    const favorites = bulkSetFavorites(user, ids, favorite);
    sendJson(res, 200, { ok: true, favorites });
    return true;
  }

  const favMatch = /^\/api\/leads\/user\/favorites\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (favMatch && req.method === 'PUT') {
    const user = requireMax(req, res);
    if (!user) return true;
    const favorite = toggleFavorite(user, favMatch[1]);
    sendJson(res, 200, { ok: true, favorite });
    return true;
  }

  const noteMatch = /^\/api\/leads\/user\/notes\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (noteMatch && req.method === 'PUT') {
    const user = requireMax(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const note = upsertNote(user, noteMatch[1], body.note);
    sendJson(res, 200, { ok: true, note });
    return true;
  }

  const dispositionMatch = /^\/api\/leads\/user\/dispositions\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (dispositionMatch && req.method === 'PUT') {
    const user = requireMax(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const disposition = upsertDisposition(user, dispositionMatch[1], body.disposition);
      sendJson(res, 200, { ok: true, disposition });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message, code: err.code || 'INVALID' });
    }
    return true;
  }

  if (pathname === '/api/leads/user/presets' && req.method === 'PUT') {
    const user = requireMax(req, res);
    if (!user) return true;
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    const presets = savePresets(user, body.presets);
    sendJson(res, 200, { ok: true, presets });
    return true;
  }

  if (pathname === '/api/leads/publish' && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    if (Array.isArray(body.leads)) {
      const result = publishBatch(body.leads, body.meta || {});
      sendJson(res, 200, { ok: true, ...result });
      return true;
    }
    const lead = publishLead(body.lead ? body.lead : body, {
      ...(body.meta || {}),
      forceApprove: !!body.forceApprove
    });
    sendJson(res, 200, { ok: true, lead });
    return true;
  }

  // Merge PropStream-style enrichment onto existing catalog leads (fill blanks only).
  if (pathname === '/api/leads/admin/enrich' && req.method === 'POST') {
    if (!isAdmin(req)) {
      sendJson(res, 403, { ok: false, error: 'Admin only', code: 'FORBIDDEN' });
      return true;
    }
    const body = await readBody(req);
    if (body === null || !Array.isArray(body.enrichments)) {
      sendJson(res, 400, { ok: false, error: 'enrichments array required', code: 'INVALID_JSON' });
      return true;
    }
    const enrichments = body.enrichments.slice(0, 500);
    const indexByKey = new Map();
    for (const entry of readIndex()) {
      indexByKey.set(matchKey(entry), entry.leadId);
      indexByKey.set(entry.leadId, entry.leadId);
    }

    let matched = 0;
    let missing = 0;
    let errors = 0;
    const toUpsert = [];

    for (const enrichment of enrichments) {
      if (!enrichment || typeof enrichment !== 'object') {
        errors += 1;
        continue;
      }
      const leadId = enrichment.leadId
        || indexByKey.get(enrichment.matchKey)
        || (enrichment.address
          ? indexByKey.get(matchKey(enrichment))
          : null);
      if (!leadId) {
        missing += 1;
        continue;
      }
      const existing = getLead(leadId);
      if (!existing) {
        missing += 1;
        continue;
      }
      matched += 1;
      try {
        const merged = mergeEnrichmentIntoLead(existing, enrichment);
        const lead = normalizeLeadRecord(merged);
        lead.propertyDetails = merged.propertyDetails || {};
        lead.financialDetails = merged.financialDetails || {};
        lead.enrichedAt = merged.enrichedAt;
        lead.enrichmentSource = merged.enrichmentSource;
        lead.priorityScore = computePriorityScore(lead);
        const check = validateLeadRecord(lead);
        if (!check.ok) {
          errors += 1;
          continue;
        }
        toUpsert.push(lead);
      } catch (_) {
        errors += 1;
      }
    }

    const batch = upsertLeadsBatch(toUpsert);
    sendJson(res, 200, {
      ok: true,
      received: enrichments.length,
      matched,
      missing,
      errors,
      updated: batch.published || 0,
      unchanged: batch.unchanged || 0
    });
    return true;
  }

  sendJson(res, 404, { ok: false, error: 'Not found', code: 'NOT_FOUND' });
  return true;
}

module.exports = {
  handle,
  isMaxAccess,
  leadsToCsv
};

// One-time backfill when index predates address/thumb/entity/phone fields.
setImmediate(() => {
  try {
    const { readIndex, rebuildIndexFromLeads } = require('./store');
    const index = readIndex();
    if (!index.length) return;
    const sample = index[0];
    const needsRebuild = !sample.address
      || sample.entityType == null
      || !Array.isArray(sample.phones);
    if (!needsRebuild) return;
    console.log('[Vault] Rebuilding leads index for facet/list fields…');
    const result = rebuildIndexFromLeads();
    console.log('[Vault] Index rebuilt:', result.rebuilt, 'leads');
  } catch (err) {
    console.warn('[Vault] Index rebuild skipped:', err.message);
  }
});
