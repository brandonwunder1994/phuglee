'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  addressMatchKey,
  buildKnownAddressKeySet,
  dedupeIncomingAgainstKnown
} = require('../lib/address-match');

describe('address-match dedupe', () => {
  it('normalizes street abbreviations and state names', () => {
    const a = addressMatchKey({
      street: '123 Main Street',
      city: 'Fort Worth',
      state: 'Texas',
      postal: '76110'
    });
    const b = addressMatchKey({
      address: '123 Main St, Fort Worth, TX 76110',
      street: '123 Main St',
      city: 'Fort Worth',
      state: 'TX',
      postal: '76110'
    });
    assert.equal(a, b);
    assert.match(a, /main st\|fort worth\|tx\|76110/);
  });

  it('drops already-scanned properties from incoming queue', () => {
    const known = buildKnownAddressKeySet([
      { street: '100 Oak Ave', city: 'Waco', state: 'TX', postal: '76701' },
      { street: '200 Elm Street', city: 'Waco', state: 'TX', postal: '76701' }
    ]);
    const { kept, skippedExact, skippedInFile } = dedupeIncomingAgainstKnown([
      { street: '100 Oak Avenue', city: 'Waco', state: 'Texas', postal: '76701' }, // dup
      { street: '300 Pine Rd', city: 'Waco', state: 'TX', postal: '76701' }, // new
      { street: '300 Pine Road', city: 'Waco', state: 'TX', postal: '76701' } // in-file dup
    ], known);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].street, '300 Pine Rd');
    assert.equal(skippedExact, 1);
    assert.equal(skippedInFile, 1);
  });

  it('never removes unique new addresses', () => {
    const known = buildKnownAddressKeySet([
      { street: '1 A St', city: 'X', state: 'TX', postal: '11111' }
    ]);
    const { kept, skippedTotal } = dedupeIncomingAgainstKnown([
      { street: '2 B St', city: 'X', state: 'TX', postal: '11111' },
      { street: '3 C St', city: 'X', state: 'TX', postal: '11111' }
    ], known);
    assert.equal(kept.length, 2);
    assert.equal(skippedTotal, 0);
  });
});
