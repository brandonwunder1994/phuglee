const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  streetAnalysisNeedsSatellite,
  satelliteFallbackFailed
} = require('../lib/imagery-routing');

describe('streetAnalysisNeedsSatellite', () => {
  it('returns false for clear property analysis', () => {
    assert.equal(streetAnalysisNeedsSatellite({
      category: 'property',
      confidence: 85,
      reason: 'Mowed yard and intact facade on subject home.'
    }), false);
  });

  it('returns true for unavailable category', () => {
    assert.equal(streetAnalysisNeedsSatellite({
      category: 'unavailable',
      reason: 'Trees block view of the house.'
    }), true);
  });

  it('returns true for blurred category', () => {
    assert.equal(streetAnalysisNeedsSatellite({ category: 'blurred', reason: 'Privacy blur.' }), true);
  });

  it('returns true when reason says house not visible', () => {
    assert.equal(streetAnalysisNeedsSatellite({
      category: 'property',
      confidence: 70,
      reason: 'Cannot see the home — fence and shrubs block the facade.'
    }), true);
  });

  it('returns true for obstructed reason on property', () => {
    assert.equal(streetAnalysisNeedsSatellite({
      category: 'property',
      confidence: 62,
      reason: 'Home obscured by overgrown trees in front of structure.'
    }), true);
  });

  it('returns false for vacant_lot without unclear language', () => {
    assert.equal(streetAnalysisNeedsSatellite({
      category: 'vacant_lot',
      reason: 'Open lot with no structure footprint.'
    }), false);
  });

  it('returns true for analysis_incomplete quality flag', () => {
    assert.equal(streetAnalysisNeedsSatellite(
      { category: 'property', reason: 'Partial scan.' },
      { qualityFlags: ['analysis_incomplete'] }
    ), true);
  });

  it('returns false for minor cosmetic property', () => {
    assert.equal(streetAnalysisNeedsSatellite({
      category: 'property',
      confidence: 78,
      reason: 'Light peeling paint on otherwise maintained home.'
    }), false);
  });
});

describe('satelliteFallbackFailed', () => {
  it('true when no satellite and street unavailable', () => {
    assert.equal(satelliteFallbackFailed({ category: 'unavailable' }, null), true);
  });

  it('false when satellite finds property', () => {
    assert.equal(satelliteFallbackFailed(
      { category: 'unavailable' },
      { category: 'property', structureOnLot: true }
    ), false);
  });

  it('true when both unavailable', () => {
    assert.equal(satelliteFallbackFailed(
      { category: 'unavailable' },
      { category: 'unavailable' }
    ), true);
  });
});