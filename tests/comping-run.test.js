const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createReapiClient, mapReapiCompsResponse, formatReapiAddress } = require('../lib/leads-platform/comping/reapi-client');
const { runAutoComp, buildPropertyCompsBody } = require('../lib/leads-platform/comping/run-comp');
const mockComps = require('./fixtures/comping/reapi-comps-mock.json');
const zeroComps = require('./fixtures/comping/reapi-comps-zero-mock.json');

describe('reapi-client', () => {
  it('maps comps with positive lastSaleAmount to internal shape', () => {
    const mapped = mapReapiCompsResponse(mockComps);
    assert.ok(mapped.length >= 5);
    const priced = mapped.filter((c) => c.price > 0);
    assert.equal(priced.length, 5);
    assert.ok(priced.every((c) => c.sqft > 0 && c.beds === 3));
    const zero = mapped.find((c) => c.id === 'c6-zero');
    assert.equal(zero.unusable, true);
    assert.equal(zero.price, 0);
  });

  it('coerces nested REAPI address objects to strings', () => {
    const mapped = mapReapiCompsResponse({
      comps: [{
        id: 'nested-addr',
        lastSaleAmount: 100000,
        squareFeet: 600,
        bedrooms: 2,
        bathrooms: 1,
        address: {
          street: '1019 Winnebago Ave',
          city: 'Sandusky',
          state: 'OH',
          zip: '44870',
          address: '1019 Winnebago Ave, Sandusky, OH 44870',
        },
      }],
    });
    assert.equal(mapped[0].address, '1019 Winnebago Ave, Sandusky, OH 44870');
    assert.equal(typeof mapped[0].address, 'string');
    assert.equal(
      formatReapiAddress({ street: '1 Main', city: 'Columbus', state: 'OH', zip: '43215' }),
      '1 Main, Columbus, OH, 43215'
    );
  });

  it('posts to PropertyComps with x-api-key header', async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        json: async () => ({ comps: [] }),
      };
    };
    const client = createReapiClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.realestateapi.com',
      fetchImpl,
    });
    await client.propertyComps({
      address: '1 Main St, Columbus, OH 43215',
      max_radius_miles: 0.5,
    });
    assert.match(captured.url, /PropertyComps/);
    assert.equal(captured.init.headers['x-api-key'], 'test-key');
    assert.equal(captured.init.method, 'POST');
    const sent = JSON.parse(captured.init.body);
    assert.equal(sent.address, '1 Main St, Columbus, OH 43215');
    assert.equal(sent.max_radius_miles, 0.5);
    assert.equal(sent.latitude, undefined);
  });

  it('falls back to v2 PropertyComps when v3 fails', async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      if (url.includes('/v3/')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ message: 'not found' }),
        };
      }
      return {
        ok: true,
        json: async () => ({ comps: [] }),
      };
    };
    const client = createReapiClient({
      apiKey: 'k',
      baseUrl: 'https://api.realestateapi.com',
      fetchImpl,
    });
    await client.propertyComps({ address: '1 Main St, Columbus, OH 43215', max_radius_miles: 0.5 });
    assert.equal(urls.length, 2);
    assert.match(urls[0], /\/v3\/PropertyComps/);
    assert.match(urls[1], /\/v2\/PropertyComps/);
  });

  it('throws with status on REAPI error', async () => {
    const client = createReapiClient({
      apiKey: 'k',
      baseUrl: 'https://api.realestateapi.com',
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      }),
    });
    await assert.rejects(
      () => client.propertyDetail({ id: 'x' }),
      (err) => err.status === 401 && /Unauthorized/.test(err.message)
    );
  });
});

