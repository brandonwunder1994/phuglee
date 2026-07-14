const { readPhugleeUser, readPhugleePlan } = require('../phuglee-user');
const {
  ADMIN_USERNAME,
  isAdminUsername,
  isContractDeskUsername,
  hasVaultAccess
} = require('../phuglee-roles');
const {
  queryLeads,
  getLead,
  getMeta,
  getLeadsByIds,
  upsertLead
} = require('./store');
const { readOverlays, toggleFavorite, bulkSetFavorites, upsertNote, upsertDisposition, savePresets } = require('./user-overlays');
const { publishLead, publishBatch } = require('./publish');
const { ensureAnalyzerSync, scheduleBackgroundSync, getLastSyncStats } = require('./analyzer-sync');
const { normalizeLeadRecord } = require('./schema');
const {
  listDeals,
  listDealsEnriched,
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
  enrichDealForDisplay,
  markBuyerFound,
  requestJvSend,
  requestAmendmentSend,
  requestDocumentSend,
  syncSignedSignNowDocuments,
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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
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

function parseListQuery(url) {
  const signals = url.searchParams.getAll('signal');
  const sincePreset = url.searchParams.get('since');
  let since = url.searchParams.get('sinceDate') || null;
  if (!since && sincePreset) {
    const days = { '7d': 7, '30d': 30, '90d': 90 }[sincePreset];
    if (days) since = new Date(Date.now() - days * 86400000).toISOString();
  }
  return {
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
    favoritesOnly: url.searchParams.get('favoritesOnly') === '1',
    hasPhone: url.searchParams.get('hasPhone') === '1',
    hasImagery: url.searchParams.get('hasImagery') === '1',
    includeHidden: url.searchParams.get('includeHidden') === '1'
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

function leadsToCsv(leads = []) {
  const headers = [
    'Address', 'City', 'State', 'Zip', 'Lead Type', 'Score', 'Top Signal',
    'Owner', 'Phone', 'ARV', 'Repairs', 'Published'
  ];
  const escape = (v) => {
    const text = String(v ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    headers.join(','),
    ...leads.map((l) => [
      l.address,
      l.city,
      l.state,
      l.zip,
      l.leadType,
      l.priorityScore,
      (l.signalTags && l.signalTags[0]) || '',
      l.ownerName,
      (l.phones && l.phones[0]) || '',
      l.estARV ?? '',
      l.estRepairs ?? '',
      l.publishedAt
    ].map(escape).join(','))
  ];
  return `${lines.join('\n')}\n`;
}

function exportRateKey(user) {
  const day = new Date().toISOString().slice(0, 10);
  return `${user}:${day}`;
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

  const isReadRoute = (pathname === '/api/leads' && req.method === 'GET')
    || (pathname === '/api/leads/meta' && req.method === 'GET')
    || (pathname === '/api/leads/bootstrap' && req.method === 'GET');

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
      body = JSON.parse(await readBody(req));
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
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
    const out = publishAnalyzerResult(stamped, {
      storageKey: body.storageKey || 'admin',
      forceApprove: true
    });
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
    // Throttled GHL peek — never fail the board if peek errors
    try {
      await peekSellerSmsForOpenDeals();
    } catch (err) {
      console.warn('[seller-sms] peek on list failed:', err.message);
    }
    const deals = listDealsEnriched(teamUser);
    sendJson(res, 200, {
      ok: true,
      deals,
      totals: proofTotals(listDeals()),
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
        if (sn.ingested) profile = getDealProfile(profile.dealId) || sn.deal || profile;
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

  const jvSendMatch = /^\/api\/leads\/admin\/contracts\/([a-zA-Z0-9_-]+)\/send-jv$/.exec(pathname);
  if (jvSendMatch && req.method === 'POST') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
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

  if (dealPatchMatch && req.method === 'PATCH') {
    const user = requireContractDesk(req, res);
    if (!user) return true;
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
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (!ids.length) {
      sendJson(res, 400, { ok: false, error: 'No leads selected', code: 'NO_IDS' });
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
    const csv = leadsToCsv(leads);
    sendJson(res, 200, {
      ok: true,
      filename: `vault-export-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      count: leads.length
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

  sendJson(res, 404, { ok: false, error: 'Not found', code: 'NOT_FOUND' });
  return true;
}

module.exports = {
  handle,
  isMaxAccess,
  leadsToCsv
};

// One-time backfill when index predates address/thumb fields (large catalogs).
setImmediate(() => {
  try {
    const { readIndex, rebuildIndexFromLeads } = require('./store');
    const index = readIndex();
    if (!index.length || index[0].address) return;
    console.log('[Vault] Rebuilding leads index for fast list queries…');
    const result = rebuildIndexFromLeads();
    console.log('[Vault] Index rebuilt:', result.rebuilt, 'leads');
  } catch (err) {
    console.warn('[Vault] Index rebuild skipped:', err.message);
  }
});
