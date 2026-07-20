/**
 * Wave 2 Task 2.4 — Outcome request type uses water_shut_off (Filter surface).
 * Form Forge still stores water_shutoff; API maps at the boundary.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const api = fs.readFileSync(path.join(ROOT, 'lib', 'bridge-api.js'), 'utf8');

test('outcome select option value is water_shut_off', () => {
  const i = html.indexOf('id="bridge-outcome-type"');
  assert.ok(i >= 0);
  const slice = html.slice(i, i + 500);
  assert.match(slice, /value=["']water_shut_off["']/);
  assert.equal(
    /value=["']water_shutoff["']/.test(slice),
    false,
    'legacy water_shutoff must not remain on outcome select'
  );
});

test('upload type radio still uses water_shut_off', () => {
  assert.match(html, /name=["']bridge-upload-type["']\s+value=["']water_shut_off["']/);
});

test('bridge-api maps Filter water_shut_off to forge water_shutoff', () => {
  assert.match(api, /function toForgeOutcomeRequestType/);
  assert.match(api, /function toFilterOutcomeRequestType/);
  assert.match(api, /water_shut_off['"]\s*\)\s*return\s*['"]water_shutoff['"]/);
  assert.match(api, /CITY_OUTCOME_REQUEST_TYPES[\s\S]{0,120}water_shut_off/);
});
