'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildImportAddressIndex } = require('../lib/import-address-index');

describe('import-address-index API payload', () => {
  it('includes matchKeys for client dedupe', () => {
    const session = {
      results: [
        { street: '100 Oak Ave', city: 'Waco', state: 'TX', postal: '76701' }
      ],
      records: []
    };
    const index = buildImportAddressIndex(session);
    assert.ok(Array.isArray(index.matchKeys));
    assert.equal(index.matchKeys.length, 1);
    assert.ok(index.matchKeys[0].includes('oak'));
    assert.equal(index.resultsCount, 1);
  });

  it('matchKeys excludes scan queue so re-import is not blocked', () => {
    const session = {
      results: [
        { street: '100 Oak Ave', city: 'Waco', state: 'TX', postal: '76701' }
      ],
      records: [
        { street: '100 Oak Ave', city: 'Waco', state: 'TX', postal: '76701' },
        { street: '200 Pine Rd', city: 'Waco', state: 'TX', postal: '76702' },
        { street: '300 Elm St', city: 'Waco', state: 'TX', postal: '76703' }
      ]
    };
    const index = buildImportAddressIndex(session);
    const { addressMatchKey, dedupeIncomingAgainstKnown } = require('../lib/address-match');

    assert.equal(index.resultsCount, 1);
    assert.equal(index.recordsCount, 3);
    assert.ok(index.addresses.length > index.matchKeys.length);

    const known = {
      exact: new Set(index.matchKeys),
      loose: new Set(index.matchKeysLoose)
    };
    const incoming = [
      { street: '200 Pine Rd', city: 'Waco', state: 'TX', postal: '76702' },
      { street: '300 Elm St', city: 'Waco', state: 'TX', postal: '76703' }
    ];
    const { kept, skippedTotal } = dedupeIncomingAgainstKnown(incoming, known);
    assert.equal(kept.length, 2, 'unscanned queue rows must not block re-import');
    assert.equal(skippedTotal, 0);

    const dup = { street: '100 Oak Ave', city: 'Waco', state: 'TX', postal: '76701' };
    assert.ok(known.exact.has(addressMatchKey(dup)), 'scanned result still blocks');
    const blocked = dedupeIncomingAgainstKnown([dup], known);
    assert.equal(blocked.kept.length, 0);
  });

  it('addresses bag does not contain pipe match-keys from the scan queue', () => {
    const session = {
      results: [
        { street: '100 Oak Ave', city: 'Waco', state: 'TX', postal: '76701' }
      ],
      records: [
        { street: '200 Pine Rd', city: 'Waco', state: 'TX', postal: '76702' }
      ]
    };
    const index = buildImportAddressIndex(session);
    const { addressMatchKey } = require('../lib/address-match');
    const queueKey = addressMatchKey(session.records[0]);
    const resultKey = addressMatchKey(session.results[0]);

    assert.ok(queueKey);
    assert.ok(!index.addresses.includes(queueKey), 'queue pipe-key must not be in addresses');
    assert.ok(!index.addresses.includes(resultKey), 'result pipe-key must not be in addresses');
    assert.ok(index.matchKeys.includes(resultKey));
    assert.ok(!index.matchKeys.includes(queueKey));

    // Legacy clients that merge index.addresses into exact must not block queue rows
    // via addressMatchKey lookups.
    const legacyExact = new Set([...(index.matchKeys || []), ...(index.addresses || [])]);
    assert.equal(legacyExact.has(queueKey), false);
    assert.equal(legacyExact.has(resultKey), true);
  });
});