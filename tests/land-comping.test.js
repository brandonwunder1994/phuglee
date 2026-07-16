const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { scoreLandComp } = require('../lib/leads-platform/land/comping-rules');
const { computeLandFmv, landCompConfidence } = require('../lib/leads-platform/land/fmv');
const { runLandAutoComp } = require('../lib/leads-platform/land/run-land-comp');
const { buildManualLandCompReport } = require('../lib/leads-platform/land/manual-land-comp');

const subject = {
  address: 'Lot 1 Oak',
  city: 'Dallas',
  state: 'TX',
  lat: 32.7,
  lng: -96.8,
  lotSqft: 7000,
  acres: 7000 / 43560,
  propertyType: 'land'
};

describe('land comping rules', () => {
  it('includes nearby similar priced land sale', () => {
    const scored = scoreLandComp(subject, {
      price: 45000,
      soldDate: new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10),
      distanceMi: 0.3,
      lotSqft: 7200,
      propertyType: 'vacant land',
      sqft: 0
    });
    assert.equal(scored.included, true);
  });

  it('fails house-like large building sales', () => {
    const scored = scoreLandComp(subject, {
      price: 250000,
      soldDate: new Date().toISOString().slice(0, 10),
      distanceMi: 0.2,
      lotSqft: 7000,
      propertyType: 'sfr',
      sqft: 1600
    });
    assert.equal(scored.included, false);
  });

  it('fails distant comps', () => {
    const scored = scoreLandComp(subject, {
      price: 40000,
      soldDate: new Date().toISOString().slice(0, 10),
      distanceMi: 2.5,
      lotSqft: 7000,
      propertyType: 'land'
    });
    assert.equal(scored.included, false);
  });
});

describe('land FMV', () => {
  it('medians included prices', () => {
    const scored = [
      { included: true, candidate: { price: 40000, lotSqft: 7000 } },
      { included: true, candidate: { price: 50000, lotSqft: 7000 } },
      { included: true, candidate: { price: 45000, lotSqft: 7000 } },
      { included: false, candidate: { price: 90000, lotSqft: 7000 } }
    ];
    const r = computeLandFmv(subject, scored);
    assert.equal(r.landFmv, 45000);
    assert.equal(r.includedCount, 3);
    assert.equal(landCompConfidence({ includedCount: 3, method: r.method }), 'high');
  });
});

describe('runLandAutoComp', () => {
  it('needs manual for ND state', async () => {
    const out = await runLandAutoComp({
      leadType: 'land',
      state: 'TX',
      address: '1 Main',
      city: 'Austin'
    }, { reapi: {} });
    assert.equal(out.needsManual, true);
  });

  it('computes FMV from mock REAPI comps', async () => {
    const sold = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    const reapi = {
      async propertyDetail() {
        return {
          lotSqft: 7000,
          acres: 7000 / 43560,
          propertyType: 'land',
          lat: 32.7,
          lng: -96.8,
          zoning: 'R-2',
          county: 'Lee',
          apn: '99-1'
        };
      },
      async propertyComps() {
        return {
          comps: [
            {
              lastSaleAmount: 42000,
              lastSaleDate: sold,
              distance: 0.2,
              lotSquareFeet: 6900,
              propertyType: 'land',
              squareFeet: 0,
              address: '2 Oak'
            },
            {
              lastSaleAmount: 48000,
              lastSaleDate: sold,
              distance: 0.3,
              lotSquareFeet: 7100,
              propertyType: 'vacant',
              squareFeet: 0,
              address: '3 Oak'
            }
          ]
        };
      }
    };
    const out = await runLandAutoComp({
      leadType: 'land',
      state: 'FL',
      address: 'Lot 1 Oak',
      city: 'Cape Coral',
      lat: 32.7,
      lng: -96.8,
      landUnderwriting: { investorGap: 5000, assignmentFee: 5000 }
    }, { reapi });
    assert.equal(out.ok, true);
    assert.ok(out.leadPatch.landUnderwriting.landFmv >= 42000);
    assert.equal(out.leadPatch.landUnderwriting.method, 'engine');
    assert.ok(out.report.landFmv);
    assert.ok(out.leadPatch.landUnderwriting.buyerCeiling != null);
    assert.equal(out.leadPatch.propertyDetails.zoning, 'R-2');
    assert.ok(out.leadPatch.propertyDetails.lotSqft >= 7000);
  });
});

describe('manual land comp', () => {
  it('builds report and underwriting', () => {
    const { report, leadPatch } = buildManualLandCompReport({
      lead: {
        leadType: 'land',
        state: 'TX',
        address: 'Lot 1',
        city: 'Dallas',
        landUnderwriting: { investorGap: 5000, assignmentFee: 4000 }
      },
      landFmv: 40000,
      comps: [
        { address: 'A', price: 39000, soldDate: '2026-01-01', lotSqft: 7000 },
        { address: 'B', price: 41000, soldDate: '2026-02-01', lotSqft: 7100 }
      ]
    });
    assert.equal(report.landFmv, 40000);
    assert.equal(leadPatch.landUnderwriting.landFmv, 40000);
    assert.equal(leadPatch.landUnderwriting.lao, 31000);
    assert.equal(leadPatch.landCompSource, 'manual');
  });
});
