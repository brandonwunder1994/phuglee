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

test('LIST-01: saved lists total records footer present', () => {
  assert.match(html, /id="bridge-lists-total"/);
  assert.match(js, /Total:.*record/i);
  assert.match(js, /across.*list/i);
  assert.match(js, /recordCount/);
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

test('processUpload never silent-cancels Type column confirm', () => {
  const i = js.indexOf('async function processUpload');
  assert.ok(i >= 0);
  // Include enough of processUpload for type-confirm + multi-round resume
  const slice = js.slice(i, i + 16000);
  assert.match(
    slice,
    /Type column confirmation was cancelled/,
    'cancel must showError — not silent return after loader'
  );
  assert.match(slice, /collectMultiFormatConfirms/, 'process walks each format via helper');
  assert.match(slice, /maxConfirmRounds|mergeConfirmedFormats/, 'multi-round confirm until process succeeds');
  assert.match(js, /openTypeColumnConfirmDialog/, 'type confirm dialog still used');
  assert.match(js, /fallbackTypeColumnConfirm/, 'must have showModal fallback');
  assert.match(js, /confirmedFormats/, 'client must resume multi-format confirms');
  assert.match(js, /formatsNeedingConfirm/, 'client normalizes formats[] from 409');
  assert.match(js, /filenames/, 'confirms include sheet filenames for server mapping');
  assert.match(js, /waitTypeConfirmDialogClosed/, 'must wait for dialog close between formats');
  assert.match(slice, /processUploadInFlight/, 'must guard double Process clicks');
  // Multi-format resume must not always echo legacy confirmedTypeHeader (wildcard risk)
  assert.match(
    slice,
    /confirmedFormats\.length === 1/,
    'legacy single-format fields only when one mapping confirmed'
  );
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

test('LIST-02: auto-save list when all Train groups decided', () => {
  assert.match(js, /function queueAutoSaveAfterTrainComplete/);
  assert.match(js, /queueAutoSaveAfterTrainComplete\s*\(/);
  assert.match(js, /saveCurrentList\(\s*\{\s*auto:\s*true\s*\}\s*\)/);
  // Only after last remaining group (meta.remaining === 0), not on process
  const onTrain = js.indexOf('async function onTrainDecision');
  assert.ok(onTrain >= 0);
  const slice = js.slice(onTrain, onTrain + 3500);
  assert.match(slice, /meta\.remaining\s*===\s*0/);
  assert.match(slice, /queueAutoSaveAfterTrainComplete/);
  // Soft confirm skipped for auto path
  const saveStart = js.indexOf('async function saveCurrentList');
  const saveHead = js.slice(saveStart, saveStart + 1200);
  assert.match(saveHead, /!auto\s*&&\s*isBridgeAdmin|!auto && isBridgeAdmin/);
});

test('LIST-01: save flash teaches download from Saved lists', () => {
  assert.match(js, /download from Saved lists for enrichment/);
});

test('LIST-01: resetImportAreaAfterSave fully resets filter session for next city', () => {
  const start = js.indexOf('function resetImportAreaAfterSave');
  assert.ok(start >= 0, 'resetImportAreaAfterSave must exist');
  const rest = js.slice(start + 1);
  const next = rest.search(/\n  (?:async )?function \w+/);
  const slice = next >= 0 ? js.slice(start, start + 1 + next) : js.slice(start, start + 4500);
  // Full fresh-list reset (not partial keep-city) so Port Arthur etc. cannot inherit prior city
  assert.match(slice, /selectedCity\s*=\s*null/);
  assert.match(slice, /selectedUploadType\s*=\s*['"]['"]/);
  assert.match(slice, /lastResult\s*=\s*null/);
  assert.match(slice, /clearResponseDateTime/);
  assert.match(slice, /clearTrainDecidedKeys|trainDecidedKeys\.clear/);
  assert.match(slice, /trainUndoStack\.length\s*=\s*0/);
  assert.match(slice, /setPipelineStep\(\s*['"]location['"]\s*\)/);
  assert.match(slice, /Filter reset|pick the next city/i);
  // Still no auto-download on save
  const withoutStrings = slice
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  assert.equal(/downloadSavedList\s*\(/.test(withoutStrings), false);
});

test('LIST-03: teaching pack corpus in HTML', () => {
  // Inventory subtext removed; empty-state + workflow still teach path
  assert.match(html, /lists stay until you delete/i);
  assert.match(html, /Process → \(Train\) → Save list → Download/);
  assert.match(html, /skip-trace|external enrichment/i);
  assert.match(html, /Import into Analyze only after skip-trace|import into Analyze manually/i);
});

test('LIST-03: independence process stub still present in JS', () => {
  assert.match(js, /nothing was sent to Analyze/);
  // Train complete auto-saves the staged list (no manual Save list click)
  assert.match(js, /All Train groups (done|complete).*auto-sav/i);
  assert.match(js, /queueAutoSaveAfterTrainComplete/);
});
