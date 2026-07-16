const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.VERCEL = '1';

const fixtureDistressed = require('./fixtures/leads/sample-distressed.json');
const fixtureWM = require('./fixtures/leads/sample-well-maintained.json');
const fixtureLand = require('./fixtures/leads/sample-land.json');

let tmpRoot;
let store;
let api;

function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    }
  };
  return res;
}

function maxReq(url) {
  return {
    method: 'GET',
    url,
    headers: {
      host: '127.0.0.1:3000',
      cookie: '',
      'x-phuglee-user': 'alice',
      'x-phuglee-plan': 'max'
    },
    async *[Symbol.asyncIterator]() {}
  };
}

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-surface-'));
  process.env.LEADS_CATALOG_ROOT = tmpRoot;
  delete require.cache[require.resolve('../lib/config')];
  delete require.cache[require.resolve('../lib/leads-platform/store')];
  delete require.cache[require.resolve('../lib/leads-platform/api')];
  store = require('../lib/leads-platform/store');
  api = require('../lib/leads-platform/api');
  store.upsertLead(fixtureDistressed);
  store.upsertLead(fixtureWM);
  store.upsertLead(fixtureLand);
});

after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_) {}
  delete process.env.LEADS_CATALOG_ROOT;
});

test('home surface excludes land from queryLeads all', () => {
  const home = store.queryLeads({ leadType: 'all', surface: 'home' });
  assert.ok(home.total >= 2);
  assert.ok(home.leads.every((l) => l.leadType !== 'land'));
  assert.equal(home.byTypeFiltered.land || 0, 0);
  assert.ok(home.byTypeFiltered.all >= 2);
});

test('land surface returns only land', () => {
  const land = store.queryLeads({ leadType: 'all', surface: 'land' });
  assert.ok(land.total >= 1);
  assert.ok(land.leads.every((l) => l.leadType === 'land'));
  assert.equal(land.byTypeFiltered.distressed || 0, 0);
  assert.ok(land.byTypeFiltered.land >= 1);
});

test('home meta total does not count land', () => {
  const meta = store.getMeta({ surface: 'home' });
  assert.equal(meta.byType.land || 0, 0);
  assert.ok(meta.byType.distressed >= 1);
  assert.ok(meta.byType.well_maintained >= 1);
  assert.equal(
    meta.total,
    (meta.byType.distressed || 0) + (meta.byType.well_maintained || 0)
  );
});

test('land meta counts only land', () => {
  const meta = store.getMeta({ surface: 'land' });
  assert.ok(meta.byType.land >= 1);
  assert.equal(meta.byType.distressed || 0, 0);
  assert.equal(meta.total, meta.byType.land);
});

test('surface=all keeps legacy behavior including land', () => {
  const all = store.queryLeads({ leadType: 'all', surface: 'all' });
  assert.ok(all.leads.some((l) => l.leadType === 'land'));
  const meta = store.getMeta({ surface: 'all' });
  assert.ok(meta.byType.land >= 1);
});

test('GET /api/leads?surface=home excludes land', async () => {
  const res = mockRes();
  const url = new URL('http://127.0.0.1/api/leads?surface=home&limit=50');
  await api.handle(maxReq(url.pathname + url.search), res, '/api/leads', url);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.ok);
  assert.ok((body.leads || []).every((l) => l.leadType !== 'land'));
});

test('GET /api/leads?surface=land returns only land', async () => {
  const res = mockRes();
  const url = new URL('http://127.0.0.1/api/leads?surface=land&limit=50');
  await api.handle(maxReq(url.pathname + url.search), res, '/api/leads', url);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.ok);
  assert.ok(body.total >= 1);
  assert.ok((body.leads || []).every((l) => l.leadType === 'land'));
});

test('GET /api/leads/meta?surface=home omits land from byType', async () => {
  const res = mockRes();
  const url = new URL('http://127.0.0.1/api/leads/meta?surface=home');
  await api.handle(maxReq(url.pathname + url.search), res, '/api/leads/meta', url);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.meta.byType.land || 0, 0);
});
