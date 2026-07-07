const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getColumnCount,
  getRowCount,
  getSpacerHeight,
  getVisibleSlice
} = require('../lib/virtual-scroll');

describe('virtual-scroll', () => {
  it('computes columns from container width', () => {
    assert.equal(getColumnCount(1200), 4);
    assert.equal(getColumnCount(600), 2);
    assert.equal(getColumnCount(200), 1);
  });

  it('computes row count for multi-column grid', () => {
    assert.equal(getRowCount(100, 4), 25);
    assert.equal(getRowCount(101, 4), 26);
  });

  it('spacer height uses rows not item count', () => {
    const hItems = 100 * 340;
    const hRows = getSpacerHeight(100, 1200, { rowHeight: 340 });
    assert.ok(hRows < hItems);
    assert.equal(hRows, 25 * 340);
  });

  it('maps scroll position to item slice across columns', () => {
    const first = getVisibleSlice(500, 0, 680, 1200, { rowHeight: 340, overscanRows: 2 });
    assert.equal(first.startIndex, 0);
    assert.ok(first.endIndex > first.startIndex);

    const scrolled = getVisibleSlice(500, 3400, 680, 1200, { rowHeight: 340, overscanRows: 2 });
    assert.ok(scrolled.startIndex > 0);
    assert.ok(scrolled.endIndex <= 500);
    assert.ok(scrolled.startIndex < scrolled.endIndex);
  });

  it('reaches tail items at deep scroll', () => {
    const cols = getColumnCount(1200);
    const rows = getRowCount(500, cols);
    const deepScroll = (rows - 1) * 340;
    const tail = getVisibleSlice(500, deepScroll, 680, 1200, { rowHeight: 340, overscanRows: 2 });
    assert.ok(tail.endIndex >= 480);
  });
});