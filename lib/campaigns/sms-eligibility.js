'use strict';

const {
  SMS_SPACING_MS,
  SMS_HARD_MIN_MS,
  SMS_MAX_TOUCHES,
  SOURCE_TAG,
  classTagForLeadType
} = require('./sms-policy');

const { contactHasSuppressTag, firstSuppressReason } = require('./sms-tags');

function isCooldownOk(lastSmsAt, now, { hardMinOnly = false } = {}) {
  if (!lastSmsAt) return true;
  const last = typeof lastSmsAt === 'string' ? Date.parse(lastSmsAt) : lastSmsAt;
  if (Number.isNaN(last)) return true;
  const delta = now - last;
  const min = hardMinOnly ? SMS_HARD_MIN_MS : SMS_SPACING_MS;
  return delta >= min;
}

function isAtMax(smsCount) {
  return smsCount >= SMS_MAX_TOUCHES;
}

function evaluateContactEligibility({
  tags = [],
  dndSms = false,
  hasOpenDts = false,
  smsCount = 0,
  lastSmsAt = null,
  hasPhone = false,
  now = Date.now()
} = {}) {
  if (!hasPhone) {
    return { ok: false, reason: 'no phone' };
  }
  if (dndSms) {
    return { ok: false, reason: 'system dndSms' };
  }
  if (hasOpenDts) {
    return { ok: false, reason: 'open DTS blocks' };
  }
  if (contactHasSuppressTag(tags)) {
    return { ok: false, reason: firstSuppressReason(tags) || 'suppress tag' };
  }
  if (!tags.includes(SOURCE_TAG)) {
    return { ok: false, reason: 'missing source tag' };
  }
  if (isAtMax(smsCount)) {
    return { ok: false, reason: 'max touches reached' };
  }
  if (!isCooldownOk(lastSmsAt, now)) {
    return { ok: false, reason: 'cooldown 4 days' };
  }
  return { ok: true, reason: 'eligible' };
}

module.exports = {
  evaluateContactEligibility,
  classTagForLeadType,
  SMS_MAX_TOUCHES,
  SMS_SPACING_MS,
  SMS_HARD_MIN_MS,
  SOURCE_TAG
};