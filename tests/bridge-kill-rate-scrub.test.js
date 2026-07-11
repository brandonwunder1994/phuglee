/**
 * Phase 65 Kill-Rate Scrub Report locks (KILL-01, KILL-02, KILL-03)
 * Wave 0 static + source contracts — no browser automation.
 *
 * Plan 01: CTA/independence carry-forwards GREEN today;
 * hierarchy/proof/sample contracts intentionally RED until Plan 02/03.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'bridge.css'), 'utf8');

const BANNED_CTAS = [
  'Send to Analyze',
  'Push to Analyze',
  'Import to Analyzer',
  'Open in Analyze',
  'Push to Analyzer'
];

// ---------------------------------------------------------------------------
// KILL-03 / LIST-EFF carry-forwards (must stay GREEN forever)
// ---------------------------------------------------------------------------

test('KILL-03 carry-forward: Save list primary CTA', () => {
  assert.match(html, /id="bridge-save-list"/);
  assert.match(html, /Save list/);
  assert.match(html, /phuglee-btn-primary/);
});

test('KILL-03 carry-forward: Preview CSV secondary', () => {
  assert.match(html, /id="bridge-export-csv"/);
  assert.match(html, /Preview CSV/);
  assert.equal(html.includes('>Export CSV<'), false, 'must not use Export CSV button label');
});

test('KILL-03: no Analyze push CTAs', () => {
  for (const banned of BANNED_CTAS) {
    assert.equal(html.includes(banned), false, `HTML must not contain "${banned}"`);
    assert.equal(js.includes(banned), false, `JS must not contain "${banned}"`);
  }
});

test('carry-forward: independence wording in bridge.js', () => {
  assert.match(js, /nothing was sent to Analyze/);
});

test('carry-forward: Format reused string (EFF)', () => {
  assert.match(js, /Format reused/);
});

test('carry-forward: renderKpis still defined', () => {
  assert.match(js, /function\s+renderKpis/);
});

test('carry-forward: kill report host id', () => {
  assert.match(html, /id="bridge-kpi-grid"/);
});

// ---------------------------------------------------------------------------
// KILL-01 hierarchy (expect FAIL until Plan 02)
// ---------------------------------------------------------------------------

test('KILL-01: RAW → KILLED → KEPT labels in bridge.js', () => {
  // Mission hierarchy labels in kill-report HTML strings (not comments-only)
  assert.match(js, /\bRAW\b/);
  assert.match(js, /\bKILLED\b/);
  assert.match(js, /\bKEPT\b/);
  // Prefer class markers for the three scale steps
  const hasClassMarkers =
    /bridge-kill-stat--raw/.test(js) ||
    /bridge-kill-stat--killed/.test(js) ||
    /bridge-kill-stat--kept/.test(js);
  assert.ok(
    hasClassMarkers,
    'bridge.js must emit bridge-kill-stat--raw|killed|kept class markers for hierarchy'
  );
});

test('KILL-01: discardReasons drives kill-reason breakdown', () => {
  const start = js.indexOf('function renderKpis');
  assert.ok(start >= 0, 'function renderKpis must exist');
  // Include renderKpis body plus nearby kill-report helpers it may call
  const slice = js.slice(start, start + 4500);
  const helperNames = ['renderKillReport', 'buildKillReasons', 'buildKillReport', 'renderKillReasons'];
  let helperSlice = '';
  for (const name of helperNames) {
    const hi = js.indexOf(`function ${name}`);
    if (hi >= 0) helperSlice += js.slice(hi, hi + 2500);
  }
  const combined = slice + '\n' + helperSlice;
  assert.match(
    combined,
    /discardReasons/,
    'renderKpis (or kill-report helper) must reference discardReasons for reason chips'
  );
});

test('KILL-01: CSS kill-flow hierarchy classes', () => {
  const hasFlow = /\.bridge-kill-flow/.test(css) || /\.bridge-kill-report/.test(css);
  assert.ok(hasFlow, 'css must define .bridge-kill-flow or .bridge-kill-report');
  assert.match(css, /\.bridge-kill-stat\b/);
  // Kept step uses gold/orange heat, not only generic green success
  assert.match(css, /\.bridge-kill-stat--kept/);
});

// ---------------------------------------------------------------------------
// KILL-02 proof chips (expect FAIL until Plan 02)
// ---------------------------------------------------------------------------

test('KILL-02: proof chip / duration surface', () => {
  assert.match(
    js,
    /bridge-proof-chip|proof-chips|Scrubbed in|s scrub/i,
    'js must surface proof chips or scrub duration language near results'
  );
});

test('KILL-02: format reuse still chip-capable', () => {
  assert.match(js, /Format reused/);
});

// ---------------------------------------------------------------------------
// KILL-03 Stage voice (may green if Stage teaching already present)
// ---------------------------------------------------------------------------

test('KILL-03: Stage language near save without renaming button', () => {
  // Stage teaching in results/save panel (heading/lead/CTA strip)
  const stageInHtml = /Stage/.test(html);
  const stageInJs = /Stage/.test(js);
  assert.ok(
    stageInHtml || stageInJs,
    'HTML or JS must contain Stage language near save/results teaching'
  );
  // Primary button text remains Save list (not Stage list only)
  assert.match(html, /id="bridge-save-list"[^>]*>\s*Save list\s*</);
  assert.equal(
    /id="bridge-save-list"[^>]*>\s*Stage list\s*</.test(html),
    false,
    'primary button must remain Save list, not Stage list'
  );
});

// ---------------------------------------------------------------------------
// Optional: kept sample dossiers (RED until Plan 02 or 03 ships samples)
// ---------------------------------------------------------------------------

test('KILL-01 optional: kept sample dossiers class', () => {
  assert.match(
    js,
    /bridge-kept-sample/,
    'bridge.js should include bridge-kept-sample(s) class for dossier strip when samples ship'
  );
});
