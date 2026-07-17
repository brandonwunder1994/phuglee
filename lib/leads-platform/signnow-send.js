'use strict';

const fs = require('fs');
const path = require('path');
const {
  getConfig,
  isSignNowConfigured,
  copyTemplate,
  applyPrefill,
  loadOwnerArtifactsFromTemplate,
  applyOwnerArtifacts,
  sendInvite,
  getDocument,
  getDocumentHistory,
  downloadDocumentPdf,
  isDocumentFullySigned,
  detectCounterpartyOpened,
  remindUnsignedInvitees
} = require('./signnow-client');
const { resolveDealPropertyAddress } = require('./deal-property-address');

const TEMPLATES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'signnow-templates.json'), 'utf8')
);

const SENDER = {
  entity: 'Wunderhaus Group LLC',
  name: 'Brandon Wunder',
  email: 'brandon@wunderhausgroup.com',
  title: 'Managing Member'
};

const BRAD = {
  name: 'Bradley Lewis',
  company: 'Green Oasis Solutions LLC',
  email: 'buyhomes995@gmail.com',
  /** SignNow invite role name on the JV template (must match exactly). */
  signNowRole: 'Green Oasis Solutions LLC'
};

const WUNDERHAUS_JV_ROLE = 'Wunderhaus Group LLC';

function slug(v) {
  return String(v == null ? '' : v).trim();
}

function todayUs() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}

function formatMoney(v) {
  if (v === undefined || v === null || v === '') return '';
  const s = String(v).trim();
  if (s.startsWith('$')) return s;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(n)) return s;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  });
}

/** Street on line 1; city, state zip on line 2 — always from deal + linked lead. */
function loadLinkedLead(deal) {
  const leadId = slug(deal?.leadId);
  if (!leadId) return null;
  try {
    const { getLead } = require('./store');
    return getLead(leadId);
  } catch (_) {
    return null;
  }
}

function propertyLines(deal) {
  const resolved = resolveDealPropertyAddress(deal, loadLinkedLead(deal));
  return { street: resolved.street, cityLine: resolved.cityLine, resolved };
}

function propertyLine(deal) {
  const { resolved } = propertyLines(deal);
  return resolved.propertyLine || '';
}

function getTemplate(key) {
  const t = TEMPLATES[key];
  if (!t?.templateId) {
    const err = new Error(`Unknown SignNow template: ${key}`);
    err.code = 'SIGNNOW_UNKNOWN_TEMPLATE';
    throw err;
  }
  return t;
}

/** Default chars when SignNow field width is unknown — fill near a full line. */
const DEFAULT_TERM_FIELD_CHARS = 110;

/**
 * Estimate how many characters fit in a SignNow text field from its box size.
 * Packs close to full width so terms read as one continuous block per line.
 */
function estimateTextFieldCapacity(attr = {}) {
  const width = Number(attr.width) || 0;
  const height = Number(attr.height) || 0;
  const fontSize = Number(attr.size || attr.font_size || 11) || 11;
  // Arial average glyph ≈ 0.5em; 0.5 packs fuller than the old hard 90-char wrap.
  const avgChar = Math.max(4, fontSize * 0.5);
  const charsPerLine = width > 0
    ? Math.max(24, Math.floor(width / avgChar))
    : DEFAULT_TERM_FIELD_CHARS;
  const lineH = fontSize * 1.25;
  const lines = height > lineH * 1.6
    ? Math.max(1, Math.floor(height / lineH))
    : 1;
  return Math.max(24, charsPerLine * lines);
}

function capacitiesForNamedFields(doc, fieldNames, fallback = DEFAULT_TERM_FIELD_CHARS) {
  const byName = new Map();
  for (const f of doc?.fields || []) {
    const a = f.json_attributes || {};
    if (a.name) byName.set(String(a.name), a);
  }
  return fieldNames.map((name) => {
    const a = byName.get(name);
    return a ? estimateTextFieldCapacity(a) : fallback;
  });
}

/**
 * Fill fields top-to-bottom: pack each to its capacity, then spill to the next.
 * @param {string} text
 * @param {number|number[]} countOrCaps — field count, or per-field max chars
 */
