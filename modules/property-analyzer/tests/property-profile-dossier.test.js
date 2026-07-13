// modules/property-analyzer/tests/property-profile-dossier.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  propertyHasSatelliteMedia,
  getPresentProfileSections,
  PROFILE_SECTION_ORDER,
  buildProfileSectionNavHtml
} = require('../lib/property-profile-dossier.js');

describe('propertyHasSatelliteMedia', () => {
  it('returns false when no sat URL', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: false,
      hasCachedSatellite: true,
      usedSatellite: true
    }), false);
  });
  it('returns false when URL exists but no property-level sat signal', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: true,
      hasCachedSatellite: false,
      usedSatellite: false,
      skippedStreetView: false,
      preferSatellite: false
    }), false);
  });
  it('returns true when cached sat + URL', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: true,
      hasCachedSatellite: true
    }), true);
  });
  it('returns true when usedSatellite + URL', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: true,
      usedSatellite: true
    }), true);
  });
  it('returns true when skippedStreetView + URL', () => {
    assert.equal(propertyHasSatelliteMedia({
      hasSatelliteUrl: true,
      skippedStreetView: true
    }), true);
  });
});

describe('getPresentProfileSections', () => {
  it('always includes overview when hasOverview', () => {
    assert.deepEqual(
      getPresentProfileSections({ hasOverview: true }),
      ['overview']
    );
  });
  it('orders contact before violations before values', () => {
    const ids = getPresentProfileSections({
      hasOverview: true,
      hasContact: true,
      hasViolations: true,
      hasValues: true,
      hasProperty: false,
      hasFlags: false
    });
    assert.deepEqual(ids, ['overview', 'contact', 'violations', 'values']);
  });
  it('omits empty sections', () => {
    const ids = getPresentProfileSections({
      hasOverview: true,
      hasContact: false,
      hasViolations: false,
      hasValues: true,
      hasProperty: true,
      hasFlags: false
    });
    assert.deepEqual(ids, ['overview', 'values', 'property']);
  });
});

describe('buildProfileSectionNavHtml', () => {
  it('renders tab buttons with data-profile-section and aria-selected', () => {
    const html = buildProfileSectionNavHtml(['overview', 'values']);
    assert.match(html, /data-profile-section="overview"/);
    assert.match(html, /data-profile-section="values"/);
    assert.match(html, /aria-selected="true"/);
    assert.match(html, /Overview/);
    assert.match(html, /Values/);
    assert.doesNotMatch(html, /Violations/);
  });
  it('marks requested section as selected', () => {
    const html = buildProfileSectionNavHtml(['overview', 'contact', 'values'], 'values');
    assert.match(html, /data-profile-section="values"[^>]*aria-selected="true"/);
    assert.match(html, /data-profile-section="overview"[^>]*aria-selected="false"/);
  });
});
