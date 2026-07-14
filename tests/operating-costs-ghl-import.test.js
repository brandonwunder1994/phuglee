'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('multi-file import detects kinds and same-day new charges', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-'));
  process.env.OPERATING_COSTS_ROOT = tmp;
  delete require.cache[require.resolve('../lib/operating-costs/rate-card')];
  delete require.cache[require.resolve('../lib/operating-costs/ghl-import-store')];
  delete require.cache[require.resolve('../lib/operating-costs/ghl-export-parse')];

  const { importGhlExports, listCharges } = require('../lib/operating-costs/ghl-import-store');

  const morning = [
    'Date,Time,Amount,Description,Category',
    '2026-07-10,09:00:00,0.40,LC SMS outbound,SMS',
    '2026-07-10,09:15:00,0.12,LC Phone outbound,Phone'
  ].join('\n');

  const invoice = [
    'Invoice Date,Amount,Description,Invoice Number',
    '2026-07-01,97.00,Agency Starter Plan,INV-1001'
  ].join('\n');

  const first = importGhlExports([
    { data: Buffer.from(morning, 'utf8'), filename: 'wallet-morning.csv' },
    { data: Buffer.from(invoice, 'utf8'), filename: 'july-invoice.csv' }
  ]);

  assert.equal(first.fileCount, 2);
  assert.equal(first.newCount, 3);
  assert.ok(first.watermark.pickUpDate === '2026-07-10');
  assert.match(first.watermark.pickUpHint || '', /2026-07-10/);
  const kinds = first.fileResults.map((f) => f.document?.kind).sort();
  assert.deepEqual(kinds, ['invoice', 'transactions']);

  const afternoon = [
    'Date,Time,Amount,Description,Category',
    '2026-07-10,09:00:00,0.40,LC SMS outbound,SMS',
    '2026-07-10,16:30:00,1.10,LC SMS outbound,SMS',
    '2026-07-11,08:00:00,0.05,Email send,Email'
  ].join('\n');

  const second = importGhlExports([
    { data: Buffer.from(afternoon, 'utf8'), filename: 'wallet-week2.csv' }
  ]);
  assert.equal(second.newCount, 2);
  assert.equal(second.duplicateCount, 1);
  assert.equal(second.watermark.pickUpDate, '2026-07-11');

  const listed = listCharges({ from: '2026-07-01', to: '2026-07-31' });
  assert.equal(listed.charges.length, 5);
  assert.ok(listed.byKind.some((k) => k.kind === 'invoice'));
  assert.ok(listed.byKind.some((k) => k.kind === 'transactions'));
});
