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
let analyzerUsersRoot;
let config;
let schema;
let scoring;
let store;
let publish;
let api;
let handleRequest;

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

function maxReq(url, method = 'GET', body = null) {
  const headers = {
    host: '127.0.0.1:3000',
    cookie: '',
    'x-phuglee-user': 'alice',
    'x-phuglee-plan': 'max'
  };
  const req = {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(JSON.stringify(body));
    }
  };
  return req;
}

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-catalog-'));
  analyzerUsersRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'analyzer-users-'));
  const adminDir = path.join(analyzerUsersRoot, 'users', 'admin');
  fs.mkdirSync(adminDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'fixtures', 'analyzer', 'admin-session.json'),
    path.join(adminDir, 'distressAnalyzerSession_LATEST.json')
  );
  process.env.LEADS_CATALOG_ROOT = tmpRoot;
  process.env.PDA_DATA_ROOT = analyzerUsersRoot;
  delete require.cache[require.resolve('../lib/config')];
  config = require('../lib/config');
  schema = require('../lib/leads-platform/schema');
  scoring = require('../lib/leads-platform/scoring');
  store = require('../lib/leads-platform/store');
  publish = require('../lib/leads-platform/publish');
  api = require('../lib/leads-platform/api');
  ({ handleRequest } = require('../server'));
});

after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(analyzerUsersRoot, { recursive: true, force: true });
  } catch (_) {}
  delete process.env.LEADS_CATALOG_ROOT;
  delete process.env.PDA_DATA_ROOT;
});

test('validateLeadRecord accepts approved distressed lead', () => {
  const lead = schema.normalizeLeadRecord(fixtureDistressed);
  assert.equal(schema.validateLeadRecord(lead).ok, true);
});

test('validateLeadRecord rejects distressed without approval', () => {
  const lead = schema.normalizeLeadRecord({ ...fixtureDistressed, reviewStatus: 'pending' });
  assert.equal(schema.validateLeadRecord(lead).ok, false);
});

test('computePriorityScore returns 0-100', () => {
  const lead = schema.normalizeLeadRecord(fixtureDistressed);
  const score = scoring.computePriorityScore(lead);
  assert.ok(score >= 0 && score <= 100);
});

test('upsertLead and queryLeads filter by leadType', () => {
  store.upsertLead(fixtureDistressed);
  store.upsertLead(fixtureWM);
  store.upsertLead(fixtureLand);
  const distressed = store.queryLeads({ leadType: 'distressed' });
  assert.equal(distressed.total, 1);
  assert.equal(distressed.leads[0].leadType, 'distressed');
});

test('queryLeads stacks signals with AND logic', () => {
  const result = store.queryLeads({
    signals: ['pre-foreclosure', 'tax delinquent']
  });
  assert.equal(result.total, 1);
});

test('publishLead rejects unapproved distressed', () => {
  assert.throws(() => {
    publish.publishLead({ ...fixtureDistressed, reviewStatus: 'pending' });
  }, /distressed requires approval|INVALID_LEAD/);
});

test('GET /api/leads returns 403 for pro plan', async () => {
  const res = mockRes();
  await api.handle({
    method: 'GET',
    url: '/api/leads',
    headers: { 'x-phuglee-user': 'bob', 'x-phuglee-plan': 'pro' }
  }, res, '/api/leads', new URL('http://127.0.0.1/api/leads'));
  assert.equal(res.statusCode, 403);
});

test('GET /api/leads returns 200 for max plan', async () => {
  store.upsertLead(fixtureDistressed);
  const res = mockRes();
  await api.handle(maxReq('/api/leads'), res, '/api/leads', new URL('http://127.0.0.1/api/leads'));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.ok);
  assert.ok(body.total >= 1);
});

test('GET /api/leads/meta returns counts', async () => {
  const res = mockRes();
  await api.handle(maxReq('/api/leads/meta'), res, '/api/leads/meta', new URL('http://127.0.0.1/api/leads/meta'));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.meta.total >= 1);
});

test('server routes /api/leads through handleRequest', async () => {
  const res = mockRes();
  await handleRequest(maxReq('/api/leads/meta'), res);
  assert.equal(res.statusCode, 200);
});

test('GET /vault serves vault app shell', async () => {
  const res = mockRes();
  await handleRequest({ method: 'GET', url: '/vault', headers: { host: '127.0.0.1:3000' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /id="vault-app"/);
  assert.match(res.body, /The Vault/);
});

test('analyzer sync publishes manually reviewed tier leads', () => {
  const analyzerSync = require('../lib/leads-platform/analyzer-sync');
  const stats = analyzerSync.syncAnalyzerSessions({ force: true });

  assert.equal(stats.eligible, 3);
  assert.equal(stats.published, 3);
  const meta = store.getMeta();
  assert.ok(meta.byType.distressed >= 1);
  assert.ok(meta.byType.well_maintained >= 1);
  assert.ok(meta.byType.land >= 1);
  const distressed = store.queryLeads({ q: '901 Elm' });
  assert.equal(distressed.total, 1);
});

test('analyzer sync skips unreviewed distressed leads', () => {
  const {
    shouldPublishAnalyzerResult
  } = require('../lib/leads-platform/analyzer-sync');
  const pending = {
    address: '1 Test',
    street: '1 Test',
    city: 'A',
    state: 'TN',
    score: 8,
    leadTier: 'distressed',
    category: 'property',
    needsReviewLater: true
  };
  assert.equal(shouldPublishAnalyzerResult(pending), false);
});
