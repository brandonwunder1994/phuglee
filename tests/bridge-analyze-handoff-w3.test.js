/**
 * Wave 3 — Analyze path (Decision A): manual import only.
 * Static contracts for primary Download for Review, post-save checklist,
 * and honest loading copy when skip-already-imported is off.
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
  'Send to Review',
  'Push to Review',
  'Import to Reviewr',
  'Open in Review',
  'Push to Reviewr'
];

// ---------------------------------------------------------------------------
// 3.1 Primary Download for Review
// ---------------------------------------------------------------------------

test('W3-3.1: victory primary is Download for Review (csv flash-download)', () => {
  assert.match(html, /id="bridge-victory-download"[^>]*data-action="flash-download"/);
  assert.match(html, /id="bridge-victory-download"[^>]*data-format="csv"/);
  assert.match(html, /id="bridge-victory-download"[^>]*>\s*Download for Review\s*</);
  assert.equal(html.includes('Filter Data'), false, 'legacy Filter Data label must be gone');
});

test('W3-3.1: scan-history primary CSV is Download for Review', () => {
  assert.match(html, /id="bridge-download-all-csv"[^>]*>\s*Download for Review\s*</);
  assert.match(js, /Download for Review \(filtered\)|Download for Review/);
});

test('W3-3.1: Full Excel + batch 5k live under Advanced export details', () => {
  assert.match(html, /id="bridge-export-advanced"/);
  assert.match(html, /Advanced export/);
  const advStart = html.indexOf('id="bridge-export-advanced"');
  assert.ok(advStart >= 0);
  const advSlice = html.slice(advStart, advStart + 1200);
  assert.match(advSlice, /id="bridge-download-full-xlsx"/);
  assert.match(advSlice, /id="bridge-download-batched-xlsx"/);
  assert.match(advSlice, /id="bridge-download-batched-csv"/);
  assert.match(advSlice, /id="bridge-download-all-xlsx"/);
  // Primary CSV is outside details
  const csvIdx = html.indexOf('id="bridge-download-all-csv"');
  assert.ok(csvIdx >= 0 && csvIdx < advStart, 'primary CSV must precede Advanced export');
});

test('W3-3.1: CSS advanced export + checklist hooks', () => {
  assert.match(css, /\.bridge-export-advanced\b/);
  assert.match(css, /\.bridge-victory-checklist\b/);
});

// ---------------------------------------------------------------------------
// 3.2 Post-save checklist (no auto-push)
// ---------------------------------------------------------------------------

test('W3-3.2: victory checklist has four Analyze import steps', () => {
  assert.match(html, /id="bridge-victory-checklist"/);
  assert.match(html, /Download for Review/);
  assert.match(html, /href="\/analyzer\/"/);
  assert.match(html, /Import the downloaded file/);
  assert.match(html, /Start review scan/);
});

test('W3-3.2: independence phrases still present (HTML + JS)', () => {
  assert.match(html, /Nothing was sent to Review automatically/);
  assert.match(js, /nothing was sent to Review/i);
  // Save panel still teaches boundary
  assert.match(html, /Nothing is sent to Review/);
});

test('W3-3.2: no banned Analyze push CTAs', () => {
  for (const banned of BANNED_CTAS) {
    assert.equal(html.includes(banned), false, `HTML must not contain "${banned}"`);
    assert.equal(js.includes(banned), false, `JS must not contain "${banned}"`);
  }
});

test('W3-3.2: Open Review is a link only (no data transfer)', () => {
  assert.match(html, /class="bridge-victory-analyze-link"[^>]*href="\/analyzer\/"/);
  assert.equal(js.includes('bridge-analyzer-push'), false);
  assert.equal(
    fs.existsSync(path.join(ROOT, 'lib', 'bridge-analyzer-push.js')),
    false,
    'bridge-analyzer-push.js must remain deleted'
  );
});

// ---------------------------------------------------------------------------
// 3.3 Loading copy honesty
// ---------------------------------------------------------------------------

test('W3-3.3: getLoadingSteps adds Vault skip slogan (not Review push theater)', () => {
  assert.match(js, /function getLoadingSteps\s*\(/);
  assert.match(js, /LOADING_STEP_VAULT_SKIP/);
  assert.match(js, /Skipping addresses already in Vault…/);
  // startLoadingAnimation snapshots getLoadingSteps()
  assert.match(js, /const loadingSteps = getLoadingSteps\s*\(\s*\)/);
});

test('W3-3.3: base loading steps do not hardcode Review cross-check', () => {
  const start = js.indexOf('const LOADING_STEPS_BASE');
  assert.ok(start >= 0, 'LOADING_STEPS_BASE required');
  const end = js.indexOf('];', start);
  const base = js.slice(start, end + 2);
  assert.equal(
    base.includes('Cross-checking Review'),
    false,
    'LOADING_STEPS_BASE must not include Cross-checking Review'
  );
  assert.equal(
    base.includes('Skipping addresses already in Vault'),
    false,
    'Vault skip is injected by getLoadingSteps, not BASE'
  );
});

test('W3-3.3: workflow strip teaches Download for Review manual import', () => {
  assert.match(
    html,
    /Process → \(Train\) → Save list → Download/
  );
  assert.match(html, /Download for Review/);
  assert.match(html, /manual Review import/i);
});

test('W3 cache bust: bridge.js and bridge.css bumped', () => {
  assert.match(html, /bridge\.js\?v=\d+/);
  assert.match(html, /bridge\.css\?v=\d+/);
  // Expect at least the Wave 3 bumps
  const jsV = html.match(/bridge\.js\?v=(\d+)/);
  const cssV = html.match(/bridge\.css\?v=(\d+)/);
  assert.ok(jsV && Number(jsV[1]) >= 93, 'bridge.js cache bust >= 93');
  assert.ok(cssV && Number(cssV[1]) >= 87, 'bridge.css cache bust >= 87');
});
