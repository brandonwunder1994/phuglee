'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { getMessageTemplate, renderMessage } = require('../lib/campaigns/sms-messages');
const { isSmsCampaignsLive, isSmsCampaignsAuto } = require('../lib/campaigns/sms-flags');

test('templates 1-12 exist', () => {
  for (let i = 1; i <= 12; i++) {
    const t = getMessageTemplate(i);
    assert.ok(t.id);
    assert.ok(t.body.includes('{') || t.body.length > 10);
  }
});

test('touch 0 and 13 throw', () => {
  assert.throws(() => getMessageTemplate(0), /1-12/);
  assert.throws(() => getMessageTemplate(13), /1-12/);
});

test('render substitutes name and street', () => {
  const msg = renderMessage(1, { firstName: 'Sue', street: '12 Main St', city: 'Waco' });
  assert.match(msg, /Sue/);
  assert.match(msg, /12 Main St/);
  assert.ok(msg.length <= 160);
});

test('live defaults false when env unset', () => {
  const prevLive = process.env.SMS_CAMPAIGNS_LIVE;
  const prevAuto = process.env.SMS_CAMPAIGNS_AUTO;
  delete process.env.SMS_CAMPAIGNS_LIVE;
  delete process.env.SMS_CAMPAIGNS_AUTO;
  try {
    assert.equal(isSmsCampaignsLive(), false);
    assert.equal(isSmsCampaignsAuto(), false);
  } finally {
    if (prevLive !== undefined) process.env.SMS_CAMPAIGNS_LIVE = prevLive;
    else delete process.env.SMS_CAMPAIGNS_LIVE;
    if (prevAuto !== undefined) process.env.SMS_CAMPAIGNS_AUTO = prevAuto;
    else delete process.env.SMS_CAMPAIGNS_AUTO;
  }
});

test('live true when env true', () => {
  process.env.SMS_CAMPAIGNS_LIVE = 'true';
  try {
    assert.equal(isSmsCampaignsLive(), true);
  } finally {
    delete process.env.SMS_CAMPAIGNS_LIVE;
  }
});