function splitAcrossLines(text, countOrCaps) {
  const raw = slug(text).replace(/\s+/g, ' ');
  const caps = Array.isArray(countOrCaps)
    ? countOrCaps.map((n) => Math.max(1, Number(n) || DEFAULT_TERM_FIELD_CHARS))
    : Array.from(
      { length: Math.max(1, Number(countOrCaps) || 1) },
      () => DEFAULT_TERM_FIELD_CHARS
    );
  const n = caps.length;
  if (!raw) return Array.from({ length: n }, () => '');

  const lines = Array.from({ length: n }, () => '');
  const words = raw.split(' ').filter(Boolean);
  let i = 0;

  function placeHard(str) {
    let rest = str;
    while (rest && i < n) {
      const max = caps[i];
      const room = max - (lines[i] ? lines[i].length + (lines[i] ? 1 : 0) : 0);
      if (room <= 0) {
        if (i >= n - 1) {
          lines[i] = lines[i] ? `${lines[i]} ${rest}` : rest;
          return;
        }
        i += 1;
        continue;
      }
      if (rest.length <= room) {
        lines[i] = lines[i] ? `${lines[i]} ${rest}` : rest;
        return;
      }
      const chunk = rest.slice(0, room);
      lines[i] = lines[i] ? `${lines[i]} ${chunk}` : chunk;
      rest = rest.slice(room);
      if (i < n - 1) i += 1;
      else {
        lines[i] = `${lines[i]}${rest}`;
        return;
      }
    }
  }

  for (const w of words) {
    const max = caps[i];
    const cand = lines[i] ? `${lines[i]} ${w}` : w;
    if (cand.length <= max) {
      lines[i] = cand;
      continue;
    }
    if (i < n - 1) {
      if (!lines[i]) {
        placeHard(w);
      } else {
        i += 1;
        if (w.length <= caps[i]) lines[i] = w;
        else placeHard(w);
      }
      continue;
    }
    // Last field — keep appending (do not drop remainder).
    lines[i] = cand;
  }
  return lines;
}

function requireConfigured() {
  if (!isSignNowConfigured()) {
    const err = new Error('SignNow is not configured on this server (SIGNNOW_ACCESS_TOKEN)');
    err.code = 'SIGNNOW_NOT_CONFIGURED';
    throw err;
  }
}

/**
 * Send AOC via SignNow.
 * Prefills Brad's deal fields, stamps Brandon's real Assignor signature + send date,
 * invites Assignee (buyer) only — Brandon stays out of the loop.
 */
