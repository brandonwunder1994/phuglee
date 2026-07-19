'use strict';
/**
 * Distressed review keyboard map:
 * 1 Keep · 2 Well Maintained · 3 Land · 4 Blocked · 5 Satellite · 6 Undo
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

function routeTierDigit(digit) {
  if (digit === '1') return 'keep';
  if (digit === '2') return 'change'; // opposite tier (WM when on Distressed)
  if (digit === '3') return 'land';
  if (digit === '4') return 'blocked';
  if (digit === '5') return 'satellite';
  if (digit === '6') return 'undo';
  return null;
}

function changeTierForFilter(filter) {
  return filter === 'well_maintained' ? 'distressed' : 'well_maintained';
}

test('distressed keyboard map is 1–6 as specified', () => {
  assert.equal(routeTierDigit('1'), 'keep');
  assert.equal(routeTierDigit('2'), 'change');
  assert.equal(routeTierDigit('3'), 'land');
  assert.equal(routeTierDigit('4'), 'blocked');
  assert.equal(routeTierDigit('5'), 'satellite');
  assert.equal(routeTierDigit('6'), 'undo');
  assert.equal(routeTierDigit('7'), null);
});

test('distressed change target is well_maintained', () => {
  assert.equal(changeTierForFilter('distressed'), 'well_maintained');
});

test('HTML action bar order and labels', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'index.html'),
    'utf8'
  );
  const bar = html.match(/id="reviewActionBar"[\s\S]*?<\/footer>/);
  assert.ok(bar, 'reviewActionBar present');
  const chunk = bar[0];
  const order = [
    ['reviewKeepBtn', 'Keep'],
    ['reviewChangeBtn', 'Well Maintained'],
    ['reviewLandBtn', 'Land'],
    ['reviewBlurredBtn', 'Blocked'],
    ['reviewSatelliteOnlyBtn', 'Satellite'],
    ['reviewUndoBtn', 'Undo']
  ];
  let last = -1;
  for (const [id, label] of order) {
    const i = chunk.indexOf(`id="${id}"`);
    assert.ok(i > last, `${id} order`);
    assert.ok(chunk.includes(label), `${id} has label ${label}`);
    last = i;
  }
  // Later must be hidden (not on Distressed default bar)
  assert.match(chunk, /id="reviewDeferBtn"[^>]*\bhidden\b/);
});

test('session.js wires tier digit map', () => {
  const fs = require('fs');
  const path = require('path');
  const js = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'session.js'),
    'utf8'
  );
  assert.ok(js.includes("if (kind === 'tier')"), 'tier branch');
  assert.ok(js.includes("if (digit === '3') { reviewLandKeep()"), '3 land');
  assert.ok(js.includes("if (digit === '4') { reviewApplyBlurred()"), '4 blocked');
  assert.ok(js.includes("if (digit === '5') { reviewApplySatelliteOnly()"), '5 satellite');
  assert.ok(js.includes("if (digit === '6') { reviewUndo()"), '6 undo');
});
