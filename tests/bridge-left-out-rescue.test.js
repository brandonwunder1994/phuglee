/**
 * Left-out rescue panel — keep FN types from the kill report without
 * reviewing every address.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'bridge.css'), 'utf8');

test('LEFT-OUT-01: rescue panel host in HTML', () => {
  assert.match(html, /id="bridge-left-out-panel"/);
  assert.match(html, /id="bridge-left-out-list"/);
  assert.match(html, /id="bridge-left-out-keep-all"/);
  assert.match(
    html,
    /Accept categories that were not auto-kept|Accept as distress|Accept all left out/
  );
  // Panel appears before KPI grid so operators see Accept first
  const panelIdx = html.indexOf('id="bridge-left-out-panel"');
  const kpiIdx = html.indexOf('id="bridge-kpi-grid"');
  assert.ok(panelIdx >= 0 && kpiIdx > panelIdx, 'left-out panel must sit above KPI grid');
});

test('LEFT-OUT-02: render + keep helpers in bridge.js', () => {
  assert.match(js, /function renderLeftOutRescue\b/);
  assert.match(js, /function keepLeftOutGroupById\b/);
  assert.match(js, /function keepAllLeftOut\b/);
  assert.match(js, /function getLeftOutGroups\b/);
  assert.match(js, /function focusLeftOutPanel\b/);
  assert.match(js, /renderLeftOutRescue\(data\)/);
  assert.match(js, /data-left-out-keep/);
  assert.match(js, /Accept as distress/);
  // Prefer kept mode when left-outs exist so Accept panel is front-and-center
  assert.match(js, /leftN > 0 \? 'kept'/);
});

test('LEFT-OUT-03: promote path uses not_distressed keep (train deny)', () => {
  // Accept as distress = promote FN → kept (same as train action deny on not_distressed)
  assert.match(js, /action:\s*'deny'/);
  assert.match(js, /section:\s*'not_distressed'|sectionForPost.*not_distressed|'not_distressed'/);
  assert.match(js, /applyTrainDecisionLocally\('deny',\s*'not_distressed'/);
});

test('LEFT-OUT-04: panel styles present', () => {
  assert.match(css, /\.bridge-left-out-panel\b/);
  assert.match(css, /\.bridge-left-out-row\b/);
  assert.match(css, /\.bridge-left-out-panel\[hidden\]/);
  assert.match(css, /bridge-left-out-pulse|is-attention/);
});

test('LEFT-OUT-05: bridge.js cache bust after left-out feature', () => {
  assert.match(html, /bridge\.js\?v=\d+/);
  assert.match(html, /bridge\.css\?v=\d+/);
});

test('LEFT-OUT-06: not gated only to code_violation (show any FN left-outs)', () => {
  // Must not early-return solely on uploadType !== code_violation
  assert.equal(
    /if \(uploadType && uploadType !== 'code_violation'\) \{\s*setHidden\(panel, true\)/.test(js),
    false,
    'left-out panel must not hide for non-code_violation types'
  );
});
