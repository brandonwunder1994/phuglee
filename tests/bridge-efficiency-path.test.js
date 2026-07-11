/**
 * Phase 59 Efficiency Operator Path locks (EFF-01, EFF-02)
 * Static + source contracts — no browser automation.
 *
 * Plan 01 Wave 0: as-built GREEN + polish RED.
 * Plan 02: polish GREEN (Format reused meta + post-save Download this list flash).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const trainJsPath = path.join(ROOT, 'public', 'js', 'bridge-train.js');
const trainJs = fs.existsSync(trainJsPath)
  ? fs.readFileSync(trainJsPath, 'utf8')
  : '';
const engine = fs.readFileSync(path.join(ROOT, 'lib', 'bridge-engine', 'index.js'), 'utf8');
const combinedTrainJs = js + '\n' + trainJs;

const BANNED_CTAS = [
  'Send to Analyze',
  'Push to Analyze',
  'Import to Analyzer',
  'Open in Analyze',
  'Push to Analyzer'
];

// ---------------------------------------------------------------------------
// EFF-01 as-built path locks (must stay GREEN)
// Runtime GATE-03 also covered in tests/bridge-engine.test.js — keep green at phase gate.
// ---------------------------------------------------------------------------

test('EFF-01: GATE-03 auto_reuse + formatMatched still present in engine', () => {
  assert.match(engine, /auto_reuse/);
  assert.match(engine, /formatMatched/);
  // memoryMatch drives the day-2 reuse branch (source = 'auto_reuse')
  assert.match(engine, /memoryMatch/);
  assert.match(engine, /source\s*=\s*['"]auto_reuse['"]/);
});

test('EFF-01: bulk download-all anchors present in HTML', () => {
  assert.match(html, /id="bridge-download-all-csv"/);
  assert.match(html, /Download all \(CSV\)/);
  assert.match(html, /id="bridge-download-all-xlsx"/);
  assert.match(html, /Download all \(XLSX\)/);
});

test('EFF-01: Save list primary CTA carry-forward in HTML', () => {
  assert.match(html, /id="bridge-save-list"/);
  assert.match(html, /Save list/);
});

test('EFF-01: stacked Train chrome still builds group cards with Approve/Deny', () => {
  assert.match(combinedTrainJs, /bridge-train-group/);
  assert.match(combinedTrainJs, /data-action="approve"/);
  assert.match(combinedTrainJs, /data-action="deny"/);
});

// ---------------------------------------------------------------------------
// EFF-01 polish contracts (intentionally RED until Plan 02)
// Grouped so Plan 02 can green the whole file without rewriting assertions.
// ---------------------------------------------------------------------------

test('EFF-01 polish: Format reused operator chip string in bridge.js', () => {
  // Plan 02 ships results-meta chip when typeResolution.source === 'auto_reuse'
  assert.match(js, /Format reused/);
});

test('EFF-01 polish: post-save Scanned toast confirmation', () => {
  // Plan 02 evolved: big “Scanned” toast instead of long staged teaching flash
  assert.match(js, /function showScannedToast\s*\(/);
  assert.match(js, /bridge-scanned-toast/);
  assert.match(js, /Scanned/);
  assert.equal(
    /Staged [“"]/.test(js) || /Filter reset — pick the next city/.test(js),
    false,
    'must not show long staged teaching flash'
  );
  // Post-save session is fully reset so next city cannot inherit prior city/type/results
  assert.match(js, /selectedCity\s*=\s*null/);
});

// ---------------------------------------------------------------------------
// EFF-01 keyboard (Plan 03): A/Enter approve, D deny — first undecided card only
// ---------------------------------------------------------------------------

test('EFF-01 keyboard: document keydown handler for Train approve/deny', () => {
  // Plan 03: document-level keydown for A/Enter (approve) and D (deny)
  assert.match(js, /addEventListener\s*\(\s*['"]keydown['"]/);
  assert.match(js, /resultsMode\s*!==\s*['"]train['"]|resultsMode\s*===\s*['"]train['"]/);
  // Key map: a/A/Enter → approve; d/D → deny
  assert.match(js, /['"]a['"]|key\s*===\s*['"]a['"]|key\s*===\s*['"]A['"]/);
  assert.match(js, /['"]d['"]|key\s*===\s*['"]d['"]|key\s*===\s*['"]D['"]/);
  assert.match(js, /approve/);
  assert.match(js, /deny/);
  // Must reuse onTrainDecision so Deny≥10 confirm stays
  assert.match(js, /onTrainDecision/);
  // First actionable card only (not bulk loop over all groups)
  assert.match(js, /bridge-train-group/);
  assert.match(js, /DENY_CONFIRM_THRESHOLD/);
  assert.match(js, /filterUndecidedTrainGroups|renderTrainGroups/);
});

test('EFF-01 keyboard: ignores typing in INPUT/TEXTAREA and modifier keys', () => {
  // Guardrails: never fire when search/list name focused
  assert.match(js, /INPUT|TEXTAREA|SELECT|contenteditable/);
  assert.match(js, /ctrlKey|metaKey|altKey/);
});

// ---------------------------------------------------------------------------
// EFF-02 anti-pattern locks (must stay GREEN through Plans 02–03)
// Efficiency must not rubber-stamp confirm, hide Train, silent-drop, or re-couple Analyze.
// ---------------------------------------------------------------------------

test('EFF-02: no banned Analyze push CTAs in bridge HTML or JS', () => {
  for (const banned of BANNED_CTAS) {
    assert.equal(html.includes(banned), false, `HTML must not contain "${banned}"`);
    assert.equal(js.includes(banned), false, `JS must not contain "${banned}"`);
  }
});

test('EFF-02: bridge-analyzer-push.js module must not exist', () => {
  const pushPath = path.join(ROOT, 'lib', 'bridge-analyzer-push.js');
  assert.equal(fs.existsSync(pushPath), false, 'lib/bridge-analyzer-push.js must remain absent');
});

test('EFF-02: processUpload does not auto-save lists', () => {
  const start = js.indexOf('async function processUpload');
  assert.ok(start >= 0, 'async function processUpload must exist');
  const rest = js.slice(start + 1);
  // Next top-level async function ends the body (IIFE-indented functions still match \n  async function)
  const next = rest.search(/\n  async function \w+/);
  const slice = next >= 0 ? js.slice(start, start + 1 + next) : js.slice(start, start + 6000);
  assert.equal(
    slice.includes('saveCurrentList('),
    false,
    'processUpload must not call saveCurrentList('
  );
  assert.equal(
    slice.includes('/api/bridge/lists'),
    false,
    'processUpload must not POST /api/bridge/lists'
  );
});

test('EFF-02: GATE-02 TYPE_COLUMN_CONFIRM_REQUIRED still present in engine', () => {
  assert.match(engine, /TYPE_COLUMN_CONFIRM_REQUIRED/);
});

test('EFF-02: renderResults still calls renderTrainGroups for admin path', () => {
  // Prefer exact signature so we do not land on renderResultsTable
  let start = js.indexOf('function renderResults(data)');
  if (start < 0) start = js.search(/function renderResults\s*\(/);
  assert.ok(start >= 0, 'function renderResults must exist');
  // Slice until next top-level function declaration at same indent
  const rest = js.slice(start + 1);
  const next = rest.search(/\n  function \w+/);
  const slice = next >= 0 ? js.slice(start, start + 1 + next) : js.slice(start, start + 4000);
  assert.match(slice, /renderTrainGroups/);
  assert.match(slice, /isBridgeAdmin/);
});

test('EFF-02: gold accuracy suite still present on disk', () => {
  const goldPath = path.join(ROOT, 'tests', 'bridge-accuracy-gold.test.js');
  assert.equal(fs.existsSync(goldPath), true, 'tests/bridge-accuracy-gold.test.js must exist');
});

test('EFF-02: resetImportAreaAfterSave does not auto-invoke download', () => {
  // Flash may *create* a button that calls download on click; bare auto-invoke is banned.
  const start = js.indexOf('function resetImportAreaAfterSave');
  assert.ok(start >= 0, 'function resetImportAreaAfterSave must exist');
  const rest = js.slice(start + 1);
  const next = rest.search(/\n  (?:async )?function \w+/);
  const slice = next >= 0 ? js.slice(start, start + 1 + next) : js.slice(start, start + 3000);
  // Strip string literals and comments so button onclick text does not false-positive
  const withoutStrings = slice
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(
    /downloadSavedList\s*\(/.test(withoutStrings),
    false,
    'resetImportAreaAfterSave must not auto-call downloadSavedList('
  );
  assert.equal(
    /downloadAllSavedLists\s*\(/.test(withoutStrings),
    false,
    'resetImportAreaAfterSave must not auto-call downloadAllSavedLists('
  );
});
