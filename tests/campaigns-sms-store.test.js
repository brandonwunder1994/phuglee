'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmp;
let store;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-camp-'));
  process.env.CAMPAIGNS_SMS_DATA_ROOT = tmp;
  delete require.cache[require.resolve('../lib/campaigns/sms-store')];
  store = require('../lib/campaigns/sms-store');
});

after(() => {
  delete process.env.CAMPAIGNS_SMS_DATA_ROOT;
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
});

test('appendRun and listRuns', () => {
  const id = store.appendRun({ mode: 'dry-run', touch: 0, sent: 0, dryRun: true });
  assert.ok(id);
  const runs = store.listRuns({ limit: 5 });
  assert.equal(runs[0].runId, id);
  assert.equal(runs[0].dryRun, true);
});

test('queue enqueue dequeue', () => {
  store.enqueueSync('leadA');
  store.enqueueSync('leadA');
  store.enqueueSync('leadB');
  assert.equal(store.queueDepth(), 2);
  const batch = store.dequeueSyncBatch(1);
  assert.deepEqual(batch, ['leadA']);
  assert.equal(store.queueDepth(), 1);
});

test('contact map', () => {
  store.setContactMap('L1', 'C1');
  assert.equal(store.getContactMap('L1').contactId, 'C1');
});

test('auto state', () => {
  store.setAutoState({ enabled: true, lastTickAt: '2026-07-23T00:00:00Z' });
  const a = store.getAutoState();
  assert.equal(a.enabled, true);
});
