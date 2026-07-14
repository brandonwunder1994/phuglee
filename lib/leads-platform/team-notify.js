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
  normalizeTeamUser,
  digitPhone
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

async function resolveFromNumber() {
  try {
    const nums = await ghl.listLocationPhoneNumbers();
    const first = nums[0];
    return first?.phoneNumber || first?.number || first?.phone || null;
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
    try {
      const contactId = await ensureTeamGhlContact(member);
      if (!contactId) {
        results.push({ key: member.key, ok: false, error: 'No GHL contact' });
        continue;
      }
      const smsBody = String(opts.sms || '').trim();
      const subject = String(opts.emailSubject || 'Phuglee Contract Tracker').trim();
      const html = String(opts.emailHtml || `<p>${smsBody.replace(/\n/g, '<br>')}</p>`);
      if (smsBody) {
        await ghl.sendSms({
          contactId,
          message: smsBody,
          fromNumber: fromNumber || undefined,
          toNumber: digitPhone(member.phone) || undefined
        });
      }
      await ghl.sendEmail({
        contactId,
        subject,
        html,
        message: smsBody || subject
      });
      results.push({ key: member.key, ok: true });
    } catch (err) {
      results.push({ key: member.key, ok: false, error: err.message });
    }
  }
  return { ok: results.every((r) => r.ok), sent: results };
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

async function alertBuyerFound({ deal, buyerName }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const name = buyerName || deal.cashBuyerName || 'a buyer';
  const sms = `Buyer found for ${addr}: ${name}.\nOpen: ${link}`;
  return notifyBoth(sms, `Buyer found — ${addr}`,
    `<p>A buyer was saved for <strong>${addr}</strong>.</p><p>Buyer: <strong>${name}</strong></p><p><a href="${link}">Open Contract Tracker</a></p>`);
}

async function alertJvSent({ deal, awaiting = [] }) {
  const addr = dealLabel(deal);
  const link = dealDeepLink(deal.dealId);
  const wait = awaiting.length ? awaiting.join(', ') : 'Brandon (Party A) and Brad (Party B)';
  const sms = `JV Agreement sent for ${addr}. Awaiting signatures from: ${wait}.\n${link}`;
  return notifyBoth(sms, `JV sent — ${addr}`,
    `<p>JV Agreement was sent for <strong>${addr}</strong>.</p><p>Awaiting signatures from: <strong>${wait}</strong></p><p><a href="${link}">Open deal</a></p>`);
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

module.exports = {
  TEAM,
  dealDeepLink,
  publicBaseUrl,
  notifyTeam,
  alertTeamMessage,
  alertBuyerFound,
  alertJvSent,
  alertAmendmentSent,
  alertTitleOpened,
  alertSellerEmd,
  alertDeskReady,
  alertPhotosReady,
  alertBuyerEmd,
  alertFunded,
  ensureTeamGhlContact
};