async function sendAocForDeal(deal, input = {}) {
  requireConfigured();
  const tpl = getTemplate('aoc');
  const buyerEmail = slug(input.buyerEmail || input.email || deal.aocSend?.buyerEmail).toLowerCase();
  if (!buyerEmail) {
    const err = new Error('Buyer email is required to send AOC');
    err.code = 'MISSING_BUYER_EMAIL';
    throw err;
  }

  const prop = propertyLine(deal);
  if (!prop) {
    const err = new Error('Deal needs a property address before sending AOC');
    err.code = 'MISSING_PROPERTY_ADDRESS';
    throw err;
  }

  const sendDate = todayUs();
  const additionalTerms = slug(input.additionalTerms || input.notes) || 'NA';
  const docName = `AOC - ${prop}`;

  // Pull Brandon's baked signature + identity texts from the template BEFORE copy
  // (SignNow copy does not carry owner signatures/texts onto the new document).
  const ownerArtifacts = await loadOwnerArtifactsFromTemplate(tpl.templateId);
  if (!ownerArtifacts.signatures.length) {
    const err = new Error(
      'AOC template is missing Brandon\'s Assignor signature. Open the AOC template in SignNow and place your signature, then try again.'
    );
    err.code = 'AOC_MISSING_ASSIGNOR_SIGNATURE';
    throw err;
  }

  const documentId = await copyTemplate(tpl.templateId, docName);

  const values = {
    'Property Address': prop,
    'Legal Description': slug(input.legalDescription),
    APN: slug(input.apn),
    'Assignee Purchase Price': formatMoney(input.assigneePurchasePrice),
    'Title Company Name': slug(input.titleCompanyName),
    'Title Company Address': slug(input.titleCompanyAddress),
    'Escrow Officer Name': slug(input.escrowOfficerName),
    'Title Company Email': slug(input.titleCompanyEmail).toLowerCase(),
    'Assignee EMD': formatMoney(input.buyerEmd != null ? input.buyerEmd : input.assigneeEmd),
    COE: slug(input.closingDate || input.coe),
    'Additional Terms': additionalTerms,
    // Invite target — buyer still fills name/address/phone + signature-page fields themselves.
    'Assignee Email': buyerEmail,
    // Assignor date = send day (signature image applied separately below).
    'Assignor Signature Field': sendDate
  };

  const missing = [
    ['Legal Description', values['Legal Description']],
    ['APN', values.APN],
    ['Assignee Purchase Price', values['Assignee Purchase Price']],
    ['Title Company Name', values['Title Company Name']],
    ['Title Company Address', values['Title Company Address']],
    ['Escrow Officer Name', values['Escrow Officer Name']],
    ['Title Company Email', values['Title Company Email']],
    ['Assignee EMD', values['Assignee EMD']],
    ['COE', values.COE]
  ].filter(([, v]) => !slug(v));
  if (missing.length) {
    const err = new Error(`Missing AOC fields: ${missing.map(([k]) => k).join(', ')}`);
    err.code = 'MISSING_AOC_FIELDS';
    throw err;
  }

  await applyPrefill(documentId, values);
  await applyOwnerArtifacts(documentId, ownerArtifacts);

  const subject = `AOC - ${prop}`;
  const message = `${SENDER.entity} has sent an Assignment of Contract (AOC) for ${prop}.`;
  const { fromEmail } = getConfig();
  await sendInvite({
    documentId,
    from: fromEmail,
    subject,
    message,
    to: [
      { email: buyerEmail, role: 'Assignee', order: 1 }
    ]
  });

  return {
    status: 'sent',
    documentId,
    documentName: docName,
    templateKey: 'aoc',
    assignorDate: sendDate,
    assignorSigned: true,
    invitees: [
      { role: 'Assignee', email: buyerEmail }
    ],
    message: `AOC sent via SignNow to ${buyerEmail} (Assignee). Assignor signature + ${sendDate} applied automatically.`
  };
}

/**
 * Resend SignNow invite emails to everyone who has not signed the existing AOC yet.
 */
async function remindAocUnsigned(deal) {
  requireConfigured();
  const documentId = slug(deal?.aocSend?.signNowDocumentId);
  if (!documentId) {
    const err = new Error('No AOC SignNow document on this deal — send the AOC first');
    err.code = 'AOC_NOT_SENT';
    throw err;
  }
  const result = await remindUnsignedInvitees(documentId);
  if (result.fullySigned) {
    return {
      status: 'signed',
      documentId,
      reminded: [],
      failed: [],
      message: 'AOC is already fully signed — nothing to remind'
    };
  }
  if (!result.pendingCount) {
    return {
      status: 'sent',
      documentId,
      reminded: [],
      failed: [],
      message: 'No pending AOC signers found to remind'
    };
  }
  if (!result.reminded.length && result.failed.length) {
    const err = new Error(
      `AOC reminder failed: ${result.failed.map((f) => `${f.email} (${f.error})`).join('; ')}`
    );
    err.code = 'SIGNNOW_REMIND_FAILED';
    err.details = result;
    throw err;
  }
  const who = result.reminded.map((r) => `${r.email}${r.role ? ` (${r.role})` : ''}`).join(', ');
  const failNote = result.failed.length
    ? ` (${result.failed.length} failed: ${result.failed.map((f) => f.email).join(', ')})`
    : '';
  return {
    status: 'reminded',
    documentId,
    reminded: result.reminded,
    failed: result.failed,
    message: `AOC reminder sent to ${who || 'pending signers'}${failNote}`
  };
}

