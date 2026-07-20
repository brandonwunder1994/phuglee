/**
 * Vault hard-skip is always on; Analyze checkbox + paste path removed from Filter UI.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const engine = fs.readFileSync(path.join(ROOT, 'lib', 'bridge-engine', 'index.js'), 'utf8');

test('VAULT-SKIP-01: no Analyze skip checkbox in HTML', () => {
  assert.doesNotMatch(html, /bridge-skip-already-imported/);
  assert.doesNotMatch(html, /Skip addresses already in Analyze/i);
  assert.match(html, /already in The Vault/i);
});

test('VAULT-SKIP-02: paste panel removed from Filter HTML', () => {
  assert.doesNotMatch(html, /id="bridge-paste-panel"/);
  assert.doesNotMatch(html, /Paste text to Excel/i);
  assert.doesNotMatch(html, /id="bridge-paste-text"/);
});

test('VAULT-SKIP-03: engine always loads vault index', () => {
  assert.match(engine, /loadVaultAddressIndex/);
  assert.doesNotMatch(engine, /applyAlreadyImportedFilter\s*===\s*true/);
});

test('VAULT-SKIP-04: client does not send applyAlreadyImportedFilter', () => {
  assert.doesNotMatch(js, /applyAlreadyImportedFilter/);
  assert.match(js, /Skipping addresses already in Vault/);
});