describe('buildPropertyCompsBody', () => {
  const subject = {
    fullAddress: '527 Huron Ave, Sandusky, OH 44870',
    sqft: 504,
    beds: 1,
    baths: 1.5,
    yearBuilt: 1940,
  };

  it('pulls wider than ±10% and omits year_built filters', () => {
    const body = buildPropertyCompsBody(subject, { radius: 0.5, ladderLevel: 0 });
    assert.equal(body.address, subject.fullAddress);
    assert.equal(body.max_radius_miles, 0.5);
    assert.equal(body.max_days_back, 180);
    assert.equal(body.year_built_min, undefined);
    assert.equal(body.year_built_max, undefined);
    // ±25% of 504 = 126, abs floor 200 → 304–704
    assert.equal(body.living_square_feet_min, 304);
    assert.equal(body.living_square_feet_max, 704);
    assert.equal(body.bedrooms_min, 0);
    assert.equal(body.bedrooms_max, 2);
  });

  it('widens thin ladder pull for small / starved markets', () => {
    const body = buildPropertyCompsBody(subject, { radius: 5, ladderLevel: 2 });
    assert.equal(body.max_radius_miles, 5);
    assert.equal(body.max_days_back, 730);
    assert.equal(body.year_built_min, undefined);
    // ±40% of 504 = 202, abs floor 350 → 154–854
    assert.equal(body.living_square_feet_min, 154);
    assert.equal(body.living_square_feet_max, 854);
    assert.equal(body.bedrooms_max, 3);
    assert.equal(body.bathrooms_max, 3.5);
  });
});

