'use strict';

/**
 * Go High Level Private Integration client (location-scoped PIT).
 * Env: GHL_API_KEY, GHL_LOCATION_ID, optional GHL_API_BASE / GHL_API_VERSION
 */

const FIELD_IDS = {
  contractPrice: 'ip2o1mbo69krhMd9X8vk',
  assignmentFee: 'TcL8Mnh5tVpRHE4919Oc',
  cashBuyerName: 'K7R3MHDYcFo71rGvQUAf',
  closingDate: 'MWQkMnfniDOKIsWvVIh8',
  cashBuyerEmd: 'R1piBwmNBtnLs6nDSrAc',
  emdDeposit: 'wwo3v8F8SjLn0tkYLwSB',
  originalPurchasePrice: 'G4JZwnKbxsLbgajRFWGH',
  sellersName: 'T0YQWLM9CwsjKvgTLLSO',
  contractSignedDate: 'vk2YSFoeeyWABotIpDZu',
  contractClosingDate: 'Ggt9RGIkf2cUyN4VOrKG',
  additionalTerms: 'ifffm0DAqA2Rj0RsS55W',
  /** Signed Purchase Contract (FILE) — GHL contact custom field */
  signedPurchaseContract: 'p6l7W4VKtxMnTn5n9CZj'
};

/** Known FILE custom fields we surface on Contract Tracker profiles */
const DOCUMENT_FIELD_META = {
  [FIELD_IDS.signedPurchaseContract]: {
    label: 'Signed purchase contract',
    defaultKind: 'purchase_contract'
  }
};

const CONVERSATION_VERSION = '2021-04-15';

