'use strict';

const fs = require('fs');
const path = require('path');
const {
  getConfig,
  isSignNowConfigured,
  copyTemplate,
  applyPrefill,
  sendInvite,
  getDocument,
  downloadDocumentPdf,
  isDocumentFullySigned
} = require('./signnow-client');

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

/** Street on line 1; city, state zip on line 2 — never stack the full one-line address. */
function propertyLines(deal) {
  const city = slug(deal.city);
  const state = slug(deal.state);
  const zip = slug(deal.zip || deal.postalCode);
  const cityLine = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  let street = slug(deal.address);
  if (street && city && street.toLowerCase().includes(city.toLowerCase())) {
    const cut = street.toLowerCase().lastIndexOf(city.toLowerCase());
    if (cut > 0) street = street.slice(0, cut).replace(/[,\s]+$/, '');
  }
  return { street, cityLine };
}

function propertyLine(deal) {
  const { street, cityLine } = propertyLines(deal);
  if (street && cityLine) return `${street}, ${cityLine}`;
  return street || cityLine || '';
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

function splitAcrossLines(text, count) {
  const raw = slug(text);
  const n = Math.max(1, Number(count) || 1);
  if (!raw) return Array.from({ length: n }, (_, i) => (i === 0 ? '-' : '-'));
  const words = raw.split(/\s+/);
  const lines = Array.from({ length: n }, () => '');
  let i = 0;
  for (const w of words) {
    const cand = lines[i] ? `${lines[i]} ${w}` : w;
    if (cand.length > 90 && i < n - 1) {
      i += 1;
      lines[i] = w;
    } else {
      lines[i] = cand;
    }
  }
  return lines.map((l, idx) => l || (idx === 0 ? raw.slice(0, 90) : '-'));
}

function requireConfigured() {
  if (!isSignNowConfigured()) {
    const err = new Error('SignNow is not configured on this server (SIGNNOW_ACCESS_TOKEN)');
    err.code = 'SIGNNOW_NOT_CONFIGURED';
    throw err;
  }
}

/**
 * Send AOC to Assignor (Brandon) then Assignee (cash buyer).
 */
async function sendAocForDeal(deal, buyer = {}) {
  requireConfigured();
  const tpl = getTemplate('aoc');
  const buyerEntity = slug(buyer.buyerEntity || buyer.cashBuyerName || deal.cashBuyerName);
  const buyerContact = slug(buyer.buyerContactName || buyer.contactName);
  const buyerEmail = slug(buyer.buyerEmail || buyer.email).toLowerCase();
  const buyerPhone = slug(buyer.buyerPhone || buyer.phone);
  const assigneeName = buyerEntity || buyerContact;
  if (!assigneeName) {
    const err = new Error('Buyer name/entity required to send AOC');
    err.code = 'MISSING_BUYER';
    throw err;
  }
  if (!buyerEmail) {
    const err = new Error('Buyer email required to send AOC via SignNow');
    err.code = 'MISSING_BUYER_EMAIL';
    throw err;
  }

  const prop = propertyLine(deal);
  const docName = `AOC — ${prop || deal.dealId}`;
  const documentId = await copyTemplate(tpl.templateId, docName);

  const values = {
    assignor_name: SENDER.entity,
    property_address: prop,
    seller_names: slug(deal.ownerName || deal.sellerNames || deal.ghlContactName),
    assignee_name: assigneeName,
    assignee_email: buyerEmail,
    assignee_phone: buyerPhone,
    assignee_purchase_price: formatMoney(
      buyer.assignmentPurchasePrice != null ? buyer.assignmentPurchasePrice : deal.purchasePrice
    ),
    emd_amount: formatMoney(buyer.buyerEmd != null ? buyer.buyerEmd : deal.buyerEmd),
    closing_date: slug(buyer.closingDate || deal.closingDate || deal.closingDisplay),
    escrow_agent: "Buyer's Choice",
    assignor_signer_name_1: SENDER.name,
    assignor_by_1: SENDER.name,
    assignor_title_1: SENDER.title,
    assignee_signer_name_1: buyerContact || assigneeName,
    additional_terms: slug(buyer.notes)
  };

  await applyPrefill(documentId, values, { skipRoles: [] });

  const subject = `Assignment of Contract — ${prop || 'Property'}`;
  const message = `${SENDER.entity} has sent an Assignment of Contract (AOC) for your review and signature.`;
  const { fromEmail } = getConfig();
  await sendInvite({
    documentId,
    from: fromEmail,
    subject,
    message,
    to: [
      { email: SENDER.email, role: 'Assignor', order: 1 },
      { email: buyerEmail, role: 'Assignee', order: 2 }
    ]
  });

  return {
    status: 'sent',
    documentId,
    documentName: docName,
    templateKey: 'aoc',
    message: `AOC sent via SignNow to ${SENDER.email} (Assignor) and ${buyerEmail} (Assignee).`
  };
}

/**
 * Send JV: address-only prefill; all other fields stay as template defaults.
 * Invites: Wunderhaus Group LLC → Brandon, Green Oasis Solutions LLC → Brad.
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
  await sendInvite({
    documentId,
    from: fromEmail,
    subject,
    message,
    to: [
      { email: SENDER.email, role: WUNDERHAUS_JV_ROLE, order: 1 },
      { email: BRAD.email, role: BRAD.signNowRole, order: 2 }
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

/**
 * Send Amendment (Buyer = Brandon, Seller 1/2 = sellers from payload/deal).
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
  const termLines = splitAcrossLines(terms, termFields.length);
  const values = {
    amendment_date: slug(input.amendmentDate) || todayUs(),
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
    skipRoles: sellers.length < 2 ? ['Seller 2'] : []
  });

  const subject = `Amendment to Purchase Agreement — ${prop || 'Property'}`;
  const message = `${SENDER.entity} has sent an amendment for your review and signature.`;
  const { fromEmail } = getConfig();
  const to = [
    { email: SENDER.email, role: 'Buyer', order: 1 },
    ...sellers.map((s, i) => ({ email: s.email, role: s.role, order: 2 + i }))
  ];
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
    message: `Amendment sent via SignNow to Buyer + ${sellers.map((s) => s.email).join(', ')}.`
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

/**
 * If a pending SignNow doc is fully signed, download PDF into deal documents.
 * @returns {{ ingested: number, pending: array, deal }}
 */
async function ingestSignedSignNowDocuments(deal, { addDealDocument, upsertDeal, patchPending }) {
  requireConfigured();
  const pending = Array.isArray(deal.signNowPending) ? deal.signNowPending.slice() : [];
  if (!pending.length) return { ingested: 0, pending, deal, added: [] };

  let ingested = 0;
  const remaining = [];
  const added = [];

  for (const item of pending) {
    const documentId = slug(item.documentId || item.signNowDocumentId);
    if (!documentId) continue;
    try {
      const doc = await getDocument(documentId);
      if (!isDocumentFullySigned(doc)) {
        remaining.push({
          ...item,
          status: 'awaiting_signatures',
          lastCheckedAt: new Date().toISOString()
        });
        continue;
      }
      const kind = kindFromTemplateKey(item.templateKey) || item.kind || 'other';
      const signedAt = documentSignedAt(doc);
      if (kind === 'jv' || kind === 'jv_agreement') {
        deal = markJvSignedOnDeal(deal, documentId, signedAt);
        if (typeof upsertDeal === 'function') {
          deal = upsertDeal(deal) || deal;
        }
      }
      const already = (deal.documents || []).some(
        (d) => d.signNowDocumentId === documentId || d.id === `sn_${documentId}`
      );
      if (already) {
        ingested += 1;
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
      if (kind === 'jv' || kind === 'jv_agreement') {
        deal = markJvSignedOnDeal(deal, documentId, signedAt);
        if (typeof upsertDeal === 'function') {
          deal = upsertDeal(deal) || deal;
        }
      }
      added.push(result.document);
      ingested += 1;
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

  return { ingested, pending: remaining, deal, added };
}

module.exports = {
  SENDER,
  BRAD,
  WUNDERHAUS_JV_ROLE,
  TEMPLATES,
  isSignNowConfigured,
  propertyLine,
  propertyLines,
  formatMoney,
  todayUs,
  getTemplate,
  sendAocForDeal,
  sendJvForDeal,
  sendAmendmentForDeal,
  sendDocumentForDeal,
  ingestSignedSignNowDocuments,
  kindFromTemplateKey,
  documentSignedAt
};
