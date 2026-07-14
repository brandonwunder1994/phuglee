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
  contractClosingDate: 'Ggt9RGIkf2cUyN4VOrKG'
};

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

function headers(json = true) {
  const { apiKey, version } = ghlConfig();
  const h = {
    Authorization: `Bearer ${apiKey}`,
    Version: version,
    Accept: 'application/json'
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function api(method, urlPath, body) {
  const { apiKey, locationId, base } = ghlConfig();
  if (!apiKey || !locationId) {
    const err = new Error('GHL_API_KEY and GHL_LOCATION_ID are required');
    err.code = 'GHL_NOT_CONFIGURED';
    throw err;
  }
  const opts = { method, headers: headers(body !== undefined) };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${base}${urlPath}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) { /* non-JSON error bodies */ }
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

/**
 * Search opportunities. GHL search is POST body for newer API;
 * also try GET with query params for compatibility.
 */
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
    // Fallback GET style used by older scripts
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
    emdDeposit: cfValue(map, FIELD_IDS.emdDeposit) || cfValue(map, FIELD_IDS.cashBuyerEmd),
    sellersName: cfValue(map, FIELD_IDS.sellersName)
  };
}

module.exports = {
  FIELD_IDS,
  ghlConfig,
  isConfigured,
  api,
  listPipelines,
  findDtsPipeline,
  searchOpportunities,
  getContact,
  customFieldMap,
  summarizeContactMoney
};
