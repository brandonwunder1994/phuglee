/**
 * v2.2 Filter Desk Cinema locks (phases 69–73)
 * Static HTML/JS/CSS contracts — no browser automation.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'bridge.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');

const BANNED_CTAS = [
  'Send to Analyze',
  'Push to Analyze',
  'Import to Analyzer',
  'Open in Analyze',
  'Push to Analyzer'
];

// ── Phase 69: One Scrub Desk ───────────────────────────────────────────────

test('DESK-69: scrub stage shell present', () => {
  assert.match(html, /id="bridge-scrub-stage"/);
  assert.match(html, /class="bridge-pipeline bridge-pipeline--slim"/);
});

test('DESK-69: city pick reveals type + upload together', () => {
  assert.match(js, /setHidden\(typePanel, false\)/);
  // Upload panel uses setUploadPanelHidden wrapper (lock-hint sync)
  assert.match(js, /setUploadPanelHidden\(\s*false\s*\)|setHidden\(uploadPanel,\s*false\)/);
  // City change must open upload without waiting for type
  const onCity = js.indexOf('function onCityChange');
  assert.ok(onCity >= 0);
  const body = js.slice(onCity, onCity + 1200);
  assert.match(body, /setUploadPanelHidden\(\s*false\s*\)|setHidden\(uploadPanel,\s*false\)/);
  assert.match(body, /setHidden\(typePanel,\s*false\)/);
});

test('DESK-69: stable climax ids preserved', () => {
  assert.match(html, /id="bridge-dropzone"/);
  assert.match(html, /id="bridge-process"/);
  assert.match(html, /id="bridge-type-panel"/);
  assert.match(html, /id="bridge-upload-panel"/);
  assert.match(html, /Scrub it/);
});

// ── Phase 70: Shift board removed (user request) ───────────────────────────

test('MISSION-70: Shift board UI removed', () => {
  assert.equal(html.includes('Shift board'), false);
  assert.equal(html.includes('bridge-mission-board'), false);
  assert.equal(html.includes('id="bridge-mission-facets"'), false);
});

test('MISSION-70: computeIdleProof still available for victory metrics', () => {
  assert.match(js, /function computeIdleProof\s*\(/);
  assert.match(js, /cityCount/);
  assert.equal(js.includes('/api/bridge/idle-stats'), false);
});

// ── Phase 71: Type chips ───────────────────────────────────────────────────

test('TYPE-71: chips not essay cards', () => {
  // Dual-class allowed (e.g. bridge-type-chips phuglee-chip-group from Phase 77)
  assert.match(html, /class="[^"]*\bbridge-type-chips\b[^"]*"/);
  assert.match(html, /class="[^"]*\bbridge-type-chip\b[^"]*"/);
  assert.match(html, /Code violation/);
  assert.match(html, /Water shut-off/);
  assert.equal(html.includes('bridge-type-card'), false);
  assert.equal(html.includes('bridge-type-desc'), false);
});

test('TYPE-71: same radio contract', () => {
  assert.match(html, /name="bridge-upload-type" value="code_violation"/);
  assert.match(html, /name="bridge-upload-type" value="water_shut_off"/);
});

// ── Phase 72: Post-scrub mission surface ───────────────────────────────────

test('SURFACE-72: mission surface + collapsible table', () => {
  assert.match(html, /id="bridge-mission-surface"/);
  assert.match(html, /id="bridge-results-details"/);
  assert.match(html, /bridge-save-panel--climax/);
  assert.match(html, /bridge-attach-panel--scrap/);
  assert.match(html, /Stage this scrub/);
  assert.match(html, /id="bridge-save-list"[^>]*>\s*Save list\s*</);
});

test('SURFACE-72: CSS hierarchy hooks', () => {
  assert.match(css, /\.bridge-mission-surface\s*\{/);
  assert.match(css, /\.bridge-results-details\s*\{/);
  assert.match(css, /\.bridge-save-panel--climax\s*\{/);
});

// ── Phase 73: War-room victory ─────────────────────────────────────────────

test('VICTORY-73: strip mount + actions', () => {
  assert.match(html, /id="bridge-victory-strip"/);
  assert.match(html, /id="bridge-victory-download"/);
  assert.match(html, /id="bridge-victory-next"/);
  assert.match(html, /List staged/);
  assert.match(html, /Kept leads are ready/);
  assert.match(html, /Filter Data/);
  assert.match(html, /Scrub next city/);
  assert.equal(html.includes('Shift advanced'), false);
});

test('VICTORY-73: show/hide helpers wired', () => {
  assert.match(js, /function showVictoryStrip\s*\(/);
  assert.match(js, /function hideVictoryStrip\s*\(/);
  // reset after save must call victory (function body is long — search full file after def)
  const start = js.indexOf('function resetImportAreaAfterSave');
  assert.ok(start >= 0);
  const end = js.indexOf('\n  async function saveCurrentList', start);
  const body = end > start ? js.slice(start, end) : js.slice(start, start + 12000);
  assert.match(body, /showVictoryStrip\s*\(/);
});

// ── Independence ───────────────────────────────────────────────────────────

test('DESK-CINEMA: no Analyze push CTAs', () => {
  for (const banned of BANNED_CTAS) {
    assert.equal(html.includes(banned), false, `HTML must not contain "${banned}"`);
    assert.equal(js.includes(banned), false, `JS must not contain "${banned}"`);
  }
});
