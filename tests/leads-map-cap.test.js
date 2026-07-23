const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  MAP_MAX_MARKERS,
  MAP_MAX_MARKERS_LAND
} = require('../lib/leads-platform/store');

test('map marker caps are bounded for scale', () => {
  assert.equal(MAP_MAX_MARKERS, 5000);
  assert.equal(MAP_MAX_MARKERS_LAND, 2500);
  assert.ok(MAP_MAX_MARKERS < 15000);
});
