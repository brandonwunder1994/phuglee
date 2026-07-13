'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  collectStreetViewRepairCandidates,
  requeueStreetViewRepairs,
  isSatelliteOnlyFallback
} = require('../lib/streetview-repair');

describe('streetview-repair', () => {
  it('detects satellite-only fallbacks', () => {
    assert.equal(isSatelliteOnlyFallback({ skippedStreetView: true }), true);
    assert.equal(isSatelliteOnlyFallback({ usedSatellite: true, viewMeta: null }), true);
    assert.equal(isSatelliteOnlyFallback({ usedSatellite: true, viewMeta: { panoId: 'x' } }), false);
  });

  it('collects Jul 12–13 satellite-only results', () => {
    const results = [
      { address: '1 A St', skippedStreetView: true, analyzedAt: Date.parse('2026-07-12T15:00:00.000') },
      { address: '2 B St', skippedStreetView: true, analyzedAt: Date.parse('2026-07-10T15:00:00.000') },
      { address: '3 C St', usedSatellite: true, viewMeta: { panoId: 'ok' }, analyzedAt: Date.parse('2026-07-13T10:00:00.000') }
    ];
    const matches = collectStreetViewRepairCandidates(results, { from: '2026-07-12', to: '2026-07-13' });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].address, '1 A St');
  });

  it('requeues matched results without touching others', () => {
    const session = {
      results: [
        { email: '', phone: '', address: '1 A St', skippedStreetView: true },
        { email: '', phone: '', address: '2 B St', viewMeta: { panoId: 'x' } }
      ],
      processed: 2
    };
    const repaired = requeueStreetViewRepairs(session, [session.results[0]]);
    assert.equal(repaired.removed, 1);
    assert.equal(repaired.session.results.length, 1);
    assert.equal(repaired.session.results[0].address, '2 B St');
  });
});
