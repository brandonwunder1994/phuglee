const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  promoteLeadToTeardown,
  normalizeTeardown,
  normalizeAssetClass
} = require('../lib/leads-platform/land/teardown');

describe('land teardown promote engine', () => {
  it('normalizes assetClass and teardown', () => {
    assert.equal(normalizeAssetClass('teardown'), 'teardown');
    assert.equal(normalizeAssetClass('vacant_lot'), 'vacant_lot');
    assert.equal(normalizeAssetClass('house'), null);
    const t = normalizeTeardown({
      promotedFromLeadType: 'distressed',
      demoEstimate: '12500.4',
      reason: 'contract_below_land_value',
      structureNote: ' Small footprint '
    });
    assert.equal(t.demoEstimate, 12500);
    assert.equal(t.structureNote, 'Small footprint');
    assert.equal(t.reason, 'contract_below_land_value');
  });

  it('promotes distressed house to land teardown', () => {
    const out = promoteLeadToTeardown({
      leadId: 'abc',
      leadType: 'distressed',
      address: '1 Main',
      city: 'Austin',
      state: 'TX',
      signalTags: ['Code']
    }, {
      demoEstimate: 8000,
      structureNote: 'Older ranch',
      reason: 'operator',
      promotedAt: '2026-07-15T12:00:00.000Z'
    });
    assert.equal(out.leadType, 'land');
    assert.equal(out.assetClass, 'teardown');
    assert.equal(out.teardown.promotedFromLeadType, 'distressed');
    assert.equal(out.teardown.demoEstimate, 8000);
    assert.equal(out.teardown.structureNote, 'Older ranch');
    assert.equal(out.landUnderwriting.siteCostParts.demo, 8000);
    assert.ok(out.signalTags.includes('Teardown'));
    assert.ok(out.signalTags.includes('Code'));
  });

  it('rejects already-land leads', () => {
    assert.throws(
      () => promoteLeadToTeardown({ leadType: 'land', leadId: 'x' }),
      (err) => err.code === 'ALREADY_LAND'
    );
  });
});

describe('promote-to-land API', () => {
  let tmpRoot;
  let store;
  let api;
  const fixtureHouse = require('./fixtures/leads/sample-distressed.json');
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
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'land-teardown-api-'));
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    process.env.VERCEL = '1';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/leads-platform/store')];
    delete require.cache[require.resolve('../lib/leads-platform/api')];
    delete require.cache[require.resolve('../lib/leads-platform/schema')];
    delete require.cache[require.resolve('../lib/leads-platform/land/teardown')];
    store = require('../lib/leads-platform/store');
    api = require('../lib/leads-platform/api');
    store.upsertLead(fixtureHouse);
    store.upsertLead(fixtureLand);
  });

  after(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    delete process.env.LEADS_CATALOG_ROOT;
  });

  it('POST promote-to-land moves house off home surface', async () => {
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    store.invalidateIndexCache();
    store.upsertLead({ ...fixtureHouse });

    const id = fixtureHouse.leadId;
    const res = mockRes();
    const url = new URL(`http://127.0.0.1/api/leads/${id}/promote-to-land`);
    await api.handle(
      maxReq(url.pathname, 'POST', {
        demoEstimate: 15000,
        structureNote: 'Roof gone',
        reason: 'contract_below_land_value'
      }),
      res,
      url.pathname,
      url
    );
    assert.equal(res.statusCode, 200, res.body);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.lead.leadType, 'land');
    assert.equal(body.lead.assetClass, 'teardown');
    assert.equal(body.lead.teardown.demoEstimate, 15000);
    assert.equal(body.lead.landUnderwriting.siteCostParts.demo, 15000);
    assert.ok(body.redirect.includes('/land-vault?lead='));

    const homeList = store.queryLeads({ surface: 'home', leadType: 'all' });
    assert.ok(!homeList.leads.some((l) => l.leadId === id));

    const landList = store.queryLeads({ surface: 'land', assetClass: 'teardown' });
    assert.ok(landList.leads.some((l) => l.leadId === id));
  });

  it('rejects promoting an existing land lead', async () => {
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    store.invalidateIndexCache();
    store.upsertLead(fixtureLand);
    const id = fixtureLand.leadId;
    const res = mockRes();
    const url = new URL(`http://127.0.0.1/api/leads/${id}/promote-to-land`);
    await api.handle(maxReq(url.pathname, 'POST', {}), res, url.pathname, url);
    assert.equal(res.statusCode, 400, res.body);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'ALREADY_LAND');
  });

  it('schema keeps assetClass + teardown on normalize', () => {
    const { normalizeLeadRecord } = require('../lib/leads-platform/schema');
    const lead = normalizeLeadRecord({
      leadId: 't1',
      address: '9 Dirt Ln',
      city: 'Dallas',
      state: 'TX',
      leadType: 'land',
      reviewStatus: 'approved',
      signalTags: ['Teardown'],
      assetClass: 'teardown',
      teardown: {
        promotedFromLeadType: 'distressed',
        promotedAt: '2026-07-15T00:00:00.000Z',
        demoEstimate: 9000,
        reason: 'operator'
      }
    });
    assert.equal(lead.assetClass, 'teardown');
    assert.equal(lead.teardown.demoEstimate, 9000);
  });
});
