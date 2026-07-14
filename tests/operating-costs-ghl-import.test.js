'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('ghl export parse + dedupe watermark', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-'));
  process.env.OPERATING_COSTS_ROOT = tmp;
  // Reload modules against temp root
  delete require.cache[require.resolve('../lib/operating-costs/rate-card')];
  delete require.cache[require.resolve('../lib/operating-costs/ghl-import-store')];
  delete require.cache[require.resolve('../lib/operating-costs/ghl-export-parse')];

  const { parseGhlExport } = require('../lib/operating-costs/ghl-export-parse');
  const { importGhlExport, listCharges } = require('../lib/operating-costs/ghl-import-store');

  const csv = [
    'Date,Amount,Description,Category',
    '2026-07-01,12.50,LC SMS outbound,SMS',
    '2026-07-02,1.15,Phone Number Local,Phone Numbers',
    '2026-07-03,97.00,Agency Starter Plan,Subscription'
  ].join('\n');

  const parsed = parseGhlExport(Buffer.from(csv, 'utf8'), 'ghl.csv');
  assert.equal(parsed.charges.length, 3);
  assert.equal(parsed.charges.find((c) => c.category === 'sms')?.amountUsd, 12.5);

  const first = importGhlExport(Buffer.from(csv, 'utf8'), 'ghl-week1.csv');
  assert.equal(first.newCount, 3);
  assert.equal(first.duplicateCount, 0);
  assert.equal(first.watermark.coveredFrom, '2026-07-01');
  assert.equal(first.watermark.coveredTo, '2026-07-03');

  const second = importGhlExport(Buffer.from(csv, 'utf8'), 'ghl-week1-again.csv');
  assert.equal(second.newCount, 0);
  assert.equal(second.duplicateCount, 3);

  const overlap = [
    'Date,Amount,Description,Category',
    '2026-07-03,97.00,Agency Starter Plan,Subscription',
    '2026-07-08,4.20,LC SMS outbound,SMS'
  ].join('\n');
  const third = importGhlExport(Buffer.from(overlap, 'utf8'), 'ghl-week2.csv');
  assert.equal(third.newCount, 1);
  assert.equal(third.duplicateCount, 1);
  assert.equal(third.watermark.coveredTo, '2026-07-08');

  const listed = listCharges({ from: '2026-07-01', to: '2026-07-31' });
  assert.equal(listed.charges.length, 4);
});
