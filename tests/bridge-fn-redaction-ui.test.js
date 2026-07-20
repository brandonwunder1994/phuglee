/**
 * Wave 1 Task 1.5 — FN truncation + redaction counts (UI contract).
 * Pure builders extracted from public/js/bridge.js + static greps — no browser.
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

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name);
  assert.ok(start >= 0, 'bridge.js must define function ' + name);
  let i = src.indexOf('{', start);
  assert.ok(i >= 0, 'function body open brace for ' + name);
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
  return src.slice(start, end);
}

function loadBuilders() {
  const src = fs.readFileSync(BRIDGE_JS, 'utf8');
  const fnSrc =
    extractFunction(src, 'buildFnTruncationWarning') +
    '\n' +
    extractFunction(src, 'buildRedactionSkippedNote');
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
  vm.runInNewContext(
    fnSrc +
      '\nthis.buildFn = buildFnTruncationWarning;' +
      '\nthis.buildRedact = buildRedactionSkippedNote;',
    sandbox
  );
  assert.equal(typeof sandbox.buildFn, 'function');
  assert.equal(typeof sandbox.buildRedact, 'function');
  return sandbox;
}

// ── Pure builder unit tests ────────────────────────────────────────────────

test('FN-UI-01: buildFnTruncationWarning empty when not truncated', () => {
  const { buildFn } = loadBuilders();
  assert.equal(buildFn(null), '');
  assert.equal(buildFn(undefined), '');
  assert.equal(buildFn({}), '');
  assert.equal(buildFn({ notDistressedTruncated: false, notDistressedTotal: 12 }), '');
});

test('FN-UI-02: truncated with total + returned → first N of M + 5000 cap', () => {
  const { buildFn } = loadBuilders();
  const msg = buildFn({
    notDistressedTruncated: true,
    notDistressedTotal: 12000,
    notDistressedReturned: 5000
  });
  assert.match(msg, /first 5[,.]?000/i);
  assert.match(msg, /12[,.]?000/);
  assert.match(msg, /not-distressed/i);
  assert.match(msg, /cap/i);
  assert.match(msg, /not listed/i);
});

test('FN-UI-03: truncated with total only → first 5000 of M', () => {
  const { buildFn } = loadBuilders();
  const msg = buildFn({
    notDistressedTruncated: true,
    notDistressedTotal: 8001
  });
  assert.match(msg, /5[,.]?000/);
  assert.match(msg, /8[,.]?001/);
  assert.match(msg, /not-distressed/i);
});

test('FN-UI-04: truncated with no totals → generic 5000 cap message', () => {
  const { buildFn } = loadBuilders();
  const msg = buildFn({ notDistressedTruncated: true });
  assert.match(msg, /5[,.]?000/);
  assert.match(msg, /not-distressed/i);
  assert.match(msg, /cap/i);
});

test('RED-UI-01: buildRedactionSkippedNote empty when missing or zero', () => {
  const { buildRedact } = loadBuilders();
  assert.equal(buildRedact(null), '');
  assert.equal(buildRedact({}), '');
  assert.equal(buildRedact({ redactedSkipped: 0 }), '');
  assert.equal(buildRedact({ redactedSkipped: null }), '');
  assert.equal(buildRedact({ redactedSkipped: -1 }), '');
});

test('RED-UI-02: singular redacted row', () => {
  const { buildRedact } = loadBuilders();
  const msg = buildRedact({ redactedSkipped: 1 });
  assert.match(msg, /^1 fully redacted row was skipped/i);
  assert.match(msg, /location/i);
});

test('RED-UI-03: plural redacted rows with locale formatting', () => {
  const { buildRedact } = loadBuilders();
  const msg = buildRedact({ redactedSkipped: 42 });
  assert.match(msg, /42/);
  assert.match(msg, /fully redacted rows were skipped/i);
});

// ── Static DOM / render contracts ──────────────────────────────────────────

test('FN-UI-05: host ids present in bridge.html', () => {
  const html = fs.readFileSync(BRIDGE_HTML, 'utf8');
  assert.match(html, /id="bridge-fn-truncation-note"/);
  assert.match(html, /id="bridge-redaction-banner"/);
});

test('FN-UI-06: renderResults wires FN + redaction banners', () => {
  const js = fs.readFileSync(BRIDGE_JS, 'utf8');
  assert.match(js, /buildFnTruncationWarning/);
  assert.match(js, /buildRedactionSkippedNote/);
  assert.match(js, /bridge-fn-truncation-note/);
  assert.match(js, /bridge-redaction-banner/);
  const renderIdx = js.indexOf('function renderResults(');
  assert.ok(renderIdx >= 0, 'function renderResults( must exist');
  const renderBody = js.slice(renderIdx, renderIdx + 14000);
  assert.match(renderBody, /setRedactionBanner/, 'renderResults must call setRedactionBanner');
  assert.match(renderBody, /setFnTruncationNote/, 'renderResults must call setFnTruncationNote');
  assert.match(renderBody, /brainMeta/, 'renderResults must read brainMeta');
  assert.match(renderBody, /redactedSkipped|setRedactionBanner/, 'renderResults redaction path');
  assert.match(renderBody, /FN review capped/, 'results meta tip for FN cap');
});

test('FN-UI-07: Train render path surfaces FN truncation', () => {
  const js = fs.readFileSync(BRIDGE_JS, 'utf8');
  const idx = js.indexOf('function renderTrainGroups');
  assert.ok(idx >= 0);
  const body = js.slice(idx, idx + 6000);
  assert.match(body, /buildFnTruncationWarning|setFnTruncationNote/,
    'renderTrainGroups must surface FN truncation');
  assert.match(body, /brainMeta/, 'train path must read brainMeta');
});

test('FN-UI-08: minimal banner styles present', () => {
  const css = fs.readFileSync(BRIDGE_CSS, 'utf8');
  assert.match(css, /\.bridge-review-limit-banner/);
  assert.match(css, /\.bridge-fn-truncation-note/);
});

test('FN-UI-09: bridge.js cache bust version present in bridge.html', () => {
  const html = fs.readFileSync(BRIDGE_HTML, 'utf8');
  assert.match(html, /bridge\.js\?v=\d+/);
  assert.match(html, /bridge\.css\?v=\d+/);
});

test('FN-UI-10: reset clears FN + redaction banners', () => {
  const js = fs.readFileSync(BRIDGE_JS, 'utf8');
  assert.match(js, /setRedactionBanner\(null\)/);
  assert.match(js, /setFnTruncationNote\(null\)/);
});
