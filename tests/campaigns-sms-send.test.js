'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmp;
let sendSmsCalls;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-send-'));
  process.env.CAMPAIGNS_SMS_DATA_ROOT = tmp;
  delete process.env.SMS_CAMPAIGNS_LIVE;
  sendSmsCalls = 0;
  delete require.cache[require.resolve('../lib/campaigns/sms-store')];
  delete require.cache[require.resolve('../lib/campaigns/sms-send')];
  delete require.cache[require.resolve('../lib/campaigns/sms-ghl')];
});

after(() => {
  delete process.env.CAMPAIGNS_SMS_DATA_ROOT;
  delete process.env.SMS_CAMPAIGNS_LIVE;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

function mockGhl(contacts) {
  return {
    ghlConfig: () => ({ locationId: 'loc', apiKey: 'x', base: 'http://x', version: 'v' }),
    api: async (method, urlPath, body) => {
      if (String(urlPath).includes('/contacts/search')) {
        return { contacts, total: contacts.length };
      }
      if (String(urlPath).includes('pipelines')) {
        return { pipelines: [{ id: 'dts', name: 'DTS Pipeline' }] };
      }
      if (String(urlPath).includes('opportunities')) {
        return { opportunities: [] };
      }
      return {};
    },
    searchOpportunities: async () => ({ opportunities: [] }),
    findDtsPipeline: async () => ({ id: 'dts', name: 'DTS' }),
    sendSms: async () => {
      sendSmsCalls += 1;
      return { ok: true };
    },
    addContactTags: async () => ({}),
    createContactNote: async () => ({}),
    toE164Us: (p) => p,
    digitsOnly: (p) => String(p || '').replace(/\D/g, ''),
    customFieldMap: () => ({})
  };
}

test('dry-run never calls sendSms', async () => {
  sendSmsCalls = 0;
  const { executeSend } = require('../lib/campaigns/sms-send');
  const ghl = mockGhl([{
    id: 'c1',
    phone: '+15551234567',
    firstName: 'Pat',
    address1: '1 Main',
    city: 'Austin',
    state: 'TX',
    tags: ['code violation']
  }]);
  const r = await executeSend({ touch: 0, dryRun: true, ghl, dripMs: 0 });
  assert.equal(r.dryRun, true);
  assert.equal(sendSmsCalls, 0);
  assert.ok(r.wouldSend.length >= 1);
});

test('live without flag throws LIVE_DISABLED', async () => {
  delete process.env.SMS_CAMPAIGNS_LIVE;
  delete require.cache[require.resolve('../lib/campaigns/sms-flags')];
  delete require.cache[require.resolve('../lib/campaigns/sms-send')];
  const { executeSend } = require('../lib/campaigns/sms-send');
  await assert.rejects(
    () => executeSend({
      touch: 0,
      dryRun: false,
      confirm: 'SEND',
      ghl: mockGhl([]),
      dripMs: 0
    }),
    (err) => err.code === 'LIVE_DISABLED'
  );
});

test('live without confirm throws', async () => {
  process.env.SMS_CAMPAIGNS_LIVE = 'true';
  delete require.cache[require.resolve('../lib/campaigns/sms-flags')];
  delete require.cache[require.resolve('../lib/campaigns/sms-send')];
  const { executeSend } = require('../lib/campaigns/sms-send');
  await assert.rejects(
    () => executeSend({
      touch: 0,
      dryRun: false,
      confirm: 'nope',
      ghl: mockGhl([]),
      dripMs: 0
    }),
    (err) => err.code === 'CONFIRM_REQUIRED'
  );
  delete process.env.SMS_CAMPAIGNS_LIVE;
});
