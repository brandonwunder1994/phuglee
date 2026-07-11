/**
 * Phase 63 Idle Proof & Process Climax locks (IDLE-01, IDLE-02)
 * Static HTML/JS contracts — no browser automation, no live feed / kill-report scope.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');

const BANNED_CTAS = [
  'Send to Analyze',
  'Push to Analyze',
  'Import to Analyzer',
  'Open in Analyze',
  'Push to Analyzer'
];

// ── IDLE-01: Shift board removed — helpers may remain for victory metrics ──

test('IDLE-01: Shift board UI removed from Filter page', () => {
  assert.equal(html.includes('Shift board'), false, 'Shift board kicker must be gone');
  assert.equal(html.includes('bridge-mission-board'), false, 'mission board class must be gone');
  assert.equal(html.includes('id="bridge-idle-proof"'), false, 'idle proof mount removed');
});

test('IDLE-01: computeIdleProof retained for inventory metrics (no UI board)', () => {
  assert.match(js, /function computeIdleProof\s*\(/);
  assert.match(js, /function renderIdleProof\s*\(/);
  assert.equal(
    js.includes('/api/bridge/idle-stats'),
    false,
    'must not introduce /api/bridge/idle-stats'
  );
});

// ── IDLE-02: Process climax + date gates ───────────────────────────────────

test('IDLE-02: stable upload climax ids', () => {
  assert.match(html, /id="bridge-dropzone"/);
  assert.match(html, /id="bridge-response-date"/);
  assert.match(html, /id="bridge-process"/);
  assert.match(html, /id="bridge-date-chips"/);

  // Dropzone stage before response date (climax hierarchy)
  const start = html.indexOf('id="bridge-upload-panel"');
  const end = html.indexOf('id="bridge-loading-panel"');
  const panel = html.slice(start, end > start ? end : start + 4000);
  const d = panel.indexOf('id="bridge-dropzone"');
  const r = panel.indexOf('id="bridge-response-date"');
  assert.ok(d >= 0 && r >= 0, 'dropzone and response date in upload panel');
  assert.ok(
    d < r || panel.includes('bridge-response-row--meta'),
    'dropzone before date, or date demoted to meta row'
  );
  assert.match(panel, /required|bridge-date-chips/, 'response date chips or required field present');
});

test('IDLE-02: received date chips (today + last 7 days)', () => {
  assert.match(js, /function buildResponseDateChips\s*\(/);
  assert.match(js, /function setResponseDateYmd\s*\(/);
  assert.match(js, /Today/);
  assert.match(js, /offset <= 7|offset < 8/);
});

test('IDLE-02: process date gate preserved', () => {
  assert.match(js, /function getResponseAtValue\s*\(/);
  assert.match(
    js,
    /Enter the date the city sent this list before processing\./
  );

  const i = js.indexOf('async function processUpload');
  assert.ok(i >= 0, 'processUpload must exist');
  const head = js.slice(i, i + 2500);
  assert.match(head, /getResponseAtValue\s*\(/);
  assert.match(head, /Enter the date the city sent this list before processing\./);
});

test('IDLE-02: process FormData omits response date', () => {
  const bi = js.indexOf('function buildProcessFormData');
  assert.ok(bi >= 0, 'buildProcessFormData must exist');
  const body = js.slice(bi, bi + 1200);
  assert.equal(
    /append\(['"]response/.test(body),
    false,
    'process multipart must not append responseAt / responseReceivedAt'
  );
  assert.equal(
    body.includes('responseReceivedAt'),
    false,
    'buildProcessFormData must not mention responseReceivedAt'
  );
});

// ── Scope hygiene ──────────────────────────────────────────────────────────

test('IDLE hygiene: no banned Analyze push CTAs', () => {
  for (const banned of BANNED_CTAS) {
    assert.equal(html.includes(banned), false, `HTML must not contain "${banned}"`);
    assert.equal(js.includes(banned), false, `JS must not contain "${banned}"`);
  }
});
