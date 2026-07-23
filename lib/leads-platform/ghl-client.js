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

/**
 * Update GHL contact CRM fields (email / phone). Best-effort for desk edits.
 * @param {string} contactId
 * @param {{ email?: string, phone?: string }} fields
 */
async function updateContact(contactId, fields = {}) {
  const id = String(contactId || '').trim();
  if (!id) {
    const err = new Error('contactId required');
    err.code = 'INVALID';
    throw err;
  }
  const patch = {};
  const email = String(fields.email || '').trim().toLowerCase();
  if (email) patch.email = email;
  if (fields.phone != null && String(fields.phone).trim()) {
    const raw = String(fields.phone).trim();
    patch.phone = toE164Us(raw) || raw;
  }
  if (!Object.keys(patch).length) {
    return getContact(id);
  }
  const data = await api('PUT', `/contacts/${encodeURIComponent(id)}`, patch);
  return data.contact || data || { id, ...patch };
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
    // Seller PSA earnest only — never fall back to cash-buyer EMD (different deposit).
    emdDeposit: cfValue(map, FIELD_IDS.emdDeposit),
    cashBuyerEmd: cfValue(map, FIELD_IDS.cashBuyerEmd),
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
  all.sort((a, b) => parseGhlTimestampMs(a.dateAdded) - parseGhlTimestampMs(b.dateAdded));
  return all;
}

/**
 * Normalize GHL message times to epoch ms.
 * GHL returns ISO UTC (often with Z) or epoch ms; bare ISO without offset is UTC.
 */
