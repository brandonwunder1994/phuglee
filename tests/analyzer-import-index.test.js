const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildIndexFromSession,
  recordAddressKey,
  rowAddressKey,
  normalizeAddressKey
} = require('../lib/analyzer-import-index');

test('recordAddressKey prefers full address field', () => {
  const key = recordAddressKey({
    address: '123 Main St, Marana, AZ 85704',
    street: 'ignored'
  });
  assert.equal(key, normalizeAddressKey('123 Main St, Marana, AZ 85704'));
});

test('recordAddressKey composes street city state postal', () => {
  const key = recordAddressKey({
    street: '456 Oak Ave',
    city: 'Marana',
    state: 'Arizona',
    postal: '85705'
  });
  assert.equal(key, normalizeAddressKey('456 Oak Ave, Marana, Arizona, 85705'));
});

test('buildIndexFromSession deduplicates records and results', () => {
  const session = {
    records: [
      { address: '123 Main St, Marana, Arizona' },
      { street: '456 Oak Ave', city: 'Marana', state: 'Arizona' }
    ],
    results: [
      { address: '123 Main St, Marana, Arizona' },
      { address: '789 Pine Dr, Marana, Arizona' }
    ]
  };
  const index = buildIndexFromSession(session);
  assert.ok(index.count >= 3);
  assert.equal(index.sources.records, 2);
  assert.equal(index.sources.results, 1);
  assert.equal(index.addresses.has(normalizeAddressKey('123 Main St')), true);
  assert.equal(index.addresses.has(normalizeAddressKey('789 Pine Dr')), true);
});

test('buildIndexFromSession indexes street-only analyzer addresses', () => {
  const index = buildIndexFromSession({
    records: [{ address: '123 Main St', city: 'Marana', state: 'Arizona', postal: '85704' }],
    results: []
  });
  assert.equal(index.addresses.has(normalizeAddressKey('123 Main St')), true);
  assert.equal(
    index.addresses.has(rowAddressKey({
      streetAddress: '123 Main St',
      city: 'Marana',
      state: 'Arizona',
      zip: '85704'
    })),
    true
  );
});