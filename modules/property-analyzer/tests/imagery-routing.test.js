const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  streetAnalysisNeedsSatellite,
  propertyScanNeedsSatellite,
  scanNeedsSatellite,
  satelliteFallbackFailed
} = require('../lib/imagery-routing');

describe('propertyScanNeedsSatellite', () => {
  it('returns true for clear property analysis (accuracy-first fusion)', () => {
    assert.equal(propertyScanNeedsSatellite({
      category: 'property',
      confidence: 85,
      reason: 'Mowed yard and intact facade on subject home.'
    }), true);
  });

  it('returns false for privacy-blurred category', () => {
    assert.equal(propertyScanNeedsSatellite({
      category: 'blurred',
      reason: 'Google privacy blur on facade.'
    }), false);
  });

  it('returns true for vacant_lot', () => {
    assert.equal(propertyScanNeedsSatellite({
      category: 'vacant_lot',
      reason: 'Open lot with no structure footprint.'
    }), true);
  });

  it('returns true when structure_on_subject_lot is false', () => {
    assert.equal(propertyScanNeedsSatellite({
      category: 'property',
      structureOnLot: false,
      reason: 'Grass lot only.'
    }), true);
  });
});

describe('scanNeedsSatellite', () => {
  it('returns false for clear property (street-only bulk path)', () => {
    assert.equal(scanNeedsSatellite({
      category: 'property',
      confidence: 85,
      reason: 'Maintained ranch home.'
    }), false);
  });

  it('returns false for blurred category (no satellite)', () => {
    assert.equal(scanNeedsSatellite({
      category: 'blurred',
      reason: 'Privacy blur.'
    }), false);
  });

  it('returns true for unavailable street category', () => {
    assert.equal(scanNeedsSatellite({
      category: 'unavailable',
      reason: 'Cannot see the home.'
    }), true);
  });

  it('returns true for vacant_lot', () => {
    assert.equal(scanNeedsSatellite({
      category: 'vacant_lot',
      reason: 'Open lot with no structure.'
    }), true);
  });
});

describe('streetAnalysisNeedsSatellite', () => {
  it('returns false for clear property analysis (fallback-only gate)', () => {
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
