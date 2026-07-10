/**
 * Phase 56 List Factory UX locks (LIST-01, LIST-02, LIST-03)
 * Static + source contracts — no browser automation.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const api = fs.readFileSync(path.join(ROOT, 'lib', 'bridge-api.js'), 'utf8');

const BANNED_CTAS = [
  'Send to Analyze',
  'Push to Analyze',
  'Import to Analyzer',
  'Open in Analyze',
  'Push to Analyzer'
];

test('LIST-01: Save list primary CTA present in HTML', () => {
  assert.match(html, /id="bridge-save-list"/);
  assert.match(html, /Save list/);
  assert.match(html, /phuglee-btn-primary/);
});

test('LIST-01: Download all bulk path present', () => {
  assert.match(html, /id="bridge-download-all-csv"/);
  assert.match(html, /Download all \(CSV\)/);
  assert.match(html, /id="bridge-download-all-xlsx"/);
  assert.match(html, /Download all \(XLSX\)/);
});

test('LIST-01: Preview CSV de-emphasizes export (not Export CSV label)', () => {
  assert.match(html, /id="bridge-export-csv"/);
  assert.match(html, /Preview CSV/);
  assert.equal(html.includes('>Export CSV<'), false);
});

test('LIST-01: no Send/Push Analyze CTAs in Filter HTML or JS', () => {
  for (const banned of BANNED_CTAS) {
    assert.equal(html.includes(banned), false, `HTML must not contain "${banned}"`);
    assert.equal(js.includes(banned), false, `JS must not contain "${banned}"`);
  }
});

test('LIST-02: handleProcess does not call clearAllLists', () => {
  const start = api.indexOf('async function handleProcess');
  assert.ok(start >= 0, 'handleProcess must exist');
  const rest = api.slice(start + 1);
  const next = rest.search(/\nasync function handle/);
  const slice = next >= 0 ? api.slice(start, start + 1 + next) : api.slice(start, start + 8000);
  assert.equal(slice.includes('clearAllLists'), false, 'process must not wipe list store');
});

test('LIST-02: dirty-guard strings present on processUpload', () => {
  assert.match(js, /kept row\(s\) that are not saved yet/);
  assert.match(js, /Process a new file anyway\? Unsaved work \(including any Train decisions\) will be lost\./);
  const i = js.indexOf('async function processUpload');
  assert.ok(i >= 0);
  const head = js.slice(i, i + 2500);
  assert.match(head, /window\.confirm/);
  assert.match(head, /not saved yet/);
});

test('LIST-02: soft Train-before-Save for admin in saveCurrentList', () => {
  assert.match(js, /Train group\(s\) are still visible\. Save this list now\?/);
  assert.match(js, /Finish Approve\/Deny first so this download matches your decisions\./);
  const i = js.indexOf('async function saveCurrentList');
  assert.ok(i >= 0);
  const head = js.slice(i, i + 1800);
  assert.match(head, /isBridgeAdmin/);
  assert.match(head, /window\.confirm/);
});

test('LIST-01: save flash teaches download from Saved lists', () => {
  assert.match(js, /download from Saved lists for enrichment/);
});

test('LIST-03: teaching pack corpus in HTML', () => {
  assert.match(html, /download from Saved lists for external enrichment/);
  assert.match(html, /lists stay until you delete/);
  assert.match(html, /Process → \(Train\) → Save list → Download/);
  assert.match(html, /skip-trace|external enrichment/i);
  assert.match(html, /import into Analyze manually|Import into Analyze only after skip-trace/i);
});

test('LIST-03: independence process stub still present in JS', () => {
  assert.match(js, /nothing was sent to Analyze/);
  assert.match(js, /Decision saved to brain\. Save list below when this city is ready\./);
});
