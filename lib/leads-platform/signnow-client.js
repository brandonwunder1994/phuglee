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
  /** Roles we complete ourselves: convert signature → text stamp; fill date-like fields. */
  const stampRoles = opts.stampRoles && typeof opts.stampRoles === 'object' ? opts.stampRoles : {};
  /** Never keep SignNow template sample text for property/address fields. */
  const clearTemplatePrefill = /^(property_line_|property_address$|Property Address$|APN$|Legal Description$)/i;
  const fields = [];
  for (const f of doc.fields || []) {
    const a = f.json_attributes || {};
    const name = a.name;
    if (!name) continue;
    if (f.role && skipRoles.has(f.role)) continue;

    const stamp = f.role && stampRoles[f.role] ? stampRoles[f.role] : null;
    const stampName = stamp && stamp.name != null ? String(stamp.name).trim() : '';
    const stampDate = stamp && stamp.date != null ? String(stamp.date).trim() : '';
    const convertToTextStamp = Boolean(
      stamp && (f.type === 'signature' || f.type === 'initials') && stampName
    );

    const item = {
      type: convertToTextStamp ? 'text' : f.type,
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

    if (item.type === 'text') {
      item.font = a.font || 'Arial';
      item.size = a.size || a.font_size || 11;
      const hasKey = Object.prototype.hasOwnProperty.call(valuesByName, name);
      const val = hasKey ? valuesByName[name] : undefined;
      if (convertToTextStamp) {
        item.prefilled_text = stampName;
      } else if (stamp && stampDate && /date|time/i.test(name) && !hasKey) {
        item.prefilled_text = stampDate;
      } else if (stamp && stampName && /signature/i.test(name) && !hasKey) {
        item.prefilled_text = stampName;
      } else if (val !== undefined && val !== null && String(val).length) {
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
 * Read owner-placed signature images + static text stamps from a template/document.
 * Template copy does NOT carry these over — re-apply onto each new document.
 */
function ownerArtifactsFromDoc(doc) {
  const signatures = (doc?.signatures || [])
    .filter((s) => s && s.data)
    .map((s) => ({
      page_number: Number(s.page_number),
      x: Number(s.x),
      y: Number(s.y),
      width: Number(s.width),
      height: Number(s.height),
      data: s.data
    }));
  const texts = (doc?.texts || [])
    .filter((t) => t && t.data != null && String(t.data).length)
    .map((t) => ({
      page_number: Number(t.page_number),
      x: Number(t.x),
      y: Number(t.y),
      width: Number(t.width) || 100,
      height: Number(t.height) || 12,
      data: String(t.data),
      font: t.font || 'Arial',
      size: Number(t.size) || 10
    }));
  return { signatures, texts };
}

/**
 * Stamp owner signature image(s) + static identity texts onto a copied document.
 */
async function applyOwnerArtifacts(documentId, artifacts = {}) {
  const signatures = Array.isArray(artifacts.signatures) ? artifacts.signatures : [];
  const texts = Array.isArray(artifacts.texts) ? artifacts.texts : [];
  if (!signatures.length && !texts.length) {
    return { documentId, signatures: 0, texts: 0 };
  }
  const body = {};
  if (signatures.length) body.signatures = signatures;
  if (texts.length) body.texts = texts;
  await api('PUT', `/document/${documentId}`, body);
  return { documentId, signatures: signatures.length, texts: texts.length };
}

/**
 * Load artifacts from a template id (source of Brandon's baked signature / identity text).
 */
async function loadOwnerArtifactsFromTemplate(templateId) {
  const doc = await getDocument(templateId);
  return ownerArtifactsFromDoc(doc);
}

/**
 * Prefill a document for a "skip this role" send:
 * - Values for `stampRole` become owner text stamps (always visible, no live signer)
 * - Those role fields are removed so they don't sit under the stamps (blurry double text)
 * - Other roles keep normal field prefills
 * - Optional owner artifacts (signature image + identity texts) applied in the same write
 *
 * @param {string} documentId
 * @param {object} valuesByName
 * @param {{ stampRole: string, artifacts?: { signatures?: object[], texts?: object[] } }} opts
 */
async function applyPrefillStampingRole(documentId, valuesByName = {}, opts = {}) {
  const stampRole = String(opts.stampRole || '').trim();
  if (!stampRole) {
    return applyPrefill(documentId, valuesByName, opts);
  }
  const doc = await getDocument(documentId);
  const keepFields = [];
  const stampedTexts = [];

  for (const f of doc.fields || []) {
    const a = f.json_attributes || {};
    const name = a.name;
    if (!name) continue;

    const hasKey = Object.prototype.hasOwnProperty.call(valuesByName, name);
    const rawVal = hasKey ? valuesByName[name] : undefined;
    const val = rawVal !== undefined && rawVal !== null ? String(rawVal) : '';

    if (f.role === stampRole && f.type === 'text') {
      if (val) {
        stampedTexts.push({
          page_number: a.page_number,
          x: a.x,
          y: a.y,
          width: a.width || 100,
          height: Math.max(Number(a.height) || 12, 12),
          data: val,
          font: a.font || 'Arial',
          size: Number(a.size || a.font_size || 10) || 10
        });
      }
      // Drop the live field — prevents double-render under the stamp.
      continue;
    }

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
      if (val) item.prefilled_text = val;
      else if (hasKey) item.prefilled_text = '';
      else if (a.prefilled_text) item.prefilled_text = a.prefilled_text;
    }
    keepFields.push(item);
  }

  const artifacts = opts.artifacts && typeof opts.artifacts === 'object' ? opts.artifacts : {};
  const identityTexts = Array.isArray(artifacts.texts) ? artifacts.texts : [];
  const signatures = Array.isArray(artifacts.signatures) ? artifacts.signatures : [];
  const body = {
    document_name: doc.document_name,
    fields: keepFields,
    texts: [...identityTexts, ...stampedTexts]
  };
  if (signatures.length) body.signatures = signatures;

  await api('PUT', `/document/${documentId}`, body);
  return {
    documentId,
    fieldCount: keepFields.length,
    stampedTextCount: stampedTexts.length,
    identityTextCount: identityTexts.length,
    signatureCount: signatures.length
  };
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

function isInvitePending(inv) {
  const s = String(inv?.status || inv?.status_code || '').toLowerCase();
  if (!s) return true;
  return !(s === 'fulfilled' || s === 'signed' || s === 'completed' || s === 'finished' || s === 'canceled' || s === 'cancelled');
}

/**
 * Resolve the field_request_id SignNow expects for PUT /fieldinvite/{id}/resend.
 * Prefer document.fields[].field_request_id for the invite's role (not field_invites[].id).
 */
function fieldRequestIdForInvite(doc, inv) {
  const roleId = String(inv?.role_id || inv?.roleId || '').trim();
  const roleName = String(inv?.role || '').trim();
  const email = String(inv?.email || '').trim().toLowerCase();
  const fields = Array.isArray(doc?.fields) ? doc.fields : [];
  for (const f of fields) {
    const fr = String(f.field_request_id || f.fieldRequestId || '').trim();
    if (!fr) continue;
    const fRoleId = String(f.role_id || f.roleId || '').trim();
    const fRole = String(f.role || '').trim();
    if (roleId && fRoleId && roleId === fRoleId) return fr;
    if (roleName && fRole && roleName === fRole) return fr;
  }
  const direct = String(inv?.field_request_id || inv?.fieldRequestId || '').trim();
  if (direct) return direct;
  // Last resort — some tenants accept invite id; prefer failing with a clear list over silent skip.
  return String(inv?.id || '').trim() || null;
}

function listPendingSignNowInvitees(doc) {
  const invites = Array.isArray(doc?.field_invites) ? doc.field_invites : [];
  return invites.filter(isInvitePending).map((inv) => ({
    email: String(inv.email || '').trim().toLowerCase(),
    role: String(inv.role || '').trim(),
    roleId: String(inv.role_id || inv.roleId || '').trim(),
    status: String(inv.status || inv.status_code || 'pending'),
    fieldRequestId: fieldRequestIdForInvite(doc, inv)
  })).filter((row) => row.email);
}

/**
 * Resend SignNow invite email for one pending field request.
 * @see https://www.signnow.com/developers/features/resend-a-document-for-signing-using-api
 */
async function resendFieldInvite(fieldRequestId) {
  const id = String(fieldRequestId || '').trim();
  if (!id) {
    const err = new Error('Missing SignNow field_request_id for reminder');
    err.code = 'SIGNNOW_MISSING_FIELD_REQUEST';
    throw err;
  }
  return api('PUT', `/fieldinvite/${encodeURIComponent(id)}/resend`, {});
}

/**
 * Remind everyone on a document who has not signed yet.
 * @returns {{ reminded: Array<{email,role}>, failed: Array<{email,role,error}>, pendingCount: number, fullySigned: boolean }}
 */
async function remindUnsignedInvitees(documentId) {
  const doc = await getDocument(documentId);
  if (isDocumentFullySigned(doc)) {
    return { reminded: [], failed: [], pendingCount: 0, fullySigned: true };
  }
  const pending = listPendingSignNowInvitees(doc);
  if (!pending.length) {
    return { reminded: [], failed: [], pendingCount: 0, fullySigned: false };
  }
  const reminded = [];
  const failed = [];
  for (const row of pending) {
    if (!row.fieldRequestId) {
      failed.push({ email: row.email, role: row.role, error: 'No field_request_id on invite' });
      continue;
    }
    try {
      await resendFieldInvite(row.fieldRequestId);
      reminded.push({ email: row.email, role: row.role });
    } catch (err) {
      failed.push({ email: row.email, role: row.role, error: err.message || 'Remind failed' });
    }
  }
  return { reminded, failed, pendingCount: pending.length, fullySigned: false };
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

async function getDocumentHistory(documentId) {
  const id = String(documentId || '').trim();
  if (!id) return [];
  try {
    const data = await api('GET', `/document/${encodeURIComponent(id)}/historyfull`);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.history)) return data.history;
    return [];
  } catch (_) {
    // Older tenants sometimes only expose /history
    try {
      const data = await api('GET', `/document/${encodeURIComponent(id)}/history`);
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.history)) return data.history;
      return [];
    } catch (__) {
      return [];
    }
  }
}

function inviteStatusLooksOpened(status) {
  const s = String(status || '').toLowerCase();
  if (!s) return false;
  // Opened / viewed / accessed — and signed states imply they opened first.
  return /open|view|read|access|fulfill|signed|complete|finish/.test(s);
}

/**
 * Detect whether a counterparty (not team) has opened or progressed on a SignNow invite.
 * Uses field_invite status + audit history open/view events.
 * @param {object} doc
 * @param {object[]} [history]
 * @param {{ teamEmails?: string[] }} [opts]
 * @returns {{ opened: boolean, byEmail: string|null, source: string|null }}
 */
function detectCounterpartyOpened(doc, history = [], opts = {}) {
  const team = new Set(
    (opts.teamEmails || [])
      .map((e) => String(e || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const isTeam = (email) => team.has(String(email || '').trim().toLowerCase());

  const invites = Array.isArray(doc?.field_invites) ? doc.field_invites : [];
  for (const inv of invites) {
    const email = String(inv.email || '').trim().toLowerCase();
    if (!email || isTeam(email)) continue;
    if (inviteStatusLooksOpened(inv.status || inv.status_code)) {
      return { opened: true, byEmail: email, source: 'invite_status' };
    }
  }

  const events = Array.isArray(history) ? history : [];
  for (const ev of events) {
    const eventName = String(ev.event || ev.action || ev.type || '').toLowerCase();
    if (!/open|view/.test(eventName)) continue;
    const email = String(ev.email || '').trim().toLowerCase();
    if (email && isTeam(email)) continue;
    // Owner-only system events without email — skip; wait for a counterparty signal.
    if (!email) continue;
    return { opened: true, byEmail: email, source: 'history' };
  }

  return { opened: false, byEmail: null, source: null };
}

module.exports = {
  getConfig,
  isSignNowConfigured,
  api,
  copyTemplate,
  getDocument,
  getDocumentHistory,
  applyPrefill,
  applyPrefillStampingRole,
  ownerArtifactsFromDoc,
  applyOwnerArtifacts,
  loadOwnerArtifactsFromTemplate,
  sendInvite,
  downloadDocumentPdf,
  isDocumentFullySigned,
  fieldPayloadFromDoc,
  isInvitePending,
  fieldRequestIdForInvite,
  listPendingSignNowInvitees,
  resendFieldInvite,
  remindUnsignedInvitees,
  inviteStatusLooksOpened,
  detectCounterpartyOpened
};
