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
  process.env.LEADS_CATALOG_ROOT = tmpRoot;
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
  } catch (_) {}
  delete process.env.LEADS_CATALOG_ROOT;
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
