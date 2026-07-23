'use strict';

const ghlDefault = require('../leads-platform/ghl-client');
const { isSmsCampaignsLive } = require('./sms-flags');
const { renderMessage, getMessageTemplate } = require('./sms-messages');
const { evaluateContactEligibility } = require('./sms-eligibility');
const {
  searchContactsByTag,
  contactHasOpenDts,
  isSmsDndContact,
  readSmsCount,
  readLastSmsAt,
  writeSmsState,
  SOURCE_TAG
} = require('./sms-ghl');
const { resolveFromNumber } = require('./sms-policy');
const { appendRun } = require('./sms-store');

const DEFAULT_DRIP_MS = 2500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function firstNameFromContact(c) {
  const f = String(c.firstName || '').trim();
  if (f && !/\d/.test(f)) return f;
  const name = String(c.contactName || c.name || '').trim().split(/\s+/)[0] || '';
  if (name && !/\d/.test(name) && !/\b(llc|inc)\b/i.test(name)) return name;
  return '';
}

/**
 * Build send plan for contacts currently at sms_count === touch.
 */
async function planSend({ touch = 0, limit = 500, ghl = ghlDefault } = {}) {
  const t = Math.max(0, Math.min(11, Number(touch) || 0));
  const { contacts } = await searchContactsByTag(SOURCE_TAG, {
    pageLimit: 200,
    maxPages: 20
  }, { ghl });

  const candidates = [];
  const excluded = [];
  const now = Date.now();

  for (const c of contacts) {
    const smsCount = readSmsCount(c);
    if (smsCount !== t) continue;

    const id = c.id || c.contactId;
    let hasOpenDts = false;
    try {
      hasOpenDts = await contactHasOpenDts(id, { ghl });
    } catch (_) {
      hasOpenDts = false;
    }

    const elig = evaluateContactEligibility({
      tags: c.tags || [],
      dndSms: isSmsDndContact(c),
      hasOpenDts,
      smsCount,
      lastSmsAt: readLastSmsAt(c),
      hasPhone: !!(c.phone || c.phoneNumber),
      now
    });

    const row = {
      contactId: id,
      phone: c.phone || c.phoneNumber || null,
      firstName: firstNameFromContact(c),
      street: c.address1 || c.address || '',
      city: c.city || '',
      state: c.state || '',
      smsCount,
      reason: elig.reason
    };

    if (!elig.ok) {
      excluded.push(row);
      continue;
    }
    candidates.push(row);
    if (candidates.length >= limit) break;
  }

  const nextTouch = t + 1;
  const wouldSend = candidates.map((row) => ({
    ...row,
    nextTouch,
    fromNumber: resolveFromNumber(row.state),
    message: renderMessage(nextTouch, {
      firstName: row.firstName,
      street: row.street,
      city: row.city
    }),
    templateId: getMessageTemplate(nextTouch).id
  }));

  return {
    touch: t,
    nextTouch,
    candidates: candidates.length,
    excluded: excluded.length,
    wouldSend,
    excludedSample: excluded.slice(0, 20)
  };
}

async function executeSend({
  touch = 0,
  limit = 500,
  dryRun = true,
  confirm = '',
  ghl = ghlDefault,
  dripMs = DEFAULT_DRIP_MS
} = {}) {
  if (!dryRun && !isSmsCampaignsLive()) {
    const err = new Error('SMS campaigns are not live (set SMS_CAMPAIGNS_LIVE=true)');
    err.code = 'LIVE_DISABLED';
    throw err;
  }
  if (!dryRun && confirm !== 'SEND') {
    const err = new Error('Live send requires confirm: "SEND"');
    err.code = 'CONFIRM_REQUIRED';
    throw err;
  }

  const plan = await planSend({ touch, limit, ghl });
  if (dryRun) {
    const runId = appendRun({
      mode: 'dry-run',
      dryRun: true,
      touch: plan.touch,
      sent: 0,
      skipped: plan.excluded,
      failed: 0,
      excluded: plan.excluded,
      meta: { wouldSend: plan.wouldSend.length, nextTouch: plan.nextTouch }
    });
    return {
      runId,
      dryRun: true,
      ...plan,
      sent: 0,
      failed: 0
    };
  }

  let sent = 0;
  let failed = 0;
  const failures = [];
  const nowIso = new Date().toISOString();

  for (const row of plan.wouldSend) {
    try {
      await ghl.sendSms({
        contactId: row.contactId,
        message: row.message,
        fromNumber: row.fromNumber,
        toNumber: row.phone
      });
      await writeSmsState(row.contactId, {
        smsCount: plan.nextTouch,
        lastSmsAt: nowIso,
        campaignId: row.templateId
      }, { ghl });
      sent += 1;
    } catch (err) {
      failed += 1;
      failures.push({ contactId: row.contactId, error: err.message || String(err) });
    }
    if (dripMs > 0) await sleep(dripMs);
  }

  const runId = appendRun({
    mode: 'live',
    dryRun: false,
    touch: plan.touch,
    sent,
    skipped: plan.excluded,
    failed,
    excluded: plan.excluded,
    meta: { nextTouch: plan.nextTouch, failures: failures.slice(0, 20) }
  });

  return {
    runId,
    dryRun: false,
    touch: plan.touch,
    nextTouch: plan.nextTouch,
    sent,
    failed,
    excluded: plan.excluded,
    wouldSend: plan.wouldSend.length,
    failures
  };
}

module.exports = {
  planSend,
  executeSend,
  DEFAULT_DRIP_MS
};
