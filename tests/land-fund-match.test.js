const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { matchLandFunds } = require('../lib/leads-platform/land/fund-match');
const { readCatalog } = require('../lib/buyers/store');

describe('land fund match', () => {
  const catalog = readCatalog();

  it('matches Leviathan-shaped FL lot', () => {
    const matches = matchLandFunds({
      leadType: 'land',
      state: 'FL',
      city: 'Cape Coral',
      zip: '33990',
      acres: 0.25,
      address: '1 Palm'
    }, catalog);
    assert.ok(matches.some((m) => m.fundId === 'leviathan' && m.score >= 40));
  });

  it('matches Gaia Dallas zip', () => {
    const matches = matchLandFunds({
      leadType: 'land',
      state: 'TX',
      city: 'Dallas',
      zip: '75212',
      acres: 0.15
    }, catalog);
    assert.ok(matches.some((m) => m.fundId === 'gaia' && m.score >= 40));
  });

  it('does not match Leviathan for TX lot', () => {
    const matches = matchLandFunds({
      leadType: 'land',
      state: 'TX',
      city: 'Dallas',
      zip: '75212',
      acres: 0.2
    }, catalog);
    assert.ok(!matches.some((m) => m.fundId === 'leviathan'));
  });
});
