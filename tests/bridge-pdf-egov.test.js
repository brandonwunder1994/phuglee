const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractEgovPirFromText,
  looksLikeActionFormHeader,
  normalizeActionFormName
} = require('../lib/bridge-engine/parsers/pdf-egov');
const { scoreTypeColumns, pickTypeColumn } = require('../lib/bridge-type-column-score');
const { parseAoaAsSpreadsheet } = require('../lib/bridge-engine/parsers/pdf');

// OCR-style text from Harlingen Junk & Debris PIR (Action Form Name column present)
const JUNK_OCR_FIXTURE = `
Issue
E-Gov Link Action Form Street Issue Street
Tracking # Name Date Submitted Department Number Name Issue City Form Values
Property
Maint. Code Code BOARDWALK. How long has this been a problem [New] Type of property [Residential-single family house] Areas in Disrepair [Junk or Debris] Describe violation in more detail [Reporting
17574250946 Violation 6/29/2026 9:46 Compliance 3525 AVE. Harlingen  junk/debris on a vacant lot located at 3525 Boardwalk Ave., tires and TV.]
Property
Maint. Code Code SOUTHGATE How long has this been a problem [New] Type of property [Commercial] Areas in Disrepair [Junk or Debris] Describe violation in more detail [Reporting junk/debris on a
17570851155 Violation 6/25/2026 11:55 Compliance 204 RD Harlingen vacant lot located at 204 Southgate Rd., tires and mattresses]
Property WEST
Maint. Code Code LOUISIANA How long has this been a problem [New] Areas in Disrepair [Other not listed] Describe violation in more detail [Reporting illegal dumping
17570551037 Violation 6/25/2026 10:37 Compliance 801 STREET Harlingen from a vacant lot located at 801 Louisiana.]
`;

const GRASS_GARBLED_FIXTURE = `
E-Goll Llm Trac A<llon Fom, N..,.. Dalt suomnte Department Issue Street
17583810910 G11SScomp1a1n1 7/1/2026 9:10 CodeCompU.nce 1000 BLK OF NORTH B STREET
17578511026 Grasscomplatnt 7/1/2026 10:26 Code Compliance 502 WOODHOLLOW
17575471 Grass complaint 6/29/2026 14:22 Code Compliance 3205 ADAMS LANDING
`;

test('detects Action Form Name header signal (including garbled)', () => {
  assert.equal(looksLikeActionFormHeader('Action Form Name Date Submitted'), true);
  assert.equal(looksLikeActionFormHeader('A<llon Fom, N..,.. Dalt suomnte'), true);
  assert.equal(looksLikeActionFormHeader('random city report'), false);
});

test('normalizeActionFormName maps grass/maint variants', () => {
  assert.equal(normalizeActionFormName('G11SScomp1a1n1'), 'Grass complaint');
  assert.equal(normalizeActionFormName('Grass complaint'), 'Grass complaint');
  assert.equal(normalizeActionFormName('Property Maint. Code Violation'), 'Property Maint. Code Violation');
});

test('extractEgovPirFromText keeps Action Form Name column from OCR junk report', () => {
  const extracted = extractEgovPirFromText(JUNK_OCR_FIXTURE);
  assert.ok(extracted, 'expected PIR extract');
  assert.ok(extracted.headers.includes('Action Form Name'));
  assert.ok(extracted.rows.length >= 2, `expected >=2 rows, got ${extracted.rows.length}`);
  assert.ok(
    extracted.rows.every((r) => /Property Maint|Grass/i.test(r['Action Form Name'])),
    JSON.stringify(extracted.rows.map((r) => r['Action Form Name']))
  );
  assert.ok(extracted.rows.some((r) => /Boardwalk|3525/i.test(r['Street Address'])));
});

test('Action Form Name wins Type-column scoring after Excel conversion', () => {
  const extracted = extractEgovPirFromText(JUNK_OCR_FIXTURE);
  const parsed = parseAoaAsSpreadsheet(extracted.aoa, { parseMode: 'egov-pir-to-xlsx' });
  assert.ok(parsed.headers.includes('Action Form Name'));
  const ranked = scoreTypeColumns(parsed.headers, parsed.rows);
  const picked = pickTypeColumn(ranked);
  assert.ok(picked, 'expected a Type pick');
  assert.match(picked.header, /Action Form Name/i);
});

test('extractEgovPirFromText recovers grass form from garbled PDF text', () => {
  const extracted = extractEgovPirFromText(GRASS_GARBLED_FIXTURE);
  assert.ok(extracted);
  assert.ok(extracted.rows.length >= 2, `got ${extracted.rows.length}`);
  assert.ok(
    extracted.rows.every((r) => r['Action Form Name'] === 'Grass complaint'),
    JSON.stringify(extracted.rows.map((r) => r['Action Form Name']))
  );
  assert.ok(extracted.rows.some((r) => /WOODHOLLOW|ADAMS|NORTH/i.test(r['Street Address'])));
});
