const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  streetViewUnavailableForRecord,
  recordUsedSatelliteOnly,
  resolvePropertyImageUrls,
  resolveReviewImageUrls
} = require('../lib/imagery-urls');

const ADDR = '123 Main St, Austin, TX 78701';

function deps(overrides = {}) {
  return {
    hasImageryKey: () => true,
    getCachedImageryUrls: () => ({ streetView: null, satellite: null }),
    buildStreetViewThumbUrl: (address) => `/api/sv-image?address=${encodeURIComponent(address)}`,
    buildSatelliteThumbUrl: (address) => `/api/satellite-image?address=${encodeURIComponent(address)}`,
    apiKey: '',
    streetViewSize: '480x360',
    satelliteSize: '400x400',
    ...overrides
  };
}

describe('imagery-urls', () => {
  it('detects street view unavailable from record flags', () => {
    assert.equal(streetViewUnavailableForRecord({ skippedStreetView: true }), true);
    assert.equal(streetViewUnavailableForRecord({ qualityFlags: ['no_streetview'] }), true);
    assert.equal(streetViewUnavailableForRecord({ address: ADDR }), false);
  });

  it('resolvePropertyImageUrls uses cache before API (cache-first)', () => {
    const cachedSv = '/api/cached-imagery/streetview/abc123.jpg';
    const out = resolvePropertyImageUrls(
      { address: ADDR },
      deps({
        getCachedImageryUrls: () => ({ streetView: cachedSv, satellite: null })
      })
    );
    assert.equal(out.streetView, cachedSv);
    assert.equal(out.fromCache, true);
  });

  it('resolvePropertyImageUrls works with empty apiKey when hasImageryKey is true (proxy mode)', () => {
    const out = resolvePropertyImageUrls(
      { address: ADDR },
      deps({ apiKey: '' })
    );
    assert.ok(out.streetView?.includes('/api/sv-image'));
    assert.ok(out.satellite?.includes('/api/satellite-image'));
    assert.equal(out.fromCache, false);
  });

  it('resolvePropertyImageUrls returns empty when hasImageryKey is false', () => {
    const out = resolvePropertyImageUrls(
      { address: ADDR },
      deps({ hasImageryKey: () => false })
    );
    assert.equal(out.streetView, null);
    assert.equal(out.satellite, null);
  });

  it('resolveReviewImageUrls prefers street view and skips satellite when SV available', () => {
    const out = resolveReviewImageUrls(
      { address: ADDR },
      deps({
        getCachedImageryUrls: () => ({
          streetView: '/api/cached-imagery/streetview/sv.jpg',
          satellite: '/api/cached-imagery/satellite/sat.jpg'
        })
      })
    );
    assert.equal(out.streetView, '/api/cached-imagery/streetview/sv.jpg');
    assert.equal(out.satellite, null);
    assert.equal(out.fromCache, true);
  });

  it('resolveReviewImageUrls uses satellite when street view unavailable', () => {
    const sat = '/api/cached-imagery/satellite/sat.jpg';
    const out = resolveReviewImageUrls(
      { address: ADDR, skippedStreetView: true },
      deps({
        getCachedImageryUrls: () => ({ streetView: null, satellite: sat })
      })
    );
    assert.equal(out.streetView, null);
    assert.equal(out.satellite, sat);
  });

  it('resolveReviewImageUrls does not require client apiKey string', () => {
    const out = resolveReviewImageUrls(
      { address: ADDR },
      deps({ apiKey: '', hasImageryKey: () => true })
    );
    assert.ok(out.streetView || out.satellite);
  });
});