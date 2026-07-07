const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  groupStates,
  citiesForState,
  buildStubProcessResponse,
  parseResponseReceivedAt,
  forgeDownloadUrl
} = require('../lib/bridge-api');

test('groupStates aggregates city counts by state', () => {
  const states = groupStates([
    { id: 'a', city: 'Marana', state: 'Arizona' },
    { id: 'b', city: 'Tucson', state: 'Arizona' },
    { id: 'c', city: 'Reno', state: 'Nevada' }
  ]);
  assert.equal(states.length, 2);
  const az = states.find((row) => row.code === 'Arizona');
  assert.equal(az.cityCount, 2);
});

test('citiesForState returns sorted city rows', () => {
  const rows = citiesForState([
    { id: 'b', city: 'Tucson', state: 'Arizona' },
    { id: 'a', city: 'Marana', state: 'Arizona' }
  ], 'Arizona');
  assert.deepEqual(rows.map((r) => r.city), ['Marana', 'Tucson']);
});

test('buildStubProcessResponse tags code violation samples', () => {
  const payload = buildStubProcessResponse({
    city: { id: 'arizona-marana', city: 'Marana', state: 'Arizona' },
    uploadType: 'code_violation',
    sourceFile: 'violations.xlsx'
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.stub, true);
  assert.ok(payload.rows.length >= 3);
  assert.ok(payload.stats.kept >= 3);
  assert.ok(payload.rows.some((row) => /strong/i.test(row.distressedSignalTag)));
});

test('forgeDownloadUrl prefixes forge file paths', () => {
  const url = forgeDownloadUrl('data/bridge-datasets/Arizona/test.csv');
  assert.match(url, /^\/forge\/api\/file\//);
  assert.match(url, /test\.csv$/);
});

test('parseResponseReceivedAt is re-exported from bridge export helper', () => {
  const iso = parseResponseReceivedAt('2026-07-04T14:30');
  assert.match(iso, /^2026-07-04T/);
});

test('buildStubProcessResponse applies water shut off default tag', () => {
  const payload = buildStubProcessResponse({
    city: { id: 'arizona-marana', city: 'Marana', state: 'Arizona' },
    uploadType: 'water_shut_off',
    sourceFile: 'shutoffs.csv'
  });
  assert.ok(payload.rows.every((row) => row.distressedSignalTag.includes('Water Shut Off')));
});