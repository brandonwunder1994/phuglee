/**
 * Wave 2 Task 2.1 — Paste convert must not force Code Violation when a list
 * type is already selected (Water / Pre-lien / etc.).
 *
 * Static contract on public/js/bridge.js (no browser).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');

test('paste convert only defaults upload type when none selected', () => {
  assert.ok(js.includes('async function convertPasteToExcel'), 'convertPasteToExcel must exist');

  // Contract is on the post-stage block inside convertPasteToExcel success path
  const marker = 'Stage converted workbook in the dropzone file area';
  const i = js.indexOf(marker);
  assert.ok(i >= 0, 'paste staging marker must exist');
  // Window from staging through download offer (covers the type-default call)
  const window = js.slice(i, i + 550);

  assert.match(
    window,
    /if\s*\(\s*!selectedUploadType\s*\)\s*\{[\s\S]{0,80}applyDefaultUploadType\s*\(\s*\)/,
    'must guard applyDefaultUploadType with !selectedUploadType after paste stage'
  );

  // Exactly one applyDefaultUploadType in that post-stage window (the guarded one)
  const calls = window.match(/applyDefaultUploadType\s*\(/g) || [];
  assert.equal(calls.length, 1, 'post-stage paste path must call applyDefaultUploadType once (guarded)');

  // Old unconditional force-default comment must be gone
  assert.equal(
    /Ensure Code violation; received date must be operator-picked/.test(window),
    false,
    'must not force Code violation after every paste convert'
  );
});

test('applyDefaultUploadType still exists for init / empty-type paths', () => {
  assert.match(js, /function applyDefaultUploadType\s*\(/);
  assert.match(js, /value=["']code_violation["']/);
  // Init path still applies default when page loads
  assert.match(js, /Code violation pre-selected in HTML[\s\S]{0,80}applyDefaultUploadType\s*\(/);
});

test('bridge.html cache-busts bridge.js', () => {
  assert.match(html, /\/js\/bridge\.js\?v=\d+/);
});