/**
 * Send JV: address-only prefill; all other fields stay as template defaults.
 * Invites (parallel): Wunderhaus Group LLC → Brandon and Green Oasis Solutions LLC → Brad
 * both get the email at the same time (same SignNow order).
 */
async function sendJvForDeal(deal) {
  requireConfigured();
  const tpl = getTemplate('jv');
  const { street, cityLine } = propertyLines(deal);
  if (!street && !cityLine) {
    const err = new Error('Deal needs a property address before sending JV');
    err.code = 'MISSING_PROPERTY_ADDRESS';
    throw err;
  }
  const prop = propertyLine(deal);
  const docName = prop ? `JV for ${prop}` : `JV for ${deal.dealId || 'property'}`;
  const documentId = await copyTemplate(tpl.templateId, docName);

  // Address only — leave company, emails, %, titles, signer names on the template.
  await applyPrefill(documentId, {
    property_line_1: street,
    property_line_2: cityLine
  });

  const subject = prop ? `JV for ${prop}` : 'JV for property';
  const message = `JV agreement between ${SENDER.entity} and ${BRAD.company} for ${prop || 'this property'}.`;
  const { fromEmail } = getConfig();
  // Same order → SignNow emails both parties at once (not sequential).
  await sendInvite({
    documentId,
    from: fromEmail,
    subject,
    message,
    to: [
      { email: SENDER.email, role: WUNDERHAUS_JV_ROLE, order: 1 },
      { email: BRAD.email, role: BRAD.signNowRole, order: 1 }
    ]
  });

  return {
    status: 'sent',
    documentId,
    documentName: docName,
    templateKey: 'jv',
    parties: { sales: SENDER, dispos: BRAD },
    invitees: [
      { role: WUNDERHAUS_JV_ROLE, email: SENDER.email },
      { role: BRAD.signNowRole, email: BRAD.email }
    ],
    message: `JV sent via SignNow to ${SENDER.email} (${WUNDERHAUS_JV_ROLE}) and ${BRAD.email} (${BRAD.signNowRole}).`
  };
}

function documentSignedAt(doc) {
  const invites = Array.isArray(doc?.field_invites) ? doc.field_invites : [];
  let latest = 0;
  for (const inv of invites) {
    const raw = inv.updated || inv.status_changed || inv.fulfilled || inv.created || null;
    const ms = raw ? Date.parse(raw) : NaN;
    if (!Number.isNaN(ms) && ms > latest) latest = ms;
  }
  if (latest) return new Date(latest).toISOString();
  return new Date().toISOString();
}

function markJvSignedOnDeal(deal, documentId, signedAt) {
  const prev = deal.jvAgreement && typeof deal.jvAgreement === 'object' ? deal.jvAgreement : {};
  return {
    ...deal,
    jvAgreement: {
      ...prev,
      status: 'signed',
      signedAt: signedAt || new Date().toISOString(),
      signNowDocumentId: documentId || prev.signNowDocumentId || null,
      lastError: null
    }
  };
}

function markKindSignedOnDeal(deal, kind, documentId, signedAt) {
  const k = String(kind || '').toLowerCase();
  if (k === 'jv' || k === 'jv_agreement') {
    return markJvSignedOnDeal(deal, documentId, signedAt);
  }
  if (k === 'aoc' || k === 'assignment') {
    const prev = deal.aocSend && typeof deal.aocSend === 'object' ? deal.aocSend : {};
    return {
      ...deal,
      aocSend: {
        ...prev,
        status: 'signed',
        signedAt: signedAt || new Date().toISOString(),
        signNowDocumentId: documentId || prev.signNowDocumentId || null,
        lastError: null
      }
    };
  }
  if (k === 'amendment' || k === 'addendum') {
    const prev = deal.amendmentSend && typeof deal.amendmentSend === 'object' ? deal.amendmentSend : {};
    return {
      ...deal,
      amendmentSend: {
        ...prev,
        status: 'signed',
        signedAt: signedAt || new Date().toISOString(),
        signNowDocumentId: documentId || prev.signNowDocumentId || null,
        lastError: null
      }
    };
  }
  return deal;
}

