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
  assert.match(html, /Left out of kept list/);
});

test('LEFT-OUT-02: render + keep helpers in bridge.js', () => {
  assert.match(js, /function renderLeftOutRescue\b/);
  assert.match(js, /function keepLeftOutGroupById\b/);
  assert.match(js, /function keepAllLeftOut\b/);
  assert.match(js, /function getLeftOutGroups\b/);
  assert.match(js, /renderLeftOutRescue\(data\)/);
  assert.match(js, /data-left-out-keep/);
});

test('LEFT-OUT-03: promote path uses not_distressed keep (train deny)', () => {
  // Keep these = promote FN → kept (same as train action deny on not_distressed)
  assert.match(js, /action:\s*'deny'/);
  assert.match(js, /section:\s*'not_distressed'|sectionForPost.*not_distressed|'not_distressed'/);
  assert.match(js, /applyTrainDecisionLocally\('deny',\s*'not_distressed'/);
});

test('LEFT-OUT-04: panel styles present', () => {
  assert.match(css, /\.bridge-left-out-panel\b/);
  assert.match(css, /\.bridge-left-out-row\b/);
});

test('LEFT-OUT-05: bridge.js cache bust after left-out feature', () => {
  assert.match(html, /bridge\.js\?v=\d+/);
});