describe('runAutoComp', () => {
  beforeEach(() => {
    // ensure barrier cache does not leak between tests
    const { clearBarrierCache } = require('../lib/leads-platform/comping/barriers');
    clearBarrierCache();
  });

  it('returns needsManual for TX lead without calling REAPI comps', async () => {
    let called = false;
    const out = await runAutoComp(
      { leadId: '1', address: '1 Main', city: 'Houston', state: 'TX', lat: 29.7, lng: -95.3 },
      { reapi: { propertyComps: async () => { called = true; return {}; } } }
    );
    assert.equal(out.needsManual, true);
    assert.equal(called, false);
  });

  it('returns needsManual for ND lead without calling REAPI comps', async () => {
    let called = false;
    const out = await runAutoComp(
      { leadId: '1', address: '1 Main', city: 'Fargo', state: 'ND', lat: 46.88, lng: -96.79 },
      { reapi: { propertyComps: async () => { called = true; return {}; } } }
    );
    assert.equal(out.needsManual, true);
    assert.equal(out.ok, false);
    assert.equal(called, false);
  });

  it('rejects land leads out of scope', async () => {
    const out = await runAutoComp(
      { leadId: '1', address: '1 Lot', city: 'Columbus', state: 'OH', leadType: 'land', lat: 39.96, lng: -82.99 },
      { reapi: { propertyComps: async () => mockComps } }
    );
    assert.equal(out.ok, false);
    assert.match(out.error, /land/i);
  });

  it('persists ARV patch for disclosure subject with priced comps', async () => {
    const compsBodies = [];
    const out = await runAutoComp(
      {
        leadId: '1',
        address: '1 Main St',
        city: 'Columbus',
        state: 'OH',
        zip: '43215',
        lat: 39.96,
        lng: -82.99,
        propertyDetails: { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1985 },
      },
      {
        reapi: {
          propertyDetail: async (body) => {
            assert.equal(body.address, '1 Main St, Columbus, OH 43215');
            assert.equal(body.latitude, undefined);
            return {
              id: 's1',
              squareFeet: 1500,
              bedrooms: 3,
              bathrooms: 2,
              yearBuilt: 1985,
              latitude: 39.96,
              longitude: -82.99,
              estimatedValue: 999999,
            };
          },
          propertyComps: async (body) => {
            compsBodies.push(body);
            return mockComps;
          },
          propertySearch: async () => ({ data: [] }),
        },
        checkRoadBarrier: async () => ({ crossed: false, degraded: false }),
      }
    );
    assert.ok(compsBodies.length >= 1);
    assert.equal(compsBodies[0].address, '1 Main St, Columbus, OH 43215');
    assert.equal(typeof compsBodies[0].max_radius_miles, 'number');
    assert.equal(compsBodies[0].latitude, undefined);
    assert.equal(compsBodies[0].radius, undefined);
    assert.equal(out.ok, true);
    assert.ok(out.leadPatch.estARV > 0);
    assert.notEqual(out.leadPatch.estARV, 999999);
    assert.equal(out.leadPatch.compSource, 'reapi');
    assert.ok(out.report.rulesSummary);
    assert.ok(out.leadPatch.compedAt);
    assert.ok(out.leadPatch.comps.length >= 3);
    assert.ok(out.report.subject.streetViewUrl);
  });

  it('blocks disclosure lead when thin market yields fewer than 3 included comps', async () => {
    const thinComps = {
      comps: mockComps.comps.slice(0, 2),
    };
    const out = await runAutoComp(
      {
        leadId: '1',
        address: '1 Main St',
        city: 'Columbus',
        state: 'OH',
        lat: 39.96,
        lng: -82.99,
        propertyDetails: { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1985 },
        estARV: 300000,
      },
      {
        reapi: {
          propertyDetail: async () => ({ id: 's1' }),
          propertyComps: async () => thinComps,
          propertySearch: async () => ({ data: [] }),
        },
        checkRoadBarrier: async () => ({ crossed: false, degraded: false }),
      }
    );
    assert.equal(out.ok, true);
    assert.equal(out.report.confidence, 'blocked');
    assert.equal(out.report.arv, null);
    assert.equal(out.report.includedCount, 2);
    // AVM-only estARV without prior Comp is not preserved
    assert.equal(out.leadPatch.estARV, null);
    assert.equal(out.report.arvPreserved, false);
    assert.equal(out.leadPatch.compConfidence, 'blocked');
  });

  it('blocks disclosure lead when all comps have zero sale price', async () => {
    const out = await runAutoComp(
      {
        leadId: '1',
        address: '1 Main St',
        city: 'Columbus',
        state: 'OH',
        lat: 39.96,
        lng: -82.99,
        propertyDetails: { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1985 },
        estARV: 300000,
      },
      {
        reapi: {
          propertyDetail: async () => ({ id: 's1' }),
          propertyComps: async () => zeroComps,
          propertySearch: async () => ({ data: [] }),
        },
        checkRoadBarrier: async () => ({ crossed: false, degraded: false }),
      }
    );
    assert.equal(out.ok, true);
    assert.equal(out.report.confidence, 'blocked');
    assert.equal(out.report.arv, null);
    assert.equal(out.report.includedCount, 0);
    assert.equal(out.leadPatch.estARV, null);
    assert.equal(out.leadPatch.compConfidence, 'blocked');
    assert.ok(out.leadPatch.comps.every((c) => !c.includedInArv));
    const priceFails = out.leadPatch.comps.flatMap((c) => c.ruleResults || [])
      .filter((r) => r.id === 'usable_price' && r.status === 'fail');
    assert.ok(priceFails.length >= 3);
  });

  it('preserves prior Comp ARV when re-comp is blocked', async () => {
    const thinComps = { comps: mockComps.comps.slice(0, 2) };
    const out = await runAutoComp(
      {
        leadId: '1',
        address: '1 Main St',
        city: 'Columbus',
        state: 'OH',
        lat: 39.96,
        lng: -82.99,
        propertyDetails: { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1985 },
        estARV: 248000,
        compedAt: '2026-07-01T00:00:00.000Z',
        compSource: 'reapi',
        compConfidence: 'high',
      },
      {
        reapi: {
          propertyDetail: async () => ({ id: 's1' }),
          propertyComps: async () => thinComps,
          propertySearch: async () => ({ data: [] }),
        },
        checkRoadBarrier: async () => ({ crossed: false, degraded: false }),
      }
    );
    assert.equal(out.ok, true);
    assert.equal(out.report.confidence, 'blocked');
    assert.equal(out.report.arv, null);
    assert.equal(out.report.arvPreserved, true);
    assert.equal(out.report.preservedArv, 248000);
    assert.equal(out.leadPatch.estARV, 248000);
    assert.equal(out.leadPatch.compConfidence, 'blocked');
  });
});