/**
 * Send Amendment via SignNow.
 * Buyer (Brandon) date + signature are stamped — sellers are the only invitees.
 */
async function sendAmendmentForDeal(deal, input = {}) {
  requireConfigured();
  const terms = slug(input.amendmentTerms || input.terms);
  if (!terms) {
    const err = new Error('Amendment terms are required');
    err.code = 'MISSING_AMENDMENT_TERMS';
    throw err;
  }

  let sellers = Array.isArray(input.sellers) ? input.sellers.filter(Boolean) : [];
  if (!sellers.length) {
    const name = slug(input.sellerName || deal.ownerName || deal.sellerNames);
    const email = slug(input.sellerEmail || deal.ownerEmail || deal.email).toLowerCase();
    if (name && email) sellers = [{ name, email }];
  }
  sellers = sellers.map((s, i) => ({
    name: slug(s.name),
    email: slug(s.email).toLowerCase(),
    role: i === 0 ? 'Seller 1' : 'Seller 2'
  })).filter((s) => s.name && s.email);
  if (!sellers.length) {
    const err = new Error('Seller name + email required to send an amendment');
    err.code = 'MISSING_SELLERS';
    throw err;
  }

  // PSA signed date only — ignore any client-supplied override
  const originalAgreementDate = slug(
    deal.originalAgreementDate
      || deal.agreementDate
      || deal.contractDate
  );
  if (!originalAgreementDate) {
    const err = new Error('Original agreement date is required (missing on deal and GHL signed date)');
    err.code = 'MISSING_ORIGINAL_DATE';
    throw err;
  }

  const sendDate = todayUs();
  const prop = slug(input.propertyAddress) || propertyLine(deal);
  const tpl = getTemplate('amendment');
  const docName = `Amendment — ${prop || deal.dealId}`;
  const documentId = await copyTemplate(tpl.templateId, docName);

  const termFields = [
    'amendment_terms',
    'Text Field 1',
    'Text Field 2',
    'Text Field 3',
    'Text Field 4'
  ];
  // Measure real SignNow field widths so notes fill each line before wrapping.
  let termCaps = termFields.map(() => DEFAULT_TERM_FIELD_CHARS);
  try {
    const doc = await getDocument(documentId);
    termCaps = capacitiesForNamedFields(doc, termFields);
  } catch (_) { /* fall back to default line length */ }
  const termLines = splitAcrossLines(terms, termCaps);
  const values = {
    amendment_date: slug(input.amendmentDate) || sendDate,
    buyer_date: sendDate,
    original_agreement_date: originalAgreementDate,
    property_address: prop,
    seller_names: sellers.map((s) => s.name).join(' / '),
    seller_1_name: sellers[0]?.name || '',
    seller_2_name: sellers[1]?.name || '',
    buyer_entity: SENDER.entity
  };
  termFields.forEach((name, i) => {
    values[name] = termLines[i] || '-';
  });

  await applyPrefill(documentId, values, {
    skipRoles: sellers.length < 2 ? ['Seller 2'] : [],
    stampRoles: {
      Buyer: { name: SENDER.name, date: sendDate }
    }
  });

  const subject = `Amendment to Purchase Agreement — ${prop || 'Property'}`;
  const message = `${SENDER.entity} has sent an amendment for your review and signature.`;
  const { fromEmail } = getConfig();
  const to = sellers.map((s, i) => ({ email: s.email, role: s.role, order: 1 + i }));
  await sendInvite({
    documentId,
    from: fromEmail,
    subject,
    message,
    to
  });

  return {
    status: 'sent',
    documentId,
    documentName: docName,
    templateKey: 'amendment',
    sellers,
    message: `Amendment sent via SignNow to ${sellers.map((s) => s.email).join(', ')}. Buyer (${SENDER.name}) already stamped.`
  };
}

/**
 * Map UI doc kind → SignNow send.
 */
async function sendDocumentForDeal(deal, kind, input = {}) {
  const k = String(kind || '').trim().toLowerCase();
  if (k === 'aoc' || k === 'assignment') return sendAocForDeal(deal, input);
  if (k === 'jv' || k === 'jv_agreement') return sendJvForDeal(deal);
  if (k === 'amendment' || k === 'addendum') return sendAmendmentForDeal(deal, input);
  const err = new Error(`Unsupported document type for SignNow send: ${kind}`);
  err.code = 'UNSUPPORTED_DOC_KIND';
  throw err;
}

