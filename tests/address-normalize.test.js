'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAddressRow,
  parseEmbeddedAddress,
  normalizeState,
  standardizeStreet,
  isCompleteAddress
} = require('../lib/address-normalize');
const {
  parseCensusResultLine,
  mapMatchedAddress,
  buildBatchCsv
} = require('../lib/address-zip-lookup');

test('extracts city/state/zip jammed into Street Address', () => {
  const row = normalizeAddressRow({
    'Street Address': '3555 MAIN ST, HILLIARD, OH 43026',
    City: 'Hilliard',
    State: 'Ohio',
    'Postal Code': ''
  });
  assert.equal(row.streetAddress, '3555 Main St');
  assert.equal(row.city, 'Hilliard');
  assert.equal(row.state, 'OH');
  assert.equal(row.zip, '43026');
  assert.equal(row.junk, false);
});

test('parses jammed city without comma before city name', () => {
  const row = normalizeAddressRow({
    'Street Address': '854 Courting Ln Nw Lilburn, Georgia, 30047',
    City: 'Lilburn',
    State: 'Georgia',
    'Postal Code': ''
  });
  assert.equal(row.streetAddress, '854 Courting Ln NW');
  assert.equal(row.city, 'Lilburn');
  assert.equal(row.state, 'GA');
  assert.equal(row.zip, '30047');
});

test('recovers zip/city from corrupted State column', () => {
  const st = normalizeState('LONGVIEW, TEXAS 75602');
  assert.equal(st.state, 'TX');
  assert.equal(st.zipFromState, '75602');
  assert.equal(st.cityFromState, 'Longview');
});

test('drops page markers and parcel ids as junk', () => {
  assert.equal(normalizeAddressRow({ 'Street Address': '2 of 2', City: 'Schertz', State: 'TX' }).junk, true);
  assert.equal(normalizeAddressRow({ 'Street Address': 'P23-124', City: 'Ada', State: 'Ohio' }).junk, true);
});

test('standardizes street suffixes and directions', () => {
  assert.equal(standardizeStreet('123 NORTH MAIN STREET'), '123 N Main St');
  assert.equal(standardizeStreet('456 Oak Avenue'), '456 Oak Ave');
});

test('clean street + city + state stays complete once zip present', () => {
  const row = parseEmbeddedAddress('7358 PRIMROSE DR', {
    city: 'Mentor-on-the-Lake',
    state: 'Ohio',
    zip: '44060'
  });
  assert.equal(row.street, '7358 Primrose Dr');
  assert.equal(row.city, 'Mentor-on-the-Lake');
  assert.equal(row.state, 'OH');
  assert.ok(isCompleteAddress({
    streetAddress: row.street,
    city: row.city,
    state: row.state,
    zip: row.zip
  }));
});

test('census result line parser', () => {
  const line = '"1"," 7358 PRIMROSE DR,  Mentor-on-the-Lake,  OH, ","Match","Exact","7358 PRIMROSE DR, MENTOR ON THE LAKE, OH, 44060","-81.37,41.70","137","R"';
  const cols = parseCensusResultLine(line);
  assert.equal(cols[0], '1');
  assert.equal(cols[2], 'Match');
  const mapped = mapMatchedAddress(cols[4]);
  assert.equal(mapped.zip, '44060');
  assert.equal(mapped.state, 'OH');
  assert.equal(mapped.streetAddress, '7358 Primrose Dr');
});

test('buildBatchCsv includes id and components', () => {
  const csv = buildBatchCsv([{ id: 9, streetAddress: '1 Main St', city: 'Austin', state: 'TX', zip: '' }]);
  assert.match(csv, /^9, 1 Main St, Austin, TX, $/);
});
