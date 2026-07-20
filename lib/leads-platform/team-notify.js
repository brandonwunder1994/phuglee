'use strict';

/**
 * Team SMS + email alerts for Contract Tracker events.
 */

const fs = require('fs');
const path = require('path');
const { catalogRoot } = require('./store');
const ghl = require('./ghl-client');
const {
  TEAM,
  getTeamMember,
  otherTeamMember,
  allTeamMembers,
  normalizeTeamUser
} = require('./team-contacts');

function cachePath() {
  return path.join(catalogRoot(), 'contracts', 'team-ghl-contacts.json');
}

function readContactCache() {
  try {
    if (!fs.existsSync(cachePath())) return {};
    return JSON.parse(fs.readFileSync(cachePath(), 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writeContactCache(data) {
  fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
  const tmp = `${cachePath()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, cachePath());
}

function publicBaseUrl() {
  return String(process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || 'https://phuglee-production.up.railway.app')
    .replace(/\/$/, '');
}

function dealDeepLink(dealId) {
  return `${publicBaseUrl()}/under-contract?deal=${encodeURIComponent(dealId)}`;
}

function dealLabel(deal) {
  return String(deal?.address || deal?.dealId || 'a property').trim();
}

function money(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Cash vs subject-to for alerts — prefer desk dealType, else SignNow PSA / cashPsaSend / notes.
 * @returns {{ key: 'cash'|'subject_to'|'', label: string }}
 */
function resolveDealTypeForAlert(deal) {
  const raw = String(deal?.dealType || deal?.contractType || deal?.purchaseType || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (raw === 'cash' || raw === 'cash_deal' || raw === 'purchase_cash') {
    return { key: 'cash', label: 'Cash contract' };
  }
  if (raw === 'subject_to' || raw === 'subto' || raw === 'sub_to' || raw === 'subjectto') {
    return { key: 'subject_to', label: 'Subject-to contract' };
  }

  const hints = [];
  for (const item of deal?.signNowPending || []) {
    hints.push(item?.templateKey, item?.kind, item?.documentName, item?.label);
  }
  for (const doc of deal?.documents || []) {
    hints.push(doc?.kind, doc?.label, doc?.name, doc?.source);
  }
  const psa = deal?.cashPsaSend;
  const cashPsaLive = psa && typeof psa === 'object'
    && (psa.signNowDocumentId || psa.status === 'sent' || psa.status === 'sending');
  if (cashPsaLive) {
    hints.push('cash', 'purchase', String(psa.status || ''), psa.signNowDocumentId ? 'contract' : '');
  }
  hints.push(deal?.notes);
  const blob = hints.filter(Boolean).join(' ').toLowerCase();
  if (/\bsubject[_\s-]?to\b|\bsubto\b|\bsub-to\b/.test(blob)) {
    return { key: 'subject_to', label: 'Subject-to contract' };
  }
  if (/\bcash\b/.test(blob) && /purchase|psa|agreement|contract|sent|sending/.test(blob)) {
    return { key: 'cash', label: 'Cash contract' };
  }
  if (cashPsaLive) {
    return { key: 'cash', label: 'Cash contract' };
  }
  return { key: '', label: '' };
}

async function resolveFromNumber() {
  try {
    const nums = await ghl.listLocationPhoneNumbers();
    const first = nums[0];
    const raw = first?.phoneNumber || first?.number || first?.phone || null;
    return raw ? (ghl.toE164Us(raw) || String(raw)) : null;
  } catch (_) {
    return null;
  }
}

async function ensureTeamGhlContact(member) {
  if (!member) return null;
  if (!ghl.isConfigured()) return null;
  const cache = readContactCache();
  const cached = cache[member.key];
  if (cached?.contactId) return cached.contactId;

  const contact = await ghl.ensureContactByEmail({
    email: member.email,
    phone: member.phone,
    name: member.name
  });
  const id = contact?.id || contact?.contactId || null;
  if (id) {
    cache[member.key] = {
      contactId: id,
      email: member.email,
      phone: member.phone,
      updatedAt: new Date().toISOString()
    };
    writeContactCache(cache);
  }
  return id;
}

/**
 * @param {object} opts
 * @param {'admin'|'brad'|Array<'admin'|'brad'>} opts.to
 * @param {string} opts.sms
 * @param {string} opts.emailSubject
 * @param {string} [opts.emailHtml]
 * @param {string} [opts.exclude] username to skip
 */
async function notifyTeam(opts = {}) {
  if (!ghl.isConfigured()) {
    console.warn('[team-notify] skipped — GHL_NOT_CONFIGURED');
    return { ok: false, skipped: true, reason: 'GHL_NOT_CONFIGURED' };
  }
  const exclude = normalizeTeamUser(opts.exclude);
  let targets = Array.isArray(opts.to) ? opts.to : [opts.to];
  targets = targets
    .map(normalizeTeamUser)
    .filter(Boolean)
    .filter((k) => k !== exclude)
    .map(getTeamMember)
    .filter(Boolean);

  if (!targets.length) return { ok: true, sent: [] };

  const fromNumber = await resolveFromNumber();
  const results = [];
  for (const member of targets) {
    const row = { key: member.key, ok: false, sms: null, email: null, contactId: null };
    try {
      const contactId = await ensureTeamGhlContact(member);
      row.contactId = contactId;
      if (!contactId) {
        row.error = 'No GHL contact';
        results.push(row);
        console.warn('[team-notify] no contact for', member.key);
        continue;
      }

      const smsBody = String(opts.sms || '').trim();
      const subject = String(opts.emailSubject || 'Phuglee Contract Tracker').trim();
      const html = String(opts.emailHtml || `<p>${smsBody.replace(/\n/g, '<br>')}</p>`);
      const toNumber = ghl.toE164Us(member.phone) || undefined;

      // SMS and email independently — one failure must not block the other
      if (smsBody) {
        try {
          await ghl.sendSms({
            contactId,
            message: smsBody,
            fromNumber: fromNumber || undefined,
            toNumber
          });
          row.sms = 'sent';
        } catch (err) {
          row.sms = 'failed';
          row.smsError = err.message;
          console.warn('[team-notify] SMS failed for', member.key, err.message);
        }
      } else {
        row.sms = 'skipped';
      }

      try {
        await ghl.sendEmail({
          contactId,
          subject,
          html,
          emailTo: member.email
        });
        row.email = 'sent';
      } catch (err) {
        row.email = 'failed';
        row.emailError = err.message;
        console.warn('[team-notify] Email failed for', member.key, err.message);
      }

      row.ok = row.sms === 'sent' || row.email === 'sent';
      if (!row.ok) row.error = row.smsError || row.emailError || 'Send failed';
      results.push(row);
    } catch (err) {
      row.error = err.message;
      results.push(row);
      console.warn('[team-notify] notify failed for', member.key, err.message);
    }
  }
  const out = { ok: results.every((r) => r.ok), sent: results };
  if (!out.ok) console.warn('[team-notify] partial/failed:', JSON.stringify(results));
  return out;
}

function notifyBoth(sms, emailSubject, emailHtml) {
  return notifyTeam({
    to: ['admin', 'brad'],
    sms,
    emailSubject,
    emailHtml
  });
}

async function alertTeamMessage({ deal, fromUser, body }) {
  const from = getTeamMember(fromUser);
  const to = otherTeamMember(fromUser);
  if (!to || !deal) return { ok: false, skipped: true };
  const link = dealDeepLink(deal.dealId);
  const addr = dealLabel(deal);
  const preview = String(body || '').trim().slice(0, 140);
  const sms = `New team message from ${from?.name || fromUser} on ${addr}:\n${preview}\n\nOpen: ${link}`;
  return notifyTeam({
    to: to.key,
    sms,
    emailSubject: `Team message — ${addr}`,
    emailHtml: `<p><strong>${from?.name || fromUser}</strong> left a team message on <strong>${addr}</strong>.</p><p>${preview}</p><p><a href="${link}">Open property profile</a></p>`
  });
}

async function alertUnderContract({ deal }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const price = money(deal?.purchasePrice);
  const cityState = [deal?.city, deal?.state].filter(Boolean).join(', ');
  const where = cityState ? ` (${cityState})` : '';
  const dealType = resolveDealTypeForAlert(deal);
  const typeLine = dealType.label ? `Type: ${dealType.label}.` : '';
  const owner = String(deal?.ownerName || '').trim();
  const ownerBit = owner ? ` Seller: ${owner}.` : '';
  const sms = [
    `New deal on Contract Tracker: ${addr}${where}.`,
    typeLine,
    `Purchase: ${price}.${ownerBit}`,
    link
  ].filter(Boolean).join('\n');
  const typeHtml = dealType.label
    ? `<p>Contract type: <strong>${dealType.label}</strong></p>`
    : '';
  const ownerHtml = owner ? `<p>Seller: <strong>${owner}</strong></p>` : '';
  return notifyBoth(sms, `New deal — ${addr}${dealType.label ? ` (${dealType.label})` : ''}`,
    `<p>A new contract hit the <strong>Under Contract</strong> tracker.</p>` +
    `<p><strong>${addr}</strong>${where ? ` — ${cityState}` : ''}</p>` +
    typeHtml +
    ownerHtml +
    `<p>Purchase price: <strong>${price}</strong></p>` +
    `<p><a href="${link}">Open Contract Tracker</a></p>`);
}

async function alertBuyerFound({ deal, buyerName }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const name = buyerName || deal.cashBuyerName || 'a buyer';
  const sms = `Buyer found for ${addr}: ${name}.\nOpen: ${link}`;
  return notifyBoth(sms, `Buyer found — ${addr}`,
    `<p>A buyer was saved for <strong>${addr}</strong>.</p><p>Buyer: <strong>${name}</strong></p><p><a href="${link}">Open Contract Tracker</a></p>`);
}

/** JV is auto-signed by both parties — never SMS/email for send or "awaiting". */
async function alertJvSent() {
  return { skipped: true, reason: 'jv_auto_signed_no_notify', sent: [] };
}

async function alertAmendmentSent({ deal, awaiting = [] }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const wait = awaiting.length ? awaiting.join(', ') : 'signers';
  const sms = `Amendment sent for ${addr}. Awaiting signatures from: ${wait}.\n${link}`;
  return notifyBoth(sms, `Amendment sent — ${addr}`,
    `<p>An amendment was sent for <strong>${addr}</strong>.</p><p>Awaiting signatures from: <strong>${wait}</strong></p><p><a href="${link}">Open deal</a></p>`);
}

async function alertTitleOpened({ deal }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const sms = `Title opened on ${addr}.\n${link}`;
  return notifyBoth(sms, `Title opened — ${addr}`,
    `<p>Title has been opened for <strong>${addr}</strong>.</p><p><a href="${link}">Open deal</a></p>`);
}

async function alertSellerEmd({ deal }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const sms = `Seller EMD submitted on ${addr}.\n${link}`;
  return notifyBoth(sms, `EMD submitted — ${addr}`,
    `<p>Seller EMD was marked submitted for <strong>${addr}</strong>.</p><p><a href="${link}">Open deal</a></p>`);
}

async function alertDeskReady({ deal }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const sms = `Access, vacancy, and rehab are set for ${addr}. Ready for dispo.\n${link}`;
  return notifyBoth(sms, `Desk ready — ${addr}`,
    `<p>Access, vacancy, and rehab info are complete for <strong>${addr}</strong>.</p><p><a href="${link}">Open deal</a></p>`);
}

async function alertPhotosReady({ deal }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const sms = `Photos are ready to market for ${addr}.\n${link}`;
  return notifyBoth(sms, `Photos ready — ${addr}`,
    `<p>Property photos are ready to market for <strong>${addr}</strong>.</p><p><a href="${link}">Open deal</a></p>`);
}

async function alertPhotographerDone({ deal, photographerName, mediaCount }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const who = String(photographerName || 'Photographer').trim();
  const n = Number(mediaCount) || 0;
  const sms = `${who} marked photos DONE for ${addr}${n ? ` (${n} files)` : ''}. Open Media / Condition Scan:\n${link}`;
  return notifyBoth(sms, `Photographer done — ${addr}`,
    `<p><strong>${who}</strong> tapped <em>I'm Done</em> on the upload page for <strong>${addr}</strong>.</p>` +
    `<p>${n ? `${n} media file(s) on the deal.` : 'Check Media on the profile.'}</p>` +
    `<p><a href="${link}">Open Contract Tracker</a></p>`);
}

async function alertBuyerEmd({ deal }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const sms = `Buyer EMD is in for ${addr}.\n${link}`;
  return notifyBoth(sms, `Buyer EMD — ${addr}`,
    `<p>Buyer EMD was marked in for <strong>${addr}</strong>.</p><p><a href="${link}">Open deal</a></p>`);
}

async function alertFunded({ deal, assignmentFee, lifetimeAssignments }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const fee = money(assignmentFee);
  const life = money(lifetimeAssignments);
  const sms = `Congrats — ${addr} is FUNDED. Assignment: ${fee}. Total assignments so far: ${life}.\n${link}`;
  return notifyBoth(sms, `Funded — ${addr}`,
    `<p>Congrats — <strong>${addr}</strong> is funded and closed.</p><p>Assignment on this deal: <strong>${fee}</strong></p><p>Total assignments since pipeline start: <strong>${life}</strong></p><p><a href="${link}">Open deal</a></p>`);
}

function docKindLabel(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'aoc' || k === 'assignment') return 'AOC';
  if (k === 'amendment' || k === 'addendum') return 'Amendment';
  if (k === 'purchase_contract' || k === 'cash') return 'Purchase contract';
  if (k === 'jv' || k === 'jv_agreement') return 'JV';
  return kind ? String(kind) : 'Document';
}

async function alertSignNowOpened({ deal, kind, openedByEmail, roleLabel }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const label = docKindLabel(kind);
  const who = roleLabel
    ? ` (${roleLabel}${openedByEmail ? ` · ${openedByEmail}` : ''})`
    : (openedByEmail ? ` (${openedByEmail})` : '');
  const sms = `${label} opened for ${addr}${who}.\n${link}`;
  return notifyBoth(sms, `${label} opened — ${addr}`,
    `<p><strong>${label}</strong> was opened on <strong>${addr}</strong>${who ? ` by ${roleLabel || openedByEmail}` : ''}.</p><p><a href="${link}">Open deal</a></p>`);
}

async function alertSignNowSigned({ deal, kind, roleLabel, openedByEmail, complete = true }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const label = docKindLabel(kind);
  if (complete) {
    const sms = `${label} fully signed for ${addr}. PDF is in Documents.\n${link}`;
    return notifyBoth(sms, `${label} signed — ${addr}`,
      `<p><strong>${label}</strong> is fully signed for <strong>${addr}</strong>.</p><p>The signed PDF is in Documents.</p><p><a href="${link}">Open deal</a></p>`);
  }
  const who = roleLabel
    ? `${roleLabel}${openedByEmail ? ` (${openedByEmail})` : ''}`
    : (openedByEmail || 'a seller');
  const sms = `${label}: ${who} signed for ${addr}. Waiting on remaining signer(s).\n${link}`;
  return notifyBoth(sms, `${label} — ${who} signed`,
    `<p><strong>${who}</strong> signed the <strong>${label}</strong> for <strong>${addr}</strong>.</p><p>Waiting on the remaining signer(s).</p><p><a href="${link}">Open deal</a></p>`);
}

module.exports = {
  TEAM,
  dealDeepLink,
  publicBaseUrl,
  notifyTeam,
  resolveDealTypeForAlert,
  alertTeamMessage,
  alertUnderContract,
  alertBuyerFound,
  alertJvSent,
  alertAmendmentSent,
  alertTitleOpened,
  alertSellerEmd,
  alertDeskReady,
  alertPhotosReady,
  alertPhotographerDone,
  alertBuyerEmd,
  alertFunded,
  alertSignNowOpened,
  alertSignNowSigned,
  docKindLabel,
  ensureTeamGhlContact
};
