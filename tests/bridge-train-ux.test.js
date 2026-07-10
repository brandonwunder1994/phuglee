/**
 * Filter Train brain UX — shell structure (TRAIN-01/03/04).
 * Static HTML/CSS contract for admin train wrap; no browser automation.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BRIDGE_HTML = path.join(ROOT, 'public', 'bridge.html');
const BRIDGE_CSS = path.join(ROOT, 'public', 'css', 'bridge.css');

function readHtml() {
  return fs.readFileSync(BRIDGE_HTML, 'utf8');
}

function readCss() {
  return fs.readFileSync(BRIDGE_CSS, 'utf8');
}

/** Extract the opening tag that declares an id (best-effort for static HTML). */
function openingTagForId(html, id) {
  const re = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
  const m = html.match(re);
  return m ? m[0] : null;
}

test('bridge train wrap exists and is hidden by default', () => {
  const html = readHtml();
  assert.ok(html.includes('id="bridge-train-wrap"'), 'must declare id="bridge-train-wrap"');
  const open = openingTagForId(html, 'bridge-train-wrap');
  assert.ok(open, 'must find opening tag for bridge-train-wrap');
  assert.ok(/\bhidden\b/.test(open), 'bridge-train-wrap must include hidden attribute (TRAIN-03 fail-closed)');
});

test('bridge train mode tabs present', () => {
  const html = readHtml();
  assert.ok(html.includes('id="bridge-mode-kept"'), 'must have bridge-mode-kept');
  assert.ok(html.includes('id="bridge-mode-train"'), 'must have bridge-mode-train');
  assert.ok(/role=["']tablist["']/.test(html), 'must have role="tablist"');
  assert.ok(html.includes('Train brain'), 'must show Train brain label');
  assert.ok(html.includes('Kept list'), 'must show Kept list label');
  assert.ok(/role=["']tab["']/.test(html), 'mode buttons must use role="tab"');
});

test('bridge train has distressed and not-distressed sections', () => {
  const html = readHtml();
  assert.ok(html.includes('id="train-distressed-h"'), 'must have train-distressed-h heading');
  assert.ok(html.includes('id="bridge-train-distressed"'), 'must have bridge-train-distressed container');
  assert.ok(html.includes('id="train-fn-h"'), 'must have train-fn-h heading');
  assert.ok(html.includes('id="bridge-train-not-distressed"'), 'must have bridge-train-not-distressed container');
  assert.ok(html.includes('Marked distressed'), 'distressed section label');
  assert.ok(html.includes('Not marked distressed'), 'not-distressed section label');
});

test('bridge train status line present', () => {
  const html = readHtml();
  assert.ok(html.includes('id="bridge-train-status"'), 'must have bridge-train-status');
  assert.ok(html.includes('id="bridge-train-panel"'), 'must have bridge-train-panel');
  const statusOpen = openingTagForId(html, 'bridge-train-status');
  assert.ok(statusOpen, 'must find opening tag for bridge-train-status');
  assert.ok(/role=["']status["']/.test(statusOpen), 'bridge-train-status must have role="status"');
  const panelOpen = openingTagForId(html, 'bridge-train-panel');
  assert.ok(panelOpen, 'must find opening tag for bridge-train-panel');
  assert.ok(/\bhidden\b/.test(panelOpen), 'bridge-train-panel must be hidden by default');
});

test('bridge train wrap nests inside results panel before toolbar', () => {
  const html = readHtml();
  const resultsIdx = html.indexOf('id="bridge-results-panel"');
  const trainIdx = html.indexOf('id="bridge-train-wrap"');
  const toolbarIdx = html.indexOf('id="bridge-results-toolbar"');
  assert.ok(resultsIdx !== -1, 'results panel present');
  assert.ok(trainIdx !== -1, 'train wrap present');
  assert.ok(toolbarIdx !== -1, 'results toolbar present');
  assert.ok(trainIdx > resultsIdx, 'train wrap is after results panel open');
  assert.ok(trainIdx < toolbarIdx, 'train wrap is before results toolbar');
});

test('bridge train CSS defines group card vocabulary', () => {
  const css = readCss();
  const required = [
    '.bridge-train-group',
    '.bridge-results-mode',
    '.bridge-mode-tab',
    '.bridge-train-signals',
    '.bridge-train-descriptions',
    '.bridge-train-actions',
    '.bridge-train-deny',
  ];
  for (const sel of required) {
    assert.ok(css.includes(sel), `CSS must define ${sel}`);
  }
  // Approve hook: either dedicated class or actions row is enough per plan
  assert.ok(
    css.includes('.bridge-train-approve') || css.includes('.bridge-train-actions'),
    'CSS must define .bridge-train-approve or .bridge-train-actions'
  );
});

test('bridge train CSS reuses existing design tokens (no new palette)', () => {
  const css = readCss();
  // Train block should exist and reuse bridge/phuglee tokens or rgba glass patterns
  const trainSliceStart = css.indexOf('.bridge-results-mode');
  assert.ok(trainSliceStart !== -1, 'train mode styles present');
  const trainSlice = css.slice(trainSliceStart);
  const usesTokens =
    trainSlice.includes('var(--radius-')
    || trainSlice.includes('var(--phuglee-')
    || trainSlice.includes('rgba(0, 0, 0')
    || trainSlice.includes('rgba(174, 163, 143');
  assert.ok(usesTokens, 'train CSS should reuse --radius-*/--phuglee-* or existing rgba glass patterns');
});

test('bridge.html cache-busts bridge.css', () => {
  const html = readHtml();
  assert.ok(
    /bridge\.css\?v=\d+/.test(html),
    'bridge.html must link bridge.css with ?v= cache bust'
  );
  const m = html.match(/bridge\.css\?v=(\d+)/);
  assert.ok(m, 'extract cache-bust version');
  const ver = Number(m[1]);
  assert.ok(ver >= 6, `bridge.css cache bust should be >= 6 after train shell (got ${ver})`);
});