function ghlConfig() {
  const apiKey = String(process.env.GHL_API_KEY || '').trim();
  const locationId = String(process.env.GHL_LOCATION_ID || '').trim();
  const base = String(process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com').trim()
    .replace(/\/$/, '');
  const version = String(process.env.GHL_API_VERSION || '2021-07-28').trim();
  return { apiKey, locationId, base, version };
}

function isConfigured() {
  const { apiKey, locationId } = ghlConfig();
  return !!(apiKey && locationId);
}

async function api(method, urlPath, body, opts = {}) {
  const { apiKey, locationId, base, version } = ghlConfig();
  if (!apiKey || !locationId) {
    const err = new Error('GHL_API_KEY and GHL_LOCATION_ID are required');
    err.code = 'GHL_NOT_CONFIGURED';
    throw err;
  }
  const useVersion = opts.version || version;
  const h = {
    Authorization: `Bearer ${apiKey}`,
    Version: useVersion,
    Accept: 'application/json'
  };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const fetchOpts = { method, headers: h };
  if (body !== undefined) fetchOpts.body = JSON.stringify(body);
  const res = await fetch(`${base}${urlPath}`, fetchOpts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(`GHL ${method} ${urlPath} → ${res.status}: ${(text || '').slice(0, 500)}`);
    err.code = 'GHL_HTTP';
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function customFieldMap(contact) {
  const out = {};
  for (const cf of contact?.customFields || []) {
    if (cf && cf.id != null) out[cf.id] = cf.value;
  }
  return out;
}

function cfValue(map, id) {
  const v = map[id];
  if (v === undefined || v === null || v === '') return null;
  return v;
}

async function listPipelines() {
  const { locationId } = ghlConfig();
  const data = await api('GET', `/opportunities/pipelines?locationId=${locationId}`);
  return data.pipelines || [];
}

async function findDtsPipeline() {
  const pipes = await listPipelines();
  const dts = pipes.find((p) => /DTS/i.test(p.name || '') && !/\(OLD\)/i.test(p.name || ''));
  if (!dts) {
    const err = new Error('DTS pipeline not found in GHL');
    err.code = 'GHL_DTS_MISSING';
    throw err;
  }
  return dts;
}

async function searchOpportunities(params = {}) {
  const { locationId } = ghlConfig();
  const body = {
    location_id: locationId,
    status: params.status || 'open',
    limit: params.limit || 100,
    page: params.page || 1
  };
  if (params.pipelineId) body.pipeline_id = params.pipelineId;
  if (params.pipelineStageId) body.pipeline_stage_id = params.pipelineStageId;
  if (params.contactId) body.contact_id = params.contactId;

  try {
    const data = await api('POST', '/opportunities/search', body);
    return {
      opportunities: data.opportunities || data.opps || [],
      meta: data.meta || data
    };
  } catch (err) {
    const qs = new URLSearchParams({
      location_id: locationId,
      status: body.status,
      limit: String(body.limit),
      page: String(body.page)
    });
    if (body.pipeline_id) qs.set('pipeline_id', body.pipeline_id);
    if (body.pipeline_stage_id) qs.set('pipeline_stage_id', body.pipeline_stage_id);
    if (body.contact_id) qs.set('contact_id', body.contact_id);
    const data = await api('GET', `/opportunities/search?${qs.toString()}`);
    return {
      opportunities: data.opportunities || data.opps || [],
      meta: data.meta || data
    };
  }
}

async function getContact(contactId) {
  const data = await api('GET', `/contacts/${contactId}`);
  return data.contact || data;
}

function summarizeContactMoney(contact) {
  const map = customFieldMap(contact);
  const name = contact.contactName
    || [contact.firstName, contact.lastName].filter(Boolean).join(' ')
    || '';
  const address1 = contact.address1 || '';
  const city = contact.city || '';
  const state = contact.state || '';
  const zip = contact.postalCode || '';
  return {
    id: contact.id,
    name,
    email: contact.email || null,
    phone: contact.phone || null,
    address1,
    city,
    state,
    zip,
    fullAddress: [address1, [city, state, zip].filter(Boolean).join(', ')].filter(Boolean).join(', '),
    contractPrice: cfValue(map, FIELD_IDS.contractPrice) || cfValue(map, FIELD_IDS.originalPurchasePrice),
    assignmentFee: cfValue(map, FIELD_IDS.assignmentFee),
    cashBuyerName: cfValue(map, FIELD_IDS.cashBuyerName),
    closingDate: cfValue(map, FIELD_IDS.closingDate) || cfValue(map, FIELD_IDS.contractClosingDate),
    contractSignedDate: cfValue(map, FIELD_IDS.contractSignedDate),
    emdDeposit: cfValue(map, FIELD_IDS.emdDeposit) || cfValue(map, FIELD_IDS.cashBuyerEmd),
    sellersName: cfValue(map, FIELD_IDS.sellersName)
  };
}

async function searchConversationsByContact(contactId) {
  const { locationId } = ghlConfig();
  const qs = new URLSearchParams({
    locationId,
    contactId: String(contactId)
  });
  const data = await api('GET', `/conversations/search?${qs}`, undefined, {
    version: CONVERSATION_VERSION
  });
  return data.conversations || [];
}

async function getConversationMessages(conversationId, { limit = 100, lastMessageId } = {}) {
  let path = `/conversations/${conversationId}/messages?limit=${Math.min(100, Math.max(1, limit))}`;
  if (lastMessageId) path += `&lastMessageId=${encodeURIComponent(lastMessageId)}`;
  return api('GET', path, undefined, { version: CONVERSATION_VERSION });
}

async function listAllConversationMessages(conversationId, { maxPages = 10 } = {}) {
  const all = [];
  let lastMessageId;
  for (let i = 0; i < maxPages; i++) {
    const data = await getConversationMessages(conversationId, { limit: 100, lastMessageId });
    const bundle = data.messages || data;
    const batch = Array.isArray(bundle.messages) ? bundle.messages
      : (Array.isArray(bundle) ? bundle : []);
    all.push(...batch);
    if (!bundle.nextPage || !batch.length) break;
    lastMessageId = bundle.lastMessageId || batch[batch.length - 1]?.id;
    if (!lastMessageId) break;
  }
  all.sort((a, b) => new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0));
  return all;
}

function isHumanSmsMessage(m) {
  if (!m) return false;
  const type = String(m.messageType || m.type || '');
  if (/TYPE_ACTIVITY_/i.test(type)) return false;
  if (type === '28' || type === 28) return false;
  // Prefer SMS / text; still allow unknown types that have a body (some GHL payloads omit type).
  if (type && !/SMS|TYPE_SMS|TYPE_CAMPAIGN_SMS|TYPE_PHONE/i.test(type) && /EMAIL|CALL|VOICEMAIL|FACEBOOK|INSTAGRAM|WHATSAPP|LIVE_CHAT|TYPE_EMAIL/i.test(type)) {
    return false;
  }
  return !!String(m.body || m.message || '').trim();
}

function pickPhoneField(m, keys = []) {
  for (const k of keys) {
    const v = m?.[k];
    if (v && /^\+?\d[\d\s()-]{7,}$/.test(String(v).trim())) return String(v).trim();
  }
  return null;
}

function resolveLastOutboundFromNumber(messages = []) {
  const human = (Array.isArray(messages) ? messages : []).filter(isHumanSmsMessage);
  for (let i = human.length - 1; i >= 0; i--) {
    const m = human[i];
    const dir = String(m.direction || '').toLowerCase();
    if (dir !== 'outbound' && dir !== 'out') continue;
    const from = pickPhoneField(m, ['from', 'fromNumber', 'source', 'phone']);
    if (from) return from;
  }
  return null;
}

function resolveContactToNumber(contact, messages = []) {
  if (contact?.phone) return String(contact.phone).trim();
  const human = (Array.isArray(messages) ? messages : []).filter(isHumanSmsMessage);
  for (let i = human.length - 1; i >= 0; i--) {
    const m = human[i];
    const dir = String(m.direction || '').toLowerCase();
    if (dir === 'inbound' || dir === 'in') {
      const from = pickPhoneField(m, ['from', 'fromNumber', 'phone']);
      if (from) return from;
    }
    const to = pickPhoneField(m, ['to', 'toNumber']);
    if (to) return to;
  }
  return null;
}

async function sendSms({ contactId, message, fromNumber, toNumber }) {
  if (!contactId || !message) {
    const err = new Error('contactId and message required');
    err.code = 'INVALID';
    throw err;
  }
  const body = {
    type: 'SMS',
    contactId: String(contactId),
    message: String(message)
  };
  if (fromNumber) body.fromNumber = String(fromNumber);
  if (toNumber) body.toNumber = String(toNumber);
  return api('POST', '/conversations/messages', body, { version: CONVERSATION_VERSION });
}

async function listLocationPhoneNumbers() {
  const { locationId } = ghlConfig();
  try {
    const data = await api('GET', `/phone-system/numbers?locationId=${locationId}`, undefined, {
      version: CONVERSATION_VERSION
    });
    return data.numbers || data.phoneNumbers || data.data || [];
  } catch (_) {
    try {
      const data = await api('GET', `/phone-numbers/?locationId=${locationId}`, undefined, {
        version: CONVERSATION_VERSION
      });
      return data.numbers || data.phoneNumbers || data.data || [];
    } catch (_) {
      return [];
    }
  }
}

function classifyDocumentKind(name, fallback = 'other') {
  const n = String(name || '').toLowerCase();
  if (/\bjv\b|joint\s*venture|50\s*\/\s*50|50-50/.test(n)) return 'jv';
  if (/addend|amend/.test(n)) return 'addendum';
  if (/purchase|psa|cash\s*purchase|signed.?contract|agreement/.test(n)) return 'purchase_contract';
  return fallback || 'other';
}

function extractFileEntriesFromCustomValue(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    const url = value.trim();
    if (/^https?:\/\//i.test(url)) {
      return [{
        uuid: null,
        url,
        originalUrl: url,
        documentId: null,
        name: url.split('/').pop() || 'Document',
        mimeType: /pdf/i.test(url) ? 'application/pdf' : 'application/octet-stream',
        size: null
      }];
    }
    return [];
  }
  if (typeof value !== 'object') return [];
  const out = [];
  for (const [uuid, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object') continue;
    const meta = entry.meta || {};
    const name = meta.originalname || meta.filename || entry.name || 'Document';
    out.push({
      uuid: uuid || meta.uuid || null,
      url: entry.url || null,
      originalUrl: meta.originalUrl || entry.originalUrl || null,
      documentId: entry.documentId || meta.documentId || null,
      name,
      mimeType: meta.mimetype || entry.mimeType || 'application/pdf',
      size: meta.size != null ? Number(meta.size) : null
    });
  }
  return out;
}

/**
 * Pull purchase contract / file attachments off a GHL contact.
 * Primary source: Signed Purchase Contract FILE field.
 */
function extractContactDocuments(contact) {
  const map = customFieldMap(contact);
  const docs = [];
  for (const [fieldId, meta] of Object.entries(DOCUMENT_FIELD_META)) {
    const entries = extractFileEntriesFromCustomValue(map[fieldId]);
    for (const e of entries) {
      const kind = classifyDocumentKind(e.name, meta.defaultKind);
      docs.push({
        id: `ghl_${e.documentId || e.uuid || Buffer.from(String(e.name)).toString('hex').slice(0, 12)}`,
        kind,
        name: e.name,
        label: meta.label,
        mimeType: e.mimeType,
        size: e.size,
        source: 'ghl',
        ghlFieldId: fieldId,
        ghlDocumentId: e.documentId,
        ghlUuid: e.uuid,
        url: e.url,
        originalUrl: e.originalUrl
      });
    }
  }
  return docs;
}

async function fetchGhlDocumentBytes({ documentId, url, originalUrl }) {
  const { apiKey, base, version } = ghlConfig();
  const candidates = [];
  if (documentId) {
    candidates.push(`${base}/documents/download/${encodeURIComponent(documentId)}`);
  }
  if (url) candidates.push(url);
  if (originalUrl) candidates.push(originalUrl);

  let lastErr = null;
  for (const target of candidates) {
    try {
      const headers = { Accept: '*/*' };
      if (String(target).includes('leadconnectorhq.com') || String(target).includes('gohighlevel')) {
        headers.Authorization = `Bearer ${apiKey}`;
        headers.Version = version;
      }
      const res = await fetch(target, { headers, redirect: 'follow' });
      if (!res.ok) {
        lastErr = new Error(`Download ${res.status} for ${String(target).slice(0, 80)}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'application/pdf';
      return { buffer: buf, contentType, fromUrl: target };
    } catch (err) {
      lastErr = err;
    }
  }
  const err = lastErr || new Error('Could not download document');
  err.code = 'GHL_DOC_DOWNLOAD_FAILED';
  throw err;
}

module.exports = {
  FIELD_IDS,
  DOCUMENT_FIELD_META,
  CONVERSATION_VERSION,
  ghlConfig,
  isConfigured,
  api,
  listPipelines,
  findDtsPipeline,
  searchOpportunities,
  getContact,
  customFieldMap,
  summarizeContactMoney,
  searchConversationsByContact,
  getConversationMessages,
  listAllConversationMessages,
  isHumanSmsMessage,
  resolveLastOutboundFromNumber,
  resolveContactToNumber,
  sendSms,
  listLocationPhoneNumbers,
  classifyDocumentKind,
  extractContactDocuments,
  fetchGhlDocumentBytes
};
