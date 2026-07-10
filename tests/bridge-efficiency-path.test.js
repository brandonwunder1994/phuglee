/**
 * Phase 59 Efficiency Operator Path locks (EFF-01, EFF-02)
 * Static + source contracts — no browser automation.
 *
 * Wave 0 (Plan 01): as-built pillars GREEN; polish contracts intentionally RED until Plan 02.
 * No production code in this plan.
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

test('EFF-01 polish: post-save Download this list flash affordance', () => {
  // Plan 02: one-click flash download after save, wired to downloadSavedList
  assert.match(js, /Download this list/);
  const hasFlashId = /bridge-flash-download/.test(js);
  const hasFlashAction = /data-action="flash-download"/.test(js);
  assert.ok(
    hasFlashId || hasFlashAction,
    'bridge.js must expose bridge-flash-download id or data-action="flash-download" for post-save download'
  );
});