function kindFromTemplateKey(key) {
  if (key === 'aoc') return 'aoc';
  if (key === 'jv') return 'jv';
  if (key === 'amendment') return 'amendment';
  if (key === 'cash') return 'purchase_contract';
  return 'other';
}

/** Team emails — opens by us should not trigger "opened" alerts. */
function teamSignerEmails() {
  return [SENDER.email, BRAD.email].map((e) => String(e).toLowerCase());
}

/** JV alerts are skipped — Brandon/Brad already know. */
function shouldNotifySignNowKind(kind, templateKey) {
  const k = String(kind || templateKey || '').toLowerCase();
  if (!k) return false;
  if (k === 'jv' || k === 'jv_agreement') return false;
  return true;
}

async function maybeAlertSignNowLifecycle(deal, item, { opened, signed, openedByEmail }) {
  if (!shouldNotifySignNowKind(item.kind, item.templateKey)) {
    return { openedAlertedAt: item.openedAlertedAt || null, signedAlertedAt: item.signedAlertedAt || null };
  }
  let openedAlertedAt = item.openedAlertedAt || null;
  let signedAlertedAt = item.signedAlertedAt || null;
  const kind = kindFromTemplateKey(item.templateKey) || item.kind || 'other';

  function alertLanded(out) {
    if (!out || out.skipped) return false;
    return (out.sent || []).some((r) => r && r.ok);
  }

  try {
    const teamNotify = require('./team-notify');
    if (opened && !openedAlertedAt && !signed) {
      const out = await teamNotify.alertSignNowOpened({
        deal,
        kind,
        openedByEmail: openedByEmail || item.openedByEmail || null
      });
      if (alertLanded(out)) {
        openedAlertedAt = new Date().toISOString();
      }
    }
    if (signed && !signedAlertedAt) {
      const out = await teamNotify.alertSignNowSigned({ deal, kind });
      if (alertLanded(out)) {
        signedAlertedAt = new Date().toISOString();
      }
    }
  } catch (err) {
    console.warn('[signnow] team alert failed:', err.message);
  }
  return { openedAlertedAt, signedAlertedAt };
}

/**
 * If a pending SignNow doc is fully signed, download PDF into deal documents.
 * Also texts/emails the team when a non-JV package is opened or fully signed.
 * @returns {{ ingested: number, pending: array, deal, added: array, alerts: array }}
 */
