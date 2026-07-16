const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { isNonDisclosureState } = require('../lib/leads-platform/comping/nd-states');
const { scoreComp, classifyRenovation } = require('../lib/leads-platform/comping/rules');
const { streetViewUrl } = require('../lib/leads-platform/comping/street-view');
const { checkRoadBarrier, clearBarrierCache } = require('../lib/leads-platform/comping/barriers');
const { computeArvFromComps } = require('../lib/leads-platform/comping/arv');
const { assessConfidence } = require('../lib/leads-platform/comping/confidence');
const { normalizeLeadRecord } = require('../lib/leads-platform/schema');
const { mergeIncomingWithCatalogLead } = require('../lib/leads-platform/analyzer-sync');
const subjectFixture = require('./fixtures/comping/subject.json');
const candidatesFixture = require('./fixtures/comping/candidates.json');

describe('nd-states', () => {
  it('treats TX as non-disclosure', () => {
    assert.equal(isNonDisclosureState('TX'), true);
    assert.equal(isNonDisclosureState('tx'), true);
  });
  it('treats CA as disclosure', () => {
    assert.equal(isNonDisclosureState('CA'), false);
  });
});

describe('schema comp fields', () => {
  it('normalizes comping fields', () => {
    const lead = normalizeLeadRecord({
      leadId: 'x', address: '1 Main', city: 'Austin', state: 'TX',
      leadType: 'well_maintained', reviewStatus: 'approved', signalTags: [],
      estARV: 250000,
      compSource: 'manual_propelio',
      compConfidence: 'manual',
      compedAt: '2026-07-15T00:00:00.000Z',
      comps: [{ address: '2 Main', price: 240000, soldDate: '2026-01-01', sqft: 1400 }],
      compingReport: { version: '1', arv: 250000, confidence: 'manual' },
      compReportFiles: [{ id: 'f1', filename: 'cma.pdf', mime: 'application/pdf', size: 10, uploadedAt: '2026-07-15T00:00:00.000Z', path: 'x' }]
    });
    assert.equal(lead.compSource, 'manual_propelio');
    assert.equal(lead.compConfidence, 'manual');
    assert.equal(lead.comps.length, 1);
    assert.equal(lead.compReportFiles[0].filename, 'cma.pdf');
  });
});

describe('Comping Rules scorer', () => {
  it('hard-fails token sale prices below $10k floor', () => {
    const { scoreComp } = require('../lib/leads-platform/comping/rules');
    const subject = require('./fixtures/comping/subject.json');
    const scored = scoreComp(subject, {
      address: 'junk',
      price: 300,
      soldDate: '2026-03-01',
      sqft: 1000,
      beds: 3,
      baths: 2,
      distanceMi: 0.2,
      yearBuilt: 1985,
      propertyType: 'sfr'
    }, { ladderLevel: 0, neighborhoodPpsfMedian: 120 });
    assert.equal(scored.includedEligible, false);
    assert.ok(scored.rules.some((r) => r.id === 'usable_price' && r.status === 'fail'));
  });

  it('hard-fails zero sale price', () => {
    const r = scoreComp(
      { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1980, lat: 30, lng: -97 },
      { price: 0, sqft: 1480, beds: 3, baths: 2, distanceMi: 0.2, soldDate: '2026-05-01' }
    );
    assert.equal(r.status, 'fail');
    assert.equal(r.includedEligible, false);
    const priceRule = r.rules.find((rule) => rule.id === 'usable_price');
    assert.equal(priceRule.status, 'fail');
  });

  it('hard-fails size beyond max(±10%, ±250 sf)', () => {
    const r = scoreComp(
      { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1980, lat: 30, lng: -97 },
      { price: 280000, sqft: 2200, beds: 3, baths: 2, distanceMi: 0.2, soldDate: '2026-05-01' }
    );
    assert.equal(r.status, 'fail');
    const sizeRule = r.rules.find((rule) => rule.id === 'size_band');
    assert.equal(sizeRule.status, 'fail');
  });

  it('allows small-home comps within ±250 sf even when over ±10%', () => {
    // 504 → ±10% is only ±50; brain max ±250 keeps 640 in-band
    const r = scoreComp(
      { sqft: 504, beds: 1, baths: 1.5, yearBuilt: 1940, propertyType: 'sfr', lat: 41.4, lng: -82.7 },
      {
        price: 60000,
        sqft: 640,
        beds: 1,
        baths: 1,
        distanceMi: 0.44,
        soldDate: '2025-01-03',
        yearBuilt: 1930,
        propertyType: 'sfr',
      },
      { ladderLevel: 2 }
    );
    const sizeRule = r.rules.find((rule) => rule.id === 'size_band');
    assert.notEqual(sizeRule.status, 'fail');
    assert.equal(r.includedEligible, true);
  });

  it('passes a well-matched comp from fixtures', () => {
    const candidate = candidatesFixture.find((c) => c.id === 'good-nearby');
    const r = scoreComp(subjectFixture, candidate);
    assert.equal(r.status, 'pass');
    assert.equal(r.includedEligible, true);
  });

  it('soft-fails distance between 0.5 and 1.0 mi', () => {
    const r = scoreComp(
      subjectFixture,
      { price: 250000, sqft: 1480, beds: 3, baths: 2, distanceMi: 0.75, soldDate: '2026-05-01', yearBuilt: 1982 }
    );
    assert.equal(r.status, 'soft');
    const distRule = r.rules.find((rule) => rule.id === 'distance');
    assert.equal(distRule.status, 'soft');
  });

  it('hard-fails barrier when barrierCrossed is true', () => {
    const r = scoreComp(
      subjectFixture,
      { price: 250000, sqft: 1480, beds: 3, baths: 2, distanceMi: 0.2, soldDate: '2026-05-01', yearBuilt: 1982 },
      { barrierCrossed: true }
    );
    assert.equal(r.status, 'fail');
    const barrierRule = r.rules.find((rule) => rule.id === 'barrier');
    assert.equal(barrierRule.status, 'fail');
  });

  it('soft-fails barrier when barrierUnavailable is set', () => {
    const r = scoreComp(
      subjectFixture,
      { price: 250000, sqft: 1480, beds: 3, baths: 2, distanceMi: 0.2, soldDate: '2026-05-01', yearBuilt: 1982 },
      { barrierUnavailable: true }
    );
    assert.equal(r.status, 'soft');
    const barrierRule = r.rules.find((rule) => rule.id === 'barrier');
    assert.equal(barrierRule.status, 'soft');
    assert.match(barrierRule.detail, /unavailable/i);
  });

  it('classifies likely renovated comp with cash flip signals', () => {
    const renovation = classifyRenovation(
      { price: 280000, sqft: 1500, cashBuyer: true, priorSaleDate: '2024-06-01', soldDate: '2025-12-01' },
      { neighborhoodPpsfMedian: 120 }
    );
    assert.equal(renovation, 'likely');
  });
});

