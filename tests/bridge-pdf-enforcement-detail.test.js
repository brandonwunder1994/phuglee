/**
 * Gainesville-style Enforcement Cases Detail (sideways OCR + GENF IDs).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  extractEnforcementDetailAoa,
  looksLikeEnforcementDetail,
  extractLocation,
  extractStatus,
  normalizeLocation
} = require('../lib/bridge-engine/parsers/pdf-enforcement-detail');
const { parseTextBlob } = require('../lib/bridge-engine/parsers/pdf');
const { scoreTypeColumns, pickTypeColumn } = require('../lib/bridge-type-column-score');
const { scoreOcrText } = require('../lib/bridge-engine/parsers/pdf-ocr');

const FIXTURE = path.join(
  __dirname,
  'fixtures',
  'bridge',
  'gainesville-enforcement-detail-ocr.txt'
);

test('looksLikeEnforcementDetail detects GENF / Enforcement Cases Detail', () => {
  const text = fs.readFileSync(FIXTURE, 'utf8');
  assert.equal(looksLikeEnforcementDetail(text), true);
  assert.equal(looksLikeEnforcementDetail('random municipal noise'), false);
});

test('normalizeLocation repairs truncated GAINESVILLE tails', () => {
  assert.match(
    normalizeLocation('670 HARBOR COVE NW, GAINESVILLE, G'),
    /GAINESVILLE,\s*GA/i
  );
  assert.match(
    normalizeLocation('1198 DAWSONVILLE HIGHWAY NW, GAIN'),
    /GAINESVILLE/i
  );
});

test('extractLocation pulls CAPS address after record id chunk', () => {
  const { location } = extractLocation(
    ' 3182 HERITAGE GLEN DRIVE SE, GAINES 3182 Heritage Glen, warning left on door'
  );
  assert.match(location, /3182\s+HERITAGE\s+GLEN\s+DRIVE/i);
});

test('extractStatus normalizes truncated OCR statuses', () => {
  assert.equal(
    extractStatus('Code Officer Initiated Closed - Violation Correc 0'),
    'Closed - Violation Corrected'
  );
  assert.equal(
    extractStatus('Closed - Duplicate 6/25/26'),
    'Closed - Duplicate'
  );
  assert.equal(
    extractStatus('Closed - Violation Abated 6/22/26'),
    'Closed - Violation Abated'
  );
});

test('extractEnforcementDetailAoa rebuilds columns from Gainesville OCR fixture', () => {
  const text = fs.readFileSync(FIXTURE, 'utf8');
  const extracted = extractEnforcementDetailAoa(text);
  assert.ok(extracted, 'must extract enforcement-detail table');
  assert.ok(extracted.rowCount >= 8, `expected >=8 rows, got ${extracted.rowCount}`);
  assert.deepEqual(extracted.aoa[0][0], 'Record ID');
  assert.ok(extracted.aoa[0].includes('Location'));
  assert.ok(extracted.aoa[0].includes('Violation Type'));

  const byId = {};
  for (const row of extracted.aoa.slice(1)) {
    byId[row[0]] = row;
  }

  assert.ok(byId['GENF26-0552'], 'missing GENF26-0552');
  assert.match(byId['GENF26-0552'][1], /1198\s+DAWSONVILLE\s+HIGHWAY/i);

  assert.ok(byId['GENF26-0626'], 'missing GENF26-0626');
  assert.match(byId['GENF26-0626'][1], /670\s+HARBOR\s+COVE/i);
  assert.equal(byId['GENF26-0626'][5], 'Closed - Duplicate');

  assert.ok(byId['GENF26-0609'], 'missing GENF26-0609');
  assert.equal(byId['GENF26-0609'][5], 'Closed - Violation Abated');

  // Every kept row must have a usable house-number address
  for (const row of extracted.aoa.slice(1)) {
    assert.match(
      row[1],
      /\d{1,6}\s+[A-Za-z]/,
      `bad location for ${row[0]}: ${row[1]}`
    );
  }
});

test('parseTextBlob prefers enforcement-detail path with Location + Violation Type', () => {
  const text = fs.readFileSync(FIXTURE, 'utf8');
  const parsed = parseTextBlob(text, {
    fromOcr: true,
    filename: 'ORR-26-1426-Redacted.xlsx',
    ocrConfidence: 72
  });
  assert.ok(parsed);
  assert.match(String(parsed.parseMode || ''), /enforcement-detail/);
  assert.ok(parsed.headers.includes('Location'));
  assert.ok(parsed.headers.includes('Violation Type'));
  assert.ok(parsed.headers.includes('Record ID'));
  assert.ok(parsed.rows.length >= 8);

  const ranked = scoreTypeColumns(parsed.headers, parsed.rows);
  const picked = pickTypeColumn(ranked);
  // Violation Type should rank as a type column candidate
  assert.ok(
    ranked.some((c) => /violation\s*type/i.test(c.header)),
    `expected Violation Type in ranked: ${ranked.map((c) => c.header).join(', ')}`
  );
  assert.ok(picked, 'should pick a type column');
});

test('scoreOcrText rewards GENF / Enforcement Cases Detail upright text', () => {
  const upright = fs.readFileSync(FIXTURE, 'utf8').slice(0, 1200);
  const garbage = '2 w wl lelwlel ole] [ef |sle | |2 2|z(w 5) 0 eee]';
  assert.ok(
    scoreOcrText(upright) > scoreOcrText(garbage) + 50,
    `upright ${scoreOcrText(upright)} should beat garbage ${scoreOcrText(garbage)}`
  );
});
