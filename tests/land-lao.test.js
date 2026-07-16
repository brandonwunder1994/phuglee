const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  computeLaoStack,
  computeSanityBands,
  normalizeLandUnderwriting,
  DEFAULT_INVESTOR_GAP
} = require('../lib/leads-platform/land/lao');

describe('land LAO math', () => {
  it('computes ceiling, target, default LAO', () => {
    const r = computeLaoStack({
      landFmv: 45000,
      siteCosts: 5000,
      investorGap: 5000,
      assignmentFee: 5000
    });
    assert.equal(r.buyerCeiling, 35000);
    assert.equal(r.contractTarget, 30000);
    assert.equal(r.lao, 30000);
  });

  it('sums siteCostParts', () => {
    const r = computeLaoStack({
      landFmv: 100000,
      siteCostParts: { clearing: 10000, demo: 8000, grade: 0, other: 2000 },
      investorGap: 5000,
      assignmentFee: 10000
    });
    assert.equal(r.siteCosts, 20000);
    assert.equal(r.buyerCeiling, 75000);
    assert.equal(r.contractTarget, 65000);
    assert.equal(r.lao, 65000);
  });

  it('keeps explicit LAO when provided', () => {
    const r = computeLaoStack({
      landFmv: 45000,
      siteCosts: 0,
      investorGap: 5000,
      assignmentFee: 5000,
      lao: 28000
    });
    assert.equal(r.contractTarget, 35000);
    assert.equal(r.lao, 28000);
  });

  it('defaults investor gap to 5000', () => {
    const r = computeLaoStack({ landFmv: 50000, assignmentFee: 0 });
    assert.equal(r.investorGap, DEFAULT_INVESTOR_GAP);
    assert.equal(r.buyerCeiling, 45000);
  });

  it('leaves derived null when FMV missing', () => {
    const r = computeLaoStack({ siteCosts: 1000, investorGap: 5000, assignmentFee: 1000 });
    assert.equal(r.landFmv, null);
    assert.equal(r.buyerCeiling, null);
    assert.equal(r.contractTarget, null);
    assert.equal(r.lao, null);
  });

  it('sanity bands for suburbia', () => {
    const s = computeSanityBands({ pocket: 'suburbia', newBuildArv: 400000 });
    assert.equal(s.buyBand, 60000);
    assert.equal(s.sellBand, 80000);
  });

  it('sanity bands for sticks and prime', () => {
    assert.deepEqual(
      { buy: computeSanityBands({ pocket: 'sticks', newBuildArv: 200000 }).buyBand,
        sell: computeSanityBands({ pocket: 'sticks', newBuildArv: 200000 }).sellBand },
      { buy: 20000, sell: 30000 }
    );
    assert.deepEqual(
      { buy: computeSanityBands({ pocket: 'prime', newBuildArv: 500000 }).buyBand,
        sell: computeSanityBands({ pocket: 'prime', newBuildArv: 500000 }).sellBand },
      { buy: 100000, sell: 125000 }
    );
  });

  it('normalizeLandUnderwriting defaults and warns on high FMV', () => {
    const uw = normalizeLandUnderwriting({
      landFmv: 200000,
      investorGap: 5000,
      assignmentFee: 10000,
      sanity: { pocket: 'suburbia', newBuildArv: 400000 }
    });
    assert.equal(uw.method, 'manual');
    assert.equal(uw.investorGap, 5000);
    assert.equal(uw.buyerCeiling, 195000);
    assert.equal(uw.contractTarget, 185000);
    assert.equal(uw.sanity.sellBand, 80000);
    assert.ok(uw.sanityWarning);
  });
});

describe('land underwriting API', () => {
  let tmpRoot;
  let store;
  let api;
  const fixtureLand = require('./fixtures/leads/sample-land.json');

  function mockRes() {
    return {
      statusCode: null,
      headers: {},
      body: '',
      writeHead(status) { this.statusCode = status; },
      end(chunk) { if (chunk) this.body += chunk; }
    };
  }

  function maxReq(url, method = 'GET', body = null) {
    return {
      method,
      url,
      headers: {
        host: '127.0.0.1:3000',
        'x-phuglee-user': 'alice',
        'x-phuglee-plan': 'max',
        'content-type': 'application/json'
      },
      async *[Symbol.asyncIterator]() {
        if (body) yield Buffer.from(JSON.stringify(body));
      }
    };
  }

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'land-lao-api-'));
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    process.env.VERCEL = '1';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/leads-platform/store')];
    delete require.cache[require.resolve('../lib/leads-platform/api')];
    delete require.cache[require.resolve('../lib/leads-platform/schema')];
    store = require('../lib/leads-platform/store');
    api = require('../lib/leads-platform/api');
    store.upsertLead(fixtureLand);
  });

  after(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    delete process.env.LEADS_CATALOG_ROOT;
  });

  it('schema defaults landUnderwriting on land leads', () => {
    const { normalizeLeadRecord } = require('../lib/leads-platform/schema');
    const lead = normalizeLeadRecord({
      leadId: 'x',
      address: 'Lot 9',
      city: 'Dallas',
      state: 'TX',
      leadType: 'land',
      reviewStatus: 'approved',
      signalTags: []
    });
    assert.equal(lead.landUnderwriting.investorGap, 5000);
    assert.equal(lead.landUnderwriting.method, 'manual');
  });

  it('PUT land-underwriting persists computed LAO', async () => {
    // Re-upsert in case parallel test files mutated LEADS_CATALOG_ROOT
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    store.invalidateIndexCache();
    store.upsertLead(fixtureLand);
    const id = fixtureLand.leadId;
    assert.ok(store.getLead(id), 'fixture land lead must exist');

    const res = mockRes();
    const url = new URL(`http://127.0.0.1/api/leads/${id}/land-underwriting`);
    await api.handle(
      maxReq(url.pathname, 'PUT', {
        landUnderwriting: {
          landFmv: 45000,
          siteCostParts: { clearing: 5000, demo: 0, grade: 0, other: 0 },
          investorGap: 5000,
          assignmentFee: 5000
        }
      }),
      res,
      url.pathname,
      url
    );
    assert.equal(res.statusCode, 200, res.body);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.landUnderwriting.buyerCeiling, 35000);
    assert.equal(body.landUnderwriting.contractTarget, 30000);
    assert.equal(body.landUnderwriting.lao, 30000);
    assert.equal(body.landUnderwriting.method, 'manual');
    assert.ok(body.landUnderwriting.updatedAt);

    const getRes = mockRes();
    await api.handle(maxReq(url.pathname, 'GET'), getRes, url.pathname, url);
    assert.equal(getRes.statusCode, 200, getRes.body);
    const got = JSON.parse(getRes.body);
    assert.equal(got.landUnderwriting.lao, 30000);
  });
});
