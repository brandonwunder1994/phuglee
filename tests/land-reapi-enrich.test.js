const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mapReapiDetail } = require('../lib/leads-platform/comping/reapi-client');
const {
  fillBlankParcelFromDetail,
  parcelPatchFromDetail,
  enrichLandLeadFromReapi
} = require('../lib/leads-platform/land/enrich-from-reapi');
const { extractParcelFields } = require('../lib/leads-platform/land/parcel');

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures/comping/reapi-property-detail-land.json'),
    'utf8'
  )
);

describe('mapReapiDetail nested PropertyDetail', () => {
  it('reads lotInfo + propertyInfo for land parcel fields', () => {
    const d = mapReapiDetail(fixture);
    assert.equal(d.zoning, 'R-1');
    assert.equal(d.apn, '011279232');
    assert.equal(d.county, 'Pinellas');
    assert.equal(d.landUse, 'VACANT LAND');
    assert.equal(d.lotSqft, 10890);
    assert.ok(Math.abs(d.acres - 0.25) < 0.001);
    assert.equal(d.water, 'PUBLIC');
    assert.equal(d.sewer, 'PUBLIC');
    assert.match(d.flood, /X/);
    assert.equal(d.lat, 27.767);
    assert.equal(d.lng, -82.64);
    assert.equal(d.lotWidthFeet, 90);
    assert.equal(d.lotDepthFeet, 120);
  });
});

describe('fillBlankParcelFromDetail', () => {
  it('fills blanks and keeps operator values', () => {
    const detail = mapReapiDetail(fixture);
    const lead = {
      leadType: 'land',
      address: '123 Vacant Lot St',
      propertyDetails: { zoning: 'OPERATOR-Z', acres: 0.5 }
    };
    const out = fillBlankParcelFromDetail(lead, detail);
    const fields = extractParcelFields(out.lead);
    assert.equal(fields.zoning, 'OPERATOR-Z');
    assert.equal(fields.acres, 0.5);
    assert.equal(fields.apn, '011279232');
    assert.equal(fields.county, 'Pinellas');
    assert.equal(fields.water, 'PUBLIC');
    assert.ok(out.filled.includes('apn'));
    assert.ok(out.skipped.includes('zoning'));
  });

  it('builds frontage from lot width/depth', () => {
    const patch = parcelPatchFromDetail(mapReapiDetail(fixture));
    assert.match(patch.frontage, /90 ft/);
  });
});

describe('enrichLandLeadFromReapi', () => {
  it('merges mapped detail onto land lead', async () => {
    const reapi = {
      async propertyDetail() {
        return mapReapiDetail(fixture);
      }
    };
    const out = await enrichLandLeadFromReapi({
      leadId: 'test1',
      leadType: 'land',
      address: '123 Vacant Lot St',
      city: 'Saint Petersburg',
      state: 'FL'
    }, reapi);
    assert.equal(out.ok, true);
    assert.ok(out.filled.includes('zoning'));
    assert.ok(out.filled.includes('acres') || out.filled.includes('lotSqft'));
    const fields = extractParcelFields(out.lead);
    assert.equal(fields.zoning, 'R-1');
    assert.equal(fields.county, 'Pinellas');
    assert.equal(out.lead.lat, 27.767);
  });

  it('skips already-complete leads', async () => {
    const reapi = {
      async propertyDetail() {
        assert.fail('should not call REAPI');
      }
    };
    const out = await enrichLandLeadFromReapi({
      leadType: 'land',
      lat: 1,
      lng: 2,
      propertyDetails: {
        acres: 0.3,
        lotSqft: 13068,
        zoning: 'R-1',
        county: 'Pinellas',
        apn: '1',
        water: 'PUBLIC',
        sewer: 'PUBLIC',
        flood: 'X',
        frontage: '90 ft'
      }
    }, reapi);
    assert.equal(out.ok, true);
    assert.equal(out.skipped, true);
  });
});
