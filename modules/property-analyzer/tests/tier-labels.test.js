const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tierUiLabel, TIER_UI_LABELS } = require('../lib/tier-labels');

describe('tierUiLabel', () => {
  it('returns canonical labels for primary keys', () => {
    assert.equal(tierUiLabel('distressed'), 'Distressed');
    assert.equal(tierUiLabel('well_maintained'), 'Well Maintained');
    assert.equal(tierUiLabel('vacant'), 'Land');
    assert.equal(tierUiLabel('blurred'), 'Blocked');
    assert.equal(tierUiLabel('review'), 'Needs Review');
  });

  it('aliases land and blocked', () => {
    assert.equal(tierUiLabel('land'), 'Land');
    assert.equal(tierUiLabel('blocked'), 'Blocked');
  });

  it('exposes TIER_UI_LABELS map', () => {
    assert.equal(TIER_UI_LABELS.vacant, 'Land');
  });
});
