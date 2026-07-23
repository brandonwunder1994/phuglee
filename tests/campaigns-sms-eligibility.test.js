'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateContactEligibility,
  classTagForLeadType,
  SMS_MAX_TOUCHES
} = require('../lib/campaigns/sms-eligibility');
// re-export policy from eligibility or import policy in tests

test('classTagForLeadType maps lead types', () => {
  assert.equal(classTagForLeadType('distressed'), 'class:distressed');
  assert.equal(classTagForLeadType('well_maintained'), 'class:well maintained');
  assert.equal(classTagForLeadType('land'), 'class:land');
});

test('suppress: not interested blocks', () => {
  const r = evaluateContactEligibility({
    tags: ['phuglee', 'code violation', 'not interested'],
    dndSms: false,
    hasOpenDts: false,
    smsCount: 0,
    lastSmsAt: null,
    hasPhone: true,
    now: Date.now()
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /not interested/i);
});

test('open DTS blocks', () => {
  const r = evaluateContactEligibility({
    tags: ['phuglee', 'code violation'],
    dndSms: false,
    hasOpenDts: true,
    smsCount: 2,
    lastSmsAt: null,
    hasPhone: true,
    now: Date.now()
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /dts/i);
});

test('cooldown 4 days', () => {
  const now = Date.parse('2026-07-23T12:00:00Z');
  const recent = new Date(now - 2 * 86400000).toISOString();
  const r = evaluateContactEligibility({
    tags: ['phuglee', 'code violation'],
    dndSms: false,
    hasOpenDts: false,
    smsCount: 1,
    lastSmsAt: recent,
    hasPhone: true,
    now
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cooldown|spacing|4 day/i);
});

test('max 12 blocks', () => {
  const r = evaluateContactEligibility({
    tags: ['phuglee', 'code violation'],
    dndSms: false,
    hasOpenDts: false,
    smsCount: SMS_MAX_TOUCHES,
    lastSmsAt: null,
    hasPhone: true,
    now: Date.now()
  });
  assert.equal(r.ok, false);
});