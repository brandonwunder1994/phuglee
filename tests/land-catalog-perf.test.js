'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('land catalog load performance helpers', () => {
  let tmpRoot;
  let store;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'land-perf-'));
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    process.env.VERCEL = '1';
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/leads-platform/store')];
    store = require('../lib/leads-platform/store');
    for (let i = 0; i < 40; i++) {
      store.upsertLead({
        leadId: `land-perf-${i}`,
        address: `${i} Perf Ln`,
        city: i % 2 ? 'Austin' : 'Dallas',
        state: 'TX',
        leadType: 'land',
        reviewStatus: 'approved',
        signalTags: ['Vacant lot'],
        lat: 30 + i * 0.01,
        lng: -97 - i * 0.01
      });
    }
    for (let i = 0; i < 20; i++) {
      store.upsertLead({
        leadId: `home-perf-${i}`,
        address: `${i} Home St`,
        city: 'Austin',
        state: 'TX',
        leadType: 'distressed',
        reviewStatus: 'approved',
        signalTags: ['Tax']
      });
    }
  });

  after(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    delete process.env.LEADS_CATALOG_ROOT;
  });

  it('readIndexUpdatedAt does not re-parse after warm', () => {
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    store.invalidateIndexCache();
    const warm = store.warmCatalogIndex();
    assert.ok(warm.leads >= 60);
    const a = store.readIndexUpdatedAt();
    const b = store.readIndexUpdatedAt();
    assert.equal(a, b);
    assert.equal(store.readIndex().length, warm.leads);
  });

  it('land queryLeads skips facets by default via skipFacets', () => {
    process.env.LEADS_CATALOG_ROOT = tmpRoot;
    store.invalidateIndexCache();
    store.warmCatalogIndex();
    const withFacets = store.queryLeads({ surface: 'land', limit: 10 });
    assert.ok(Array.isArray(withFacets.statesFiltered));
    const skip = store.queryLeads({ surface: 'land', limit: 10, skipFacets: true });
    assert.equal(skip.statesFiltered, undefined);
    assert.equal(skip.total, withFacets.total);
    assert.ok(skip.leads.length <= 10);
  });
});