async function ingestSignedSignNowDocuments(deal, { addDealDocument, upsertDeal, patchPending }) {
  requireConfigured();
  const pending = Array.isArray(deal.signNowPending) ? deal.signNowPending.slice() : [];
  if (!pending.length) return { ingested: 0, pending, deal, added: [], alerts: [] };

  let ingested = 0;
  const remaining = [];
  const added = [];
  const alerts = [];

  for (const item of pending) {
    const documentId = slug(item.documentId || item.signNowDocumentId);
    if (!documentId) continue;
    try {
      const doc = await getDocument(documentId);
      const kind = kindFromTemplateKey(item.templateKey) || item.kind || 'other';
      const notify = shouldNotifySignNowKind(kind, item.templateKey);
      let nextItem = {
        ...item,
        kind,
        lastCheckedAt: new Date().toISOString()
      };

      let openedInfo = { opened: false, byEmail: null, source: null };
      if (notify && !item.openedAlertedAt) {
        let history = [];
        try {
          history = await getDocumentHistory(documentId);
        } catch (_) {
          history = [];
        }
        openedInfo = detectCounterpartyOpened(doc, history, { teamEmails: teamSignerEmails() });
        if (openedInfo.opened) {
          nextItem.openedAt = nextItem.openedAt || new Date().toISOString();
          nextItem.openedByEmail = openedInfo.byEmail || nextItem.openedByEmail || null;
        }
      } else if (item.openedAt || item.openedAlertedAt) {
        openedInfo = { opened: true, byEmail: item.openedByEmail || null, source: 'cached' };
      }

      const fullySigned = isDocumentFullySigned(doc);

      if (!fullySigned) {
        const alertMarks = await maybeAlertSignNowLifecycle(deal, nextItem, {
          opened: openedInfo.opened,
          signed: false,
          openedByEmail: openedInfo.byEmail
        });
        if (alertMarks.openedAlertedAt && !item.openedAlertedAt) {
          alerts.push({ type: 'opened', documentId, kind });
        }
        remaining.push({
          ...nextItem,
          status: openedInfo.opened ? 'opened' : 'awaiting_signatures',
          openedAlertedAt: alertMarks.openedAlertedAt,
          signedAlertedAt: alertMarks.signedAlertedAt
        });
        continue;
      }

      const signedAt = documentSignedAt(doc);
      deal = markKindSignedOnDeal(deal, kind, documentId, signedAt);
      if (typeof upsertDeal === 'function') {
        deal = upsertDeal(deal) || deal;
      }

      const alertMarks = await maybeAlertSignNowLifecycle(deal, nextItem, {
        opened: Boolean(openedInfo.opened),
        signed: true,
        openedByEmail: openedInfo.byEmail
      });
      if (alertMarks.signedAlertedAt && !item.signedAlertedAt) {
        alerts.push({ type: 'signed', documentId, kind });
      }
      nextItem = {
        ...nextItem,
        status: 'signed',
        openedAlertedAt: alertMarks.openedAlertedAt || nextItem.openedAlertedAt,
        signedAlertedAt: alertMarks.signedAlertedAt
      };

      const already = (deal.documents || []).some(
        (d) => d.signNowDocumentId === documentId || d.id === `sn_${documentId}`
      );
      if (already) {
        ingested += 1;
        // Retry signed alert later if GHL was down this pass.
        if (notify && !nextItem.signedAlertedAt) {
          remaining.push(nextItem);
        }
        continue;
      }
      const buf = await downloadDocumentPdf(documentId);
      const name = slug(item.documentName || doc.document_name) || `Signed ${kind}.pdf`;
      const result = addDealDocument(deal.dealId, {
        id: `sn_${documentId}`,
        kind: kind === 'aoc' ? 'aoc' : kind,
        name: name.endsWith('.pdf') ? name : `${name}.pdf`,
        mimeType: 'application/pdf',
        buffer: buf,
        source: 'signnow',
        signNowDocumentId: documentId,
        label: item.templateKey || kind
      });
      deal = result.deal;
      deal = markKindSignedOnDeal(deal, kind, documentId, signedAt);
      if (typeof upsertDeal === 'function') {
        deal = upsertDeal(deal) || deal;
      }
      added.push(result.document);
      ingested += 1;
      if (notify && !nextItem.signedAlertedAt) {
        remaining.push(nextItem);
      }
    } catch (err) {
      remaining.push({
        ...item,
        status: 'error',
        lastError: err.message,
        lastCheckedAt: new Date().toISOString()
      });
    }
  }

  if (typeof patchPending === 'function') {
    deal = patchPending(deal.dealId, remaining) || deal;
  } else if (typeof upsertDeal === 'function') {
    deal = upsertDeal({ ...deal, signNowPending: remaining });
  }

  return { ingested, pending: remaining, deal, added, alerts };
}

module.exports = {
  SENDER,
  BRAD,
  WUNDERHAUS_JV_ROLE,
  TEMPLATES,
  DEFAULT_TERM_FIELD_CHARS,
  isSignNowConfigured,
  propertyLine,
  propertyLines,
  formatMoney,
  todayUs,
  getTemplate,
  splitAcrossLines,
  estimateTextFieldCapacity,
  capacitiesForNamedFields,
  sendAocForDeal,
  remindAocUnsigned,
  sendJvForDeal,
  sendAmendmentForDeal,
  sendDocumentForDeal,
  ingestSignedSignNowDocuments,
  kindFromTemplateKey,
  documentSignedAt,
  shouldNotifySignNowKind,
  teamSignerEmails
};