describe('ARV math', () => {
  it('computes median ARV from included comps', () => {
    const scored = [
      { includedEligible: true, status: 'pass', adjustedPrice: 200000, candidate: { price: 200000 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 220000, candidate: { price: 220000 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 210000, candidate: { price: 210000 } }
    ];
    const out = computeArvFromComps({ sqft: 1500 }, scored, {});
    assert.equal(out.arv, 210000);
    assert.equal(out.method, 'median');
    assert.equal(out.included.length, 3);
    assert.equal(out.excluded.length, 0);
  });

  it('drops high and low when five or more comps', () => {
    const scored = [
      { includedEligible: true, status: 'pass', adjustedPrice: 180000, candidate: { price: 180000 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 200000, candidate: { price: 200000 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 210000, candidate: { price: 210000 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 220000, candidate: { price: 220000 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 300000, candidate: { price: 300000 } }
    ];
    const out = computeArvFromComps({ sqft: 1500 }, scored, {});
    assert.equal(out.arv, 210000);
    assert.equal(out.method, 'trimmed_median');
  });

  it('applies DOM soft haircut when marketTag is soft', () => {
    const scored = [
      { includedEligible: true, status: 'pass', adjustedPrice: 200000, candidate: { price: 200000 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 220000, candidate: { price: 220000 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 210000, candidate: { price: 210000 } }
    ];
    const out = computeArvFromComps({ sqft: 1500 }, scored, { marketTag: 'soft' });
    assert.equal(out.arv, 199500);
    assert.ok(out.haircuts.some((h) => h.id === 'dom_soft'));
  });

  it('excludes ineligible comps from ARV cluster', () => {
    const scored = [
      { includedEligible: true, status: 'pass', adjustedPrice: 200000, candidate: { price: 200000 } },
      { includedEligible: false, status: 'fail', adjustedPrice: 999999, candidate: { price: 999999 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 220000, candidate: { price: 220000 } },
      { includedEligible: true, status: 'pass', adjustedPrice: 210000, candidate: { price: 210000 } }
    ];
    const out = computeArvFromComps({ sqft: 1500 }, scored, {});
    assert.equal(out.arv, 210000);
    assert.equal(out.included.length, 3);
    assert.equal(out.excluded.length, 1);
  });
});

describe('confidence', () => {
  it('blocks confidence when fewer than 3 included', () => {
    assert.equal(assessConfidence({ included: 2, ladderLevel: 0 }), 'blocked');
  });

  it('returns high with 3+ comps and 2+ likely renovated at ladder 0', () => {
    assert.equal(assessConfidence({ included: 4, ladderLevel: 0, renovationLikelyCount: 2 }), 'high');
  });

  it('returns medium with 3+ comps but thin renovation evidence', () => {
    assert.equal(assessConfidence({ included: 3, ladderLevel: 0, renovationLikelyCount: 1 }), 'medium');
  });

  it('returns low when thin ladder expanded', () => {
    assert.equal(assessConfidence({ included: 4, ladderLevel: 2, renovationLikelyCount: 2 }), 'low');
  });
});

describe('street-view', () => {
  it('builds google street view URL from coordinates', () => {
    const u = streetViewUrl({ lat: 30.27, lng: -97.74 });
    assert.match(u, /google\.com\/maps/);
    assert.match(u, /30\.27/);
    assert.match(u, /-97\.74/);
  });

  it('builds google street view URL from address', () => {
    const u = streetViewUrl({ address: '123 Main St, Austin, TX' });
    assert.match(u, /google\.com\/maps/);
    assert.match(u, /123/);
  });
});

describe('barriers', () => {
  beforeEach(() => {
    clearBarrierCache();
  });

  it('degrades gracefully when overpass fails', async () => {
    const r = await checkRoadBarrier(
      { lat: 30, lng: -97 },
      { lat: 30.01, lng: -97.01 },
      { fetchImpl: async () => { throw new Error('network'); } }
    );
    assert.equal(r.degraded, true);
    assert.equal(r.crossed, false);
    assert.match(r.detail, /unavailable/i);
  });

  it('maps degraded barrier check to scoreComp soft-fail', async () => {
    const barrier = await checkRoadBarrier(
      { lat: 30, lng: -97 },
      { lat: 30.01, lng: -97.01 },
      { fetchImpl: async () => { throw new Error('network'); } }
    );
    assert.equal(barrier.degraded, true);
    const r = scoreComp(
      subjectFixture,
      { price: 250000, sqft: 1480, beds: 3, baths: 2, distanceMi: 0.2, soldDate: '2026-05-01', yearBuilt: 1982 },
      { barrierUnavailable: barrier.degraded }
    );
    assert.equal(r.status, 'soft');
    const barrierRule = r.rules.find((rule) => rule.id === 'barrier');
    assert.equal(barrierRule.status, 'soft');
  });

  it('detects highway crossing from overpass geometry', async () => {
    const overpassResponse = {
      elements: [{
        type: 'way',
        tags: { highway: 'primary' },
        geometry: [
          { lat: 30.0, lon: -97.005 },
          { lat: 30.02, lon: -97.005 },
        ],
      }],
    };
    const r = await checkRoadBarrier(
      { lat: 30, lng: -97 },
      { lat: 30.01, lng: -97.01 },
      {
        fetchImpl: async () => ({
          ok: true,
          json: async () => overpassResponse,
        }),
      }
    );
    assert.equal(r.crossed, true);
    assert.equal(r.degraded, false);
    assert.match(r.detail, /primary|barrier|highway/i);
  });

  it('passes when no highways intersect the path', async () => {
    const r = await checkRoadBarrier(
      { lat: 30, lng: -97 },
      { lat: 30.01, lng: -97.01 },
      {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ elements: [] }),
        }),
      }
    );
    assert.equal(r.crossed, false);
    assert.equal(r.degraded, false);
  });

  it('caches results per subject-candidate pair', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true, json: async () => ({ elements: [] }) };
    };
    const subject = { lat: 30, lng: -97 };
    const candidate = { lat: 30.01, lng: -97.01 };
    await checkRoadBarrier(subject, candidate, { fetchImpl });
    await checkRoadBarrier(subject, candidate, { fetchImpl });
    assert.equal(calls, 1);
  });
});

describe('analyzer-sync comp preserve', () => {
  it('keeps comped estARV when incoming has AVM', () => {
    const existing = normalizeLeadRecord({
      leadId: 'x', address: '1 Main', city: 'Austin', state: 'TX',
      leadType: 'well_maintained', reviewStatus: 'approved', signalTags: [],
      estARV: 300000,
      compSource: 'manual_propelio',
      compedAt: '2026-07-15T00:00:00.000Z',
      comps: [{ address: '2 Main', price: 290000 }]
    });
    const incoming = normalizeLeadRecord({
      leadId: 'x', address: '1 Main', city: 'Austin', state: 'TX',
      leadType: 'well_maintained', reviewStatus: 'approved', signalTags: [],
      estARV: 111111
    });
    const merged = mergeIncomingWithCatalogLead(existing, incoming);
    assert.equal(merged.estARV, 300000);
    assert.equal(merged.compSource, 'manual_propelio');
    assert.equal(merged.comps.length, 1);
  });
});
