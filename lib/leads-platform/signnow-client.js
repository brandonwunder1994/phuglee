'use strict';

/**
 * Thin SignNow REST client for Contract Tracker sends.
 * Auth: SIGNNOW_ACCESS_TOKEN (Bearer) — same account as ghl-crm templates.
 */

function getConfig() {
  const token = String(process.env.SIGNNOW_ACCESS_TOKEN || process.env.SIGNNOW_BASIC_TOKEN || '').trim();
  const base = String(process.env.SIGNNOW_API_BASE || 'https://api.signnow.com').replace(/\/$/, '');
  const fromEmail = String(process.env.SIGNNOW_FROM_EMAIL || 'brandon@wunderhausgroup.com').trim();
  return { token, base, fromEmail };
}

function isSignNowConfigured() {
  return Boolean(getConfig().token);
}

async function api(method, urlPath, body) {
  const { token, base } = getConfig();
  if (!token) {
    const err = new Error('SignNow is not configured (missing SIGNNOW_ACCESS_TOKEN)');
    err.code = 'SIGNNOW_NOT_CONFIGURED';
    throw err;
  }
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${base}${urlPath}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    const err = new Error(`SignNow ${method} ${urlPath} → ${res.status}: ${String(text).slice(0, 700)}`);
    err.code = 'SIGNNOW_API_ERROR';
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function copyTemplate(templateId, documentName) {
  const data = await api('POST', `/template/${templateId}/copy`, {
    document_name: documentName
  });
  return data.id;
}

async function getDocument(documentId) {
  return api('GET', `/document/${documentId}`);
}

function fieldPayloadFromDoc(doc, valuesByName = {}, opts = {}) {
  const skipRoles = new Set(opts.skipRoles || []);
  /** Never keep SignNow template sample text for property/address fields. */
  const clearTemplatePrefill = /^(property_line_|property_address$|Property Address$|APN$|Legal Description$)/i;
  const fields = [];
  for (const f of doc.fields || []) {
    const a = f.json_attributes || {};
    const name = a.name;
    if (!name) continue;
    if (f.role && skipRoles.has(f.role)) continue;

    const item = {
      type: f.type,
      name,
      label: name,
      role: f.role,
      page_number: a.page_number,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      required: a.required !== false
    };
    if (f.type === 'text') {
      item.font = a.font || 'Arial';
      item.size = a.size || a.font_size || 11;
      const hasKey = Object.prototype.hasOwnProperty.call(valuesByName, name);
      const val = hasKey ? valuesByName[name] : undefined;
      if (val !== undefined && val !== null && String(val).length) {
        item.prefilled_text = String(val);
      } else if (hasKey || clearTemplatePrefill.test(name)) {
        // Explicit empty or address field — do not leave another property's template sample.
        item.prefilled_text = '';
      } else if (a.prefilled_text) {
        item.prefilled_text = a.prefilled_text;
      }
    }
    fields.push(item);
  }
  return fields;
}

async function applyPrefill(documentId, valuesByName = {}, opts = {}) {
  const doc = await getDocument(documentId);
  const fields = fieldPayloadFromDoc(doc, valuesByName, opts);
  await api('PUT', `/document/${documentId}`, {
    document_name: doc.document_name,
    fields
  });
  return { documentId, fieldCount: fields.length };
}

/**
 * @param {object} opts
 * @param {string} opts.documentId
 * @param {string} opts.from
 * @param {Array<{email:string,role:string,order?:number}>} opts.to
 * @param {string} [opts.subject] unused on current SignNow plan (personalized invites blocked)
 * @param {string} [opts.message] unused on current SignNow plan (personalized invites blocked)
 */
async function sendInvite({ documentId, from, to }) {
  const doc = await getDocument(documentId);
  const roleMap = Object.fromEntries((doc.roles || []).map((r) => [r.name, r.unique_id]));
  const missingRoles = [];
  const invitees = (to || []).filter((t) => t && t.email && t.role).map((t) => {
    const roleId = roleMap[t.role] || '';
    if (!roleId) missingRoles.push(t.role);
    return {
      email: String(t.email).trim(),
      role: t.role,
      role_id: roleId,
      order: t.order != null ? Number(t.order) : 1,
      reminder: 3,
      expiration_days: 30
    };
  });
  if (!invitees.length) {
    const err = new Error('No SignNow invitees provided');
    err.code = 'SIGNNOW_NO_INVITEES';
    throw err;
  }
  if (missingRoles.length) {
    const err = new Error(
      `SignNow template is missing invite role(s): ${missingRoles.join(', ')}. `
      + `Template roles: ${Object.keys(roleMap).join(', ') || '(none)'}`
    );
    err.code = 'SIGNNOW_ROLE_MISMATCH';
    throw err;
  }
  // Do NOT send custom subject/message — SignNow plan error 65582 rejects personalized invites.
  // Default SignNow email copy is used instead.
  return api('POST', `/document/${documentId}/invite`, {
    document_id: documentId,
    to: invitees,
    from
  });
}

async function downloadDocumentPdf(documentId) {
  const { token, base } = getConfig();
  if (!token) {
    const err = new Error('SignNow is not configured (missing SIGNNOW_ACCESS_TOKEN)');
    err.code = 'SIGNNOW_NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch(`${base}/document/${documentId}/download?type=collapsed`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/pdf'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`SignNow download → ${res.status}: ${String(text).slice(0, 400)}`);
    err.code = 'SIGNNOW_DOWNLOAD_FAILED';
    throw err;
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function isDocumentFullySigned(doc) {
  if (!doc || typeof doc !== 'object') return false;
  const invites = Array.isArray(doc.field_invites) ? doc.field_invites : [];
  if (invites.length) {
    return invites.every((inv) => {
      const s = String(inv.status || inv.status_code || '').toLowerCase();
      return s === 'fulfilled' || s === 'signed' || s === 'completed' || s === 'finished';
    });
  }
  // Fallback heuristics
  const status = String(doc.status || doc.document_status || '').toLowerCase();
  if (status === 'completed' || status === 'complete' || status === 'fulfilled') return true;
  if (doc.signatures && Array.isArray(doc.signatures) && doc.signatures.length > 0 && !invites.length) {
    return true;
  }
  return false;
}

module.exports = {
  getConfig,
  isSignNowConfigured,
  api,
  copyTemplate,
  getDocument,
  applyPrefill,
  sendInvite,
  downloadDocumentPdf,
  isDocumentFullySigned,
  fieldPayloadFromDoc
};
