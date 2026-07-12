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
});