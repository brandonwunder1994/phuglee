const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  extractCodeCasesStatusAoa,
  looksLikeCodeCasesStatus
} = require('../lib/bridge-engine/parsers/pdf-code-cases-status');
const { parseTextBlob } = require('../lib/bridge-engine/parsers/pdf');
const { scoreTypeColumns, pickTypeColumn } = require('../lib/bridge-type-column-score');
const { parseSpreadsheet } = require('../lib/bridge-engine/parsers/spreadsheet');
const XLSX = require('xlsx');

const FIXTURE = path.join(
  __dirname,
  'fixtures',
  'bridge',
  'lawrenceville-code-cases-snippet.txt'
);

test('looksLikeCodeCasesStatus detects CEU / CODE CASES OPENED exports', () => {
  const text = fs.readFileSync(FIXTURE, 'utf8');
  assert.equal(looksLikeCodeCasesStatus(text), true);
  assert.equal(looksLikeCodeCasesStatus('random municipal noise'), false);
});

test('extractCodeCasesStatusAoa recovers Case Type and Main Address', () => {
  const text = fs.readFileSync(FIXTURE, 'utf8');
  const extracted = extractCodeCasesStatusAoa(text);
  assert.ok(extracted);
  assert.ok(extracted.rowCount >= 4);
  assert.deepEqual(extracted.aoa[0][0], 'Case #');
  assert.ok(extracted.aoa[0].includes('Case Type'));
  assert.ok(extracted.aoa[0].includes('Main Address'));

  const byId = Object.fromEntries(extracted.aoa.slice(1).map((r) => [r[0], r]));
  assert.equal(byId['CEU2026-17909'][1], 'High Grass');
  assert.match(byId['CEU2026-17909'][2], /75 Dogwood Park Trce/i);
  assert.equal(byId['CEU2026-17909'][7], 'Derek Phillips');
  assert.equal(byId['CEU2026-17909'][5], 'Closed');

  assert.equal(byId['CEU2026-17910'][1], 'International Property Maintenance Code - IPMC');
  assert.equal(byId['CEU2026-17910'][7], 'Juan Pablo Rebolledo');

  // Open cases (no closed date before address)
  assert.equal(byId['CEU2026-17911'][1], 'International Property Maintenance Code - IPMC');
  assert.equal(byId['CEU2026-17911'][5], 'Open');
  assert.equal(byId['CEU2026-17956'][1], 'Unlicensed Business');
});

test('parseTextBlob prefers code-cases-status path with Case Type column', () => {
  const text = fs.readFileSync(FIXTURE, 'utf8');
  const parsed = parseTextBlob(text, { filename: 'CITY-2026-320.xlsx' });
  assert.ok(parsed);
  assert.match(String(parsed.parseMode || ''), /code-cases-status/);
  assert.ok(parsed.headers.includes('Case Type'));
  assert.ok(parsed.headers.includes('Main Address'));
  assert.ok(parsed.rows.length >= 4);

  const ranked = scoreTypeColumns(parsed.headers, parsed.rows);
  const picked = pickTypeColumn(ranked);
  assert.equal(picked && picked.header, 'Case Type');
});

test('spreadsheet promoteHeaderRow skips Lawrenceville title banner', () => {
  const aoa = [
    ['City of Lawrenceville - Code Cases Opened by Violation (05/15/2026 - 06/15/2026)'],
    ['Total Cases: 2'],
    [
      'Case #',
      'Case Type',
      'Case Status',
      'Project',
      'District',
      'Main Address',
      'Parcel',
      'Assigned To',
      'Opened Date',
      'Closed Date'
    ],
    [
      'CEU2026-17728',
      'Vehicles',
      'Closed',
      '',
      'Residential',
      '991 Henry Ter, Lawrenceville, GA 30046',
      '5114 319',
      'Derek Phillips',
      '05/15/2026',
      '05/15/2026'
    ]
  ];
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, sheet, 'Case Log');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const parsed = parseSpreadsheet(buf, 'lawrenceville.xlsx');
  assert.ok(parsed.headers.includes('Case Type'));
  assert.ok(parsed.headers.includes('Main Address'));
  assert.equal(parsed.rows[0]['Case Type'], 'Vehicles');
  assert.match(parsed.rows[0]['Main Address'], /991 Henry Ter/i);
});
