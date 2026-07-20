/**
 * Wave 1 Task 1.2 — Operator-visible OCR truncation warning (UI contract).
 * Pure builder extracted from public/js/bridge.js + static greps — no browser.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const BRIDGE_JS = path.join(ROOT, 'public', 'js', 'bridge.js');
const BRIDGE_HTML = path.join(ROOT, 'public', 'bridge.html');
const BRIDGE_CSS = path.join(ROOT, 'public', 'css', 'bridge.css');

function extractBuildOcrTruncationWarning() {
  const src = fs.readFileSync(BRIDGE_JS, 'utf8');
  const start = src.indexOf('function buildOcrTruncationWarning');
  assert.ok(start >= 0, 'bridge.js must define function buildOcrTruncationWarning');
  let i = src.indexOf('{', start);
  assert.ok(i >= 0, 'function body open brace');
  let depth = 0;
  let end = i;
  for (; end < src.length; end++) {
    const ch = src[end];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
  }
  const fnSrc = src.slice(start, end);
  const sandbox = {
    Number,
    String,
    Boolean,
    Object,
    Math,
    Array,
    isFinite,
    parseInt,
    parseFloat
  };
  vm.runInNewContext(fnSrc + '\nthis.fn = buildOcrTruncationWarning;', sandbox);
  assert.equal(typeof sandbox.fn, 'function');
  return sandbox.fn;
}

// ── Pure builder unit tests (TDD) ──────────────────────────────────────────

test('OCR-UI-01: buildOcrTruncationWarning returns empty when not truncated', () => {
  const build = extractBuildOcrTruncationWarning();
  assert.equal(build(null), '');
  assert.equal(build(undefined), '');
  assert.equal(build({}), '');
  assert.equal(build({ ocrTruncated: false, ocrPagesProcessed: 12, ocrPagesTotal: 40 }), '');
});

test('OCR-UI-02: known total → page N of M (OCR limit) + re-export guidance', () => {
  const build = extractBuildOcrTruncationWarning();
  const msg = build({
    ocrTruncated: true,
    ocrPagesProcessed: 12,
    ocrPagesTotal: 40,
    ocrPageCap: 12
  });
  assert.match(msg, /page 12 of 40/i);
  assert.match(msg, /OCR limit/i);
  assert.match(msg, /Re-export as Excel/i);
  assert.match(msg, /split the PDF/i);
});

test('OCR-UI-03: unknown total → first N pages (OCR limit of C)', () => {
  const build = extractBuildOcrTruncationWarning();
  const msg = build({
    ocrTruncated: true,
    ocrPagesProcessed: 12,
    ocrPagesTotal: null,
    ocrPageCap: 12
  });
  assert.match(msg, /first 12 pages/i);
  assert.match(msg, /OCR limit of 12/i);
  assert.match(msg, /Re-export as Excel/i);
});

test('OCR-UI-04: truncated with only cap → partial read message', () => {
  const build = extractBuildOcrTruncationWarning();
  const msg = build({
    ocrTruncated: true,
    ocrPagesProcessed: null,
    ocrPagesTotal: null,
    ocrPageCap: 12
  });
  assert.match(msg, /partially read|OCR/i);
  assert.match(msg, /12/);
  assert.match(msg, /Re-export as Excel/i);
});

// ── Static DOM / render contracts ──────────────────────────────────────────

test('OCR-UI-05: banner host id bridge-ocr-truncation-banner in HTML', () => {
  const html = fs.readFileSync(BRIDGE_HTML, 'utf8');
  assert.match(html, /id="bridge-ocr-truncation-banner"/);
});

test('OCR-UI-06: renderResults / process path wires ocrTruncated banner', () => {
  const js = fs.readFileSync(BRIDGE_JS, 'utf8');
  assert.match(js, /buildOcrTruncationWarning/);
  assert.match(js, /bridge-ocr-truncation-banner/);
  assert.match(js, /ocrTruncated/);
  assert.match(js, /function\s+renderResults\s*\(/);
  // Exact signature — avoid matching renderResultsTable
  const renderIdx = js.indexOf('function renderResults(');
  assert.ok(renderIdx >= 0, 'function renderResults( must exist');
  // Slice a generous body window (function continues until next top-level helper)
  const renderBody = js.slice(renderIdx, renderIdx + 12000);
  assert.match(renderBody, /buildOcrTruncationWarning|setOcrTruncationBanner/,
    'renderResults must call OCR truncation warning path');
  assert.match(renderBody, /bridge-ocr-truncation-banner|setOcrTruncationBanner/,
    'renderResults must update banner host');
  assert.match(renderBody, /processingMeta/,
    'renderResults must read processingMeta for OCR honesty');
});

test('OCR-UI-07: NO_USABLE_ROWS path can append truncation warning when meta present', () => {
  const js = fs.readFileSync(BRIDGE_JS, 'utf8');
  const idx = js.indexOf("data.code === 'NO_USABLE_ROWS'");
  assert.ok(idx >= 0, 'NO_USABLE_ROWS branch must exist');
  const slice = js.slice(idx, idx + 1200);
  assert.match(slice, /buildOcrTruncationWarning|processingMeta/,
    'zero-kept errors must consider OCR meta');
});

test('OCR-UI-08: minimal banner styles present', () => {
  const css = fs.readFileSync(BRIDGE_CSS, 'utf8');
  assert.match(css, /\.bridge-ocr-truncation-banner/);
});

test('OCR-UI-09: bridge.js cache bust version present in bridge.html', () => {
  const html = fs.readFileSync(BRIDGE_HTML, 'utf8');
  assert.match(html, /bridge\.js\?v=\d+/);
});