function parseGhlTimestampMs(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : 0;
  }
  const raw = String(value).trim();
  if (!raw) return 0;
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    const ms = raw.length <= 10 ? n * 1000 : n;
    return Number.isFinite(ms) ? ms : 0;
  }
  // Bare ISO without timezone → treat as UTC (GHL convention).
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)) {
    const ms = Date.parse(`${raw}Z`);
    return Number.isFinite(ms) ? ms : 0;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function parseGhlTimestamp(value) {
  const ms = parseGhlTimestampMs(value);
  if (!ms) return null;
  return new Date(ms).toISOString();
}

function messageHasAttachments(m) {
  const a = m?.attachments;
  if (Array.isArray(a) && a.some((x) => String(x || '').trim())) return true;
  if (typeof a === 'string' && a.trim()) return true;
  return false;
}

function smsPreviewText(m) {
  const body = String(m?.body || m?.message || '').trim();
  if (body) return body;
  if (messageHasAttachments(m)) {
    const n = Array.isArray(m.attachments) ? m.attachments.length : 1;
    return n > 1 ? `📷 ${n} photos` : '📷 Photo';
  }
  return '';
}

function isHumanSmsMessage(m) {
  if (!m) return false;
  const messageType = String(m.messageType || '');
  const typeNum = m.type;
  if (/TYPE_ACTIVITY_/i.test(messageType) || typeNum === 28 || messageType === '28') return false;
  if (/TYPE_EMAIL|TYPE_CALL|TYPE_VOICEMAIL|TYPE_FACEBOOK|TYPE_INSTAGRAM|TYPE_WHATSAPP|TYPE_LIVE_CHAT/i.test(messageType)) {
    return false;
  }
  // Prefer SMS / text; TYPE_PHONE threads can still carry SMS bodies.
  if (
    messageType
    && !/SMS|TYPE_SMS|TYPE_CAMPAIGN_SMS|TYPE_PHONE/i.test(messageType)
    && /EMAIL|CALL|VOICEMAIL|FACEBOOK|INSTAGRAM|WHATSAPP|LIVE_CHAT/i.test(messageType)
  ) {
    return false;
  }
  // Text body OR MMS attachments (GHL often sends photos with empty body).
  return !!smsPreviewText(m);
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
  if (toNumber) {
    const e164 = toE164Us(toNumber);
    body.toNumber = e164 || String(toNumber);
  }
  return api('POST', '/conversations/messages', body, { version: CONVERSATION_VERSION });
}

async function sendEmail({ contactId, subject, html, message, emailTo, emailFrom }) {
  if (!contactId || !(html || message)) {
    const err = new Error('contactId and html/message required');
    err.code = 'INVALID';
    throw err;
  }
  const body = {
    type: 'Email',
    contactId: String(contactId),
    subject: String(subject || 'Phuglee Contract Tracker'),
    html: String(html || message || '')
  };
  if (emailTo) body.emailTo = String(emailTo);
  if (emailFrom) body.emailFrom = String(emailFrom);
  return api('POST', '/conversations/messages', body, { version: CONVERSATION_VERSION });
}

async function searchContacts(query, { limit = 20 } = {}) {
  const { locationId } = ghlConfig();
  const q = encodeURIComponent(String(query || '').trim());
  if (!q) return [];
  const data = await api(
    'GET',
    `/contacts/?locationId=${locationId}&query=${q}&limit=${Math.min(50, Math.max(1, limit))}`
  );
  return data.contacts || data.contact || [];
}

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function toE164Us(phone) {
  const d = digitsOnly(phone);
  if (!d) return '';
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (String(phone || '').trim().startsWith('+')) return String(phone).trim();
  return d ? `+${d}` : '';
}

function pickContactId(contact) {
  return contact?.id || contact?.contactId || null;
}

/**
 * Find or create a location contact by email (+ optional phone).
 * On duplicate-phone/email errors, reuses the existing contactId from GHL.
 */
async function addContactTags(contactId, tags = []) {
  const id = String(contactId || '').trim();
  const list = (Array.isArray(tags) ? tags : [tags])
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  if (!id || !list.length) {
    const err = new Error('contactId and tags required');
    err.code = 'INVALID';
    throw err;
  }
  return api('POST', `/contacts/${encodeURIComponent(id)}/tags`, { tags: list });
}

async function createContactNote(contactId, body) {
  const id = String(contactId || '').trim();
  const text = String(body || '').trim();
  if (!id || !text) {
    const err = new Error('contactId and note body required');
    err.code = 'INVALID';
    throw err;
  }
  const { locationId } = ghlConfig();
  return api('POST', `/contacts/${encodeURIComponent(id)}/notes`, {
    body: text,
    locationId
  });
}

async function ensureContactByEmail({ email, phone, name, firstName, lastName }) {
  const em = String(email || '').trim().toLowerCase();
  const phoneDigits = digitsOnly(phone);
  const e164 = toE164Us(phone);

  async function findExisting() {
    const pools = [];
    if (em) pools.push(...(await searchContacts(em, { limit: 10 }).catch(() => [])));
    if (phoneDigits) pools.push(...(await searchContacts(phoneDigits, { limit: 10 }).catch(() => [])));
    if (e164) pools.push(...(await searchContacts(e164, { limit: 10 }).catch(() => [])));
    const list = Array.isArray(pools) ? pools : [];
    if (!list.length) return null;

    if (em) {
      const byEmail = list.find((c) => String(c.email || '').trim().toLowerCase() === em);
      if (byEmail) return byEmail;
    }
    if (phoneDigits) {
      const byPhone = list.find((c) => {
        const cd = digitsOnly(c.phone || c.phoneNumber || '');
        return cd && (cd === phoneDigits || cd.endsWith(phoneDigits) || phoneDigits.endsWith(cd.slice(-10)));
      });
      if (byPhone) return byPhone;
    }
    return list[0] || null;
  }

  const match = await findExisting();
  if (match && pickContactId(match)) {
    const id = pickContactId(match);
    const patch = {};
    if (phone && !match.phone) patch.phone = e164 || String(phone);
    if (em && String(match.email || '').trim().toLowerCase() !== em) patch.email = em;
    if (Object.keys(patch).length) {
      try {
        await api('PUT', `/contacts/${id}`, patch);
      } catch (_) { /* best effort */ }
    }
    return { ...match, id, email: patch.email || match.email, phone: patch.phone || match.phone };
  }

  if (!em && !e164) {
    const err = new Error('email or phone required');
    err.code = 'INVALID';
    throw err;
  }

  const { locationId } = ghlConfig();
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const payload = {
    locationId,
    email: em || undefined,
    phone: e164 || (phone ? String(phone) : undefined),
    firstName: firstName || parts[0] || undefined,
    lastName: lastName || (parts.length > 1 ? parts.slice(1).join(' ') : undefined),
    name: name || undefined
  };
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });

  try {
    const created = await api('POST', `/contacts/`, payload);
    const contact = created.contact || created;
    return { ...contact, id: pickContactId(contact) };
  } catch (err) {
    // Location forbids duplicates — meta.contactId is the existing contact.
    const metaId = err?.body?.meta?.contactId || err?.body?.contactId;
    if (metaId) {
      return { id: String(metaId), email: em, phone: e164 || phone };
    }
    // Retry once via fresh search after race/create conflict
    const again = await findExisting();
    if (again && pickContactId(again)) {
      return { ...again, id: pickContactId(again) };
    }
    throw err;
  }
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
      const host = String(target);
      if (
        /leadconnectorhq\.com|gohighlevel|msgsndr\.com|usercontent\.site|static-assets/i.test(host)
      ) {
        headers.Authorization = `Bearer ${apiKey}`;
        headers.Version = version;
      }
      const res = await fetch(target, { headers, redirect: 'follow' });
      if (!res.ok) {
        lastErr = new Error(`Download ${res.status} for ${String(target).slice(0, 80)}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
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
  updateContact,
  customFieldMap,
  summarizeContactMoney,
  searchConversationsByContact,
  getConversationMessages,
  listAllConversationMessages,
  isHumanSmsMessage,
  messageHasAttachments,
  smsPreviewText,
  parseGhlTimestamp,
  parseGhlTimestampMs,
  resolveLastOutboundFromNumber,
  resolveContactToNumber,
  sendSms,
  sendEmail,
  searchContacts,
  ensureContactByEmail,
  addContactTags,
  createContactNote,
  digitsOnly,
  toE164Us,
  listLocationPhoneNumbers,
  classifyDocumentKind,
  extractContactDocuments,
  fetchGhlDocumentBytes
};
