'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildStreetViewLookupStrategies } = require('../routes/maps');

describe('buildStreetViewLookupStrategies', () => {
  it('includes address, geocode, and outdoor variants', () => {
    const strategies = buildStreetViewLookupStrategies('123 Main St, Dallas, TX', {
      lat: 32.9,
      lng: -96.8,
      formatted: '123 Main St, Dallas, TX 75201'
    });
    const labels = strategies.map((s) => s.label);
    assert.ok(labels.includes('address'));
    assert.ok(labels.includes('formatted_address'));
    assert.ok(labels.includes('geocode_coords'));
    assert.ok(labels.includes('geocode_coords_outdoor'));
    assert.ok(labels.includes('address_outdoor'));
    assert.ok(strategies.length >= 5);
  });
});
