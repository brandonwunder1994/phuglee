const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveImportLocation,
  countUnscannedLeads,
  formatImportLocation
} = require('../lib/import-meta');

const keyFn = (r) => `${r.street}|${r.city}|${r.state}`;

describe('import-meta', () => {
  it('deriveImportLocation picks the dominant city/state pair', () => {
    const loc = deriveImportLocation([
      { city: 'Waxahachie', state: 'TX' },
      { city: 'Waxahachie', state: 'TX' },
      { city: 'Dallas', state: 'TX' }
    ]);
    assert.equal(loc.city, 'Waxahachie');
    assert.equal(loc.state, 'TX');
    assert.equal(loc.count, 2);
  });

  it('countUnscannedLeads excludes records that already have results', () => {
    const records = [
      { street: '1 A', city: 'Waxahachie', state: 'TX' },
      { street: '2 B', city: 'Waxahachie', state: 'TX' }
    ];
    const results = [{ street: '1 A', city: 'Waxahachie', state: 'TX' }];
    assert.equal(countUnscannedLeads(records, results, keyFn), 1);
  });

  it('formatImportLocation renders city and state', () => {
    assert.equal(formatImportLocation({ city: 'Marana', state: 'Arizona' }), 'Marana, Arizona');
  });
});