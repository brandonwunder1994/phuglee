/**
 * Wave 2 Task 2.2 — Paste + file primary CTAs both say "Scrub it".
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');

test('paste convert CTA label is Scrub it (not SCRUB IT)', () => {
  const m = html.match(/id=["']bridge-paste-convert["'][^>]*>([^<]+)</);
  assert.ok(m, 'bridge-paste-convert button must exist');
  assert.equal(m[1].trim(), 'Scrub it');
  assert.equal(/SCRUB IT/.test(html), false, 'must not use all-caps SCRUB IT');
});

test('file process CTA label is Scrub it', () => {
  const m = html.match(/id=["']bridge-process["'][^>]*>([^<]+)</);
  assert.ok(m, 'bridge-process button must exist');
  assert.equal(m[1].trim(), 'Scrub it');
});

test('processBtn JS reset text uses Scrub it', () => {
  assert.match(js, /processBtn\.textContent\s*=\s*['"]Scrub it['"]/);
  assert.equal(/SCRUB IT/.test(js), false);
});
