/**
 * Wave 2 Task 2.6 — Zero-kept recovery CTAs on Filter desk.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'bridge.css'), 'utf8');

test('recovery shell exists on results and error strip', () => {
  assert.match(html, /id=["']bridge-zero-kept-recovery["']/);
  assert.match(html, /id=["']bridge-zero-kept-recovery-error["']/);
  assert.match(html, /Wrong Type column\?/);
  assert.match(html, /Try Excel from portal/);
  assert.match(html, /Clear Type memory \(admin\)/);
});

test('recovery actions use data-recovery hooks', () => {
  assert.match(html, /data-recovery=["']type-column["']/);
  assert.match(html, /data-recovery=["']excel["']/);
  assert.match(html, /data-recovery=["']clear-type["']/);
});

test('bridge.js shows recovery on zero kept and NO_USABLE_ROWS', () => {
  assert.match(js, /function setZeroKeptRecovery\s*\(/);
  assert.match(js, /function onZeroKeptRecovery\s*\(/);
  assert.match(js, /setZeroKeptRecovery\(keptNRec === 0/);
  assert.match(js, /zeroErr\.code\s*=\s*['"]NO_USABLE_ROWS['"]/);
  assert.match(js, /showError\(msg,\s*\{\s*zeroKept/);
  assert.match(js, /clearCityFormatMemory/);
});

test('bridge.css styles zero-kept recovery', () => {
  assert.match(css, /\.bridge-zero-kept-recovery\b/);
  assert.match(css, /\.bridge-zero-kept-recovery-actions\b/);
});

test('bridge.html cache-busts bridge.js after recovery edit', () => {
  assert.match(html, /\/js\/bridge\.js\?v=\d+/);
  const m = html.match(/\/js\/bridge\.js\?v=(\d+)/);
  assert.ok(m && Number(m[1]) >= 92, 'cache version should be bumped for recovery UI');
});
