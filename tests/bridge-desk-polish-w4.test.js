/**
 * Wave 4 — Filter desk polish static contracts.
 * 4.1 history open · 4.2 SCAN HISTORY auth · 4.3 auto-save · 4.4 type-confirm · 4.5 loading honesty
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'bridge.css'), 'utf8');

// ---------------------------------------------------------------------------
// 4.1 Prior attaches history open control
// ---------------------------------------------------------------------------

test('W4-4.1: #bridge-history-open button present in city dossier', () => {
  assert.match(html, /id=["']bridge-history-open["']/);
  assert.match(html, /id=["']bridge-history-open["'][^>]*>[\s\S]*?Prior attaches/i);
  // Lives with dossier chrome (not orphaned)
  const dossierIdx = html.indexOf('id="bridge-city-dossier"');
  const openIdx = html.indexOf('id="bridge-history-open"');
  const dossierEnd = html.indexOf('id="bridge-outcome-drawer"');
  assert.ok(dossierIdx >= 0 && openIdx > dossierIdx, 'open control inside dossier region');
  assert.ok(dossierEnd < 0 || openIdx < dossierEnd, 'open control before outcome drawer');
});

test('W4-4.1: history dialog + JS open wiring intact', () => {
  assert.match(html, /id=["']bridge-history-dialog["']/);
  assert.match(js, /getElementById\(['"]bridge-history-open['"]\)/);
  assert.match(js, /function openHistoryDialog\s*\(/);
  assert.match(js, /historyOpenBtn\?\.addEventListener\(['"]click['"]/);
  assert.match(css, /\.bridge-history-open-btn\b/);
});

// ---------------------------------------------------------------------------
// 4.2 SCAN HISTORY auth copy
// ---------------------------------------------------------------------------

test('W4-4.2: SCAN HISTORY auth error does not blame admin', () => {
  assert.match(js, /Sign in to load SCAN HISTORY/);
  assert.equal(
    js.includes('Sign in as admin to load SCAN HISTORY'),
    false,
    'must not say Sign in as admin for list load'
  );
});

// ---------------------------------------------------------------------------
// 4.3 Safer post-train auto-save desk reset
// ---------------------------------------------------------------------------

test('W4-4.3: auto-save soft-confirms before desk reset path', () => {
  assert.match(js, /function queueAutoSaveAfterTrainComplete\s*\(/);
  const start = js.indexOf('function queueAutoSaveAfterTrainComplete');
  assert.ok(start >= 0);
  const body = js.slice(start, start + 1800);
  assert.match(body, /window\.confirm\s*\(/);
  assert.match(body, /Download for Analyze/i);
  assert.match(body, /saveCurrentList\s*\(\s*\{\s*auto:\s*true\s*\}\s*\)/);
});

test('W4-4.3: victory strip receives auto flag and Download for Analyze stays primary', () => {
  assert.match(js, /showVictoryStrip\s*\(/);
  assert.match(js, /auto:\s*(?:true|auto|!!?auto|victoryMeta)/);
  assert.match(js, /List auto-saved/);
  assert.match(html, /id=["']bridge-victory-download["'][^>]*>\s*Download for Analyze\s*</);
});

// ---------------------------------------------------------------------------
// 4.4 Type-confirm admin wall copy
// ---------------------------------------------------------------------------

test('W4-4.4: non-admin Type confirm wall explains memory unlock path', () => {
  const start = js.indexOf("if (!isBridgeAdmin())");
  // Find the TYPE_COLUMN wall specifically near TYPE_COLUMN_CONFIRM_REQUIRED
  const gate = js.indexOf("err.code !== 'TYPE_COLUMN_CONFIRM_REQUIRED'");
  assert.ok(gate >= 0);
  const wall = js.slice(gate, gate + 1200);
  assert.match(wall, /!isBridgeAdmin\s*\(\s*\)/);
  assert.match(wall, /showError\s*\(/);
  assert.match(wall, /Type-column memory|Type column memory|remembered/i);
  assert.match(wall, /Clear Type-column memory|admin/i);
  // Longer guidance than the old one-liner
  assert.match(wall, /future uploads|same format|once/i);
});

// ---------------------------------------------------------------------------
// 4.5 Loading copy honesty (results-first)
// ---------------------------------------------------------------------------

test('W4-4.5: loading path skips live scrub feed play after process', () => {
  // Process success goes straight to results — no playScrubFeedFromProcess call site
  const callSites = js.match(/playScrubFeedFromProcess\s*\(/g) || [];
  // Definition only (or zero) — not invoked from process success path
  assert.ok(
    callSites.length <= 1,
    'playScrubFeedFromProcess must not be called from process path (def only ok)'
  );
  assert.match(js, /Skip address-by-address scrub theater|go straight to results/i);
});

test('W4-4.5: loading slogans are bulk process, not per-address theater', () => {
  const start = js.indexOf('const LOADING_STEPS_BASE');
  assert.ok(start >= 0);
  const end = js.indexOf('];', start);
  const base = js.slice(start, end + 2);
  assert.equal(/address by address|live scrub|scrubbing each/i.test(base), false);
  assert.match(js, /no live address feed|results open when ready|whole file/i);
});

test('W4 cache bust: bridge.js and bridge.css bumped for Wave 4', () => {
  const jsV = html.match(/bridge\.js\?v=(\d+)/);
  const cssV = html.match(/bridge\.css\?v=(\d+)/);
  assert.ok(jsV && Number(jsV[1]) >= 94, 'bridge.js cache bust >= 94');
  assert.ok(cssV && Number(cssV[1]) >= 88, 'bridge.css cache bust >= 88');
});
