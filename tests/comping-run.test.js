const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createReapiClient, mapReapiCompsResponse } = require('../lib/leads-platform/comping/reapi-client');
const { runAutoComp } = require('../lib/leads-platform/comping/run-comp');
const mockComps = require('./fixtures/comping/reapi-comps-mock.json');

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
    await client.propertyComps({ latitude: 39.96, longitude: -82.99, radius: 0.5 });
    assert.match(captured.url, /PropertyComps/);
    assert.equal(captured.init.headers['x-api-key'], 'test-key');
    assert.equal(captured.init.method, 'POST');
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
    await client.propertyComps({ latitude: 1, longitude: 2 });
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

  it('rejects land leads out of scope', async () => {
    const out = await runAutoComp(
      { leadId: '1', address: '1 Lot', city: 'Columbus', state: 'OH', leadType: 'land', lat: 39.96, lng: -82.99 },
      { reapi: { propertyComps: async () => mockComps } }
    );
    assert.equal(out.ok, false);
    assert.match(out.error, /land/i);
  });

  it('persists ARV patch for disclosure subject with priced comps', async () => {
    const out = await runAutoComp(
      {
        leadId: '1',
        address: '1 Main St',
        city: 'Columbus',
        state: 'OH',
        lat: 39.96,
        lng: -82.99,
        propertyDetails: { sqft: 1500, beds: 3, baths: 2, yearBuilt: 1985 },
      },
      {
        reapi: {
          propertyDetail: async () => ({
            id: 's1',
            squareFeet: 1500,
            bedrooms: 3,
            bathrooms: 2,
            yearBuilt: 1985,
            latitude: 39.96,
            longitude: -82.99,
            estimatedValue: 999999,
          }),
          propertyComps: async () => mockComps,
          propertySearch: async () => ({ data: [] }),
        },
        checkRoadBarrier: async () => ({ crossed: false, degraded: false }),
      }
    );
    assert.equal(out.ok, true);
    assert.ok(out.leadPatch.estARV > 0);
    assert.notEqual(out.leadPatch.estARV, 999999);
    assert.equal(out.leadPatch.compSource, 'reapi');
    assert.ok(out.report.rulesSummary);
    assert.ok(out.leadPatch.compedAt);
    assert.ok(out.leadPatch.comps.length >= 3);
    assert.ok(out.report.subject.streetViewUrl);
  });

  it('does not set estARV when confidence is blocked', async () => {
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
    assert.equal(out.leadPatch.estARV, null);
    assert.equal(out.leadPatch.compConfidence, 'blocked');
  });
});
