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

  const first = await importGhlExports([
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

  const second = await importGhlExports([
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

test('PDF text-line scraper finds date and amount rows', () => {
  const { linesToBillingRows } = require('../lib/operating-costs/ghl-pdf-parse');
  const text = [
    'HighLevel Invoice',
    'Page 1 of 1',
    'July 1, 2026 Agency Starter Plan $97.00',
    '07/10/2026 LC SMS outbound $0.40',
    'Total $97.40'
  ].join('\n');

  const result = linesToBillingRows(text);
  assert.ok(result);
  assert.equal(result.parser, 'pdf-text-lines');
  assert.equal(result.rows.length, 2);
  assert.match(result.rows[0].Description, /Agency Starter/i);
  assert.equal(result.rows[1].Amount, '0.40');
});

test('PDF text rows flow through parseGhlExport charge builder', async () => {
  const { linesToBillingRows } = require('../lib/operating-costs/ghl-pdf-parse');
  const { chargesFromTable } = require('../lib/operating-costs/ghl-export-parse');

  const scraped = linesToBillingRows(
    '2026-07-01 Agency Starter Plan $97.00\n2026-07-10 LC SMS outbound $0.40'
  );
  assert.ok(scraped);
  const parsed = chargesFromTable(scraped.headers, scraped.rows, 'ghl-july-invoice.pdf');
  assert.equal(parsed.charges.length, 2);
  assert.equal(parsed.document.kind, 'invoice');
  assert.ok(parsed.charges.some((c) => c.amountCents === 9700));
});

test('HighLevel Wallet Sales Tax PDF imports Total Charged', async () => {
  const fs = require('fs');
  const path = require('path');
  const fixture = path.join(
    __dirname,
    'fixtures',
    'operating-costs',
    'wallet-sales-tax-invoice.pdf'
  );
  assert.ok(fs.existsSync(fixture), 'fixture PDF missing');

  const { parseGhlExport } = require('../lib/operating-costs/ghl-export-parse');
  const parsed = await parseGhlExport(
    fs.readFileSync(fixture),
    'WALLET_SALES_TAX-invoice-6a460b371221b92e2b09f264-2026-07-04.pdf'
  );

  assert.equal(parsed.parser, 'pdf-hl-tax-invoice');
  assert.equal(parsed.charges.length, 1);
  assert.equal(parsed.charges[0].amountCents, 3085);
  assert.equal(parsed.charges[0].date, '2026-07-02');
  assert.equal(parsed.charges[0].category, 'tax');
  assert.match(parsed.charges[0].description, /Wallet Sales Tax/i);
});
