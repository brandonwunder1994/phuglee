const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.VERCEL = '1';

const fixtureDistressed = require('./fixtures/leads/sample-distressed.json');

let tmpRoot;
let compReportsRoot;
let prevCatalogRoot;
let prevCompReportsRoot;
let prevReapiKey;
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
      if (chunk) {
        this.body += Buffer.isBuffer(chunk) ? chunk : String(chunk);
      }
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
  if (body) headers['content-type'] = 'application/json';
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

async function callApi(url, method = 'GET', body = null) {
  const res = mockRes();
  await api.handle(
    maxReq(url, method, body),
    res,
    new URL(url, 'http://127.0.0.1').pathname,
    new URL(url, 'http://127.0.0.1')
  );
  return res;
}

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'comp-api-catalog-'));
  compReportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'comp-api-reports-'));
  prevCatalogRoot = process.env.LEADS_CATALOG_ROOT;
  prevCompReportsRoot = process.env.LEADS_COMP_REPORTS_ROOT;
  prevReapiKey = process.env.REALESTATE_API_KEY;
  process.env.LEADS_CATALOG_ROOT = tmpRoot;
  process.env.LEADS_COMP_REPORTS_ROOT = compReportsRoot;
  delete process.env.REALESTATE_API_KEY;
  delete require.cache[require.resolve('../lib/config')];
  delete require.cache[require.resolve('../lib/leads-platform/store')];
  delete require.cache[require.resolve('../lib/leads-platform/api')];
  store = require('../lib/leads-platform/store');
  api = require('../lib/leads-platform/api');
});

after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(compReportsRoot, { recursive: true, force: true });
  } catch (_) {}
  if (prevCatalogRoot === undefined) delete process.env.LEADS_CATALOG_ROOT;
  else process.env.LEADS_CATALOG_ROOT = prevCatalogRoot;
  if (prevCompReportsRoot === undefined) delete process.env.LEADS_COMP_REPORTS_ROOT;
  else process.env.LEADS_COMP_REPORTS_ROOT = prevCompReportsRoot;
  if (prevReapiKey === undefined) delete process.env.REALESTATE_API_KEY;
  else process.env.REALESTATE_API_KEY = prevReapiKey;
});

function txLead() {
  return {
    ...fixtureDistressed,
    leadId: 'tx-comp-lead',
    state: 'TX',
    city: 'Houston',
    address: '100 Main St',
    estARV: null,
    compedAt: null,
    comps: [],
    compingReport: null
  };
}

function ohLead() {
  return {
    ...fixtureDistressed,
    leadId: 'oh-comp-lead',
    state: 'OH',
    city: 'Columbus',
    address: '200 Oak Ave',
    estARV: null,
    compedAt: null,
    comps: [],
    compingReport: null
  };
}

const SAMPLE_COMPS = [
  { address: 'a', price: 270000, soldDate: '2026-01-01', sqft: 1400, beds: 3, baths: 2 },
  { address: 'b', price: 280000, soldDate: '2026-02-01', sqft: 1450, beds: 3, baths: 2 },
  { address: 'c', price: 275000, soldDate: '2026-03-01', sqft: 1420, beds: 3, baths: 2 }
];

async function attachPropelio(leadId) {
  const pdf = Buffer.from('%PDF-1.4 propelio-test');
  const uploadRes = await callApi(`/api/leads/${leadId}/comp/report-file`, 'POST', {
    contentBase64: pdf.toString('base64'),
    filename: 'Propelio Report.pdf',
    mime: 'application/pdf'
  });
  assert.equal(uploadRes.statusCode, 200);
  return JSON.parse(uploadRes.body);
}

test('POST /api/leads/:id/comp on TX lead returns needsManual without inventing ARV', async () => {
  const lead = txLead();
  store.upsertLead(lead);
  const res = await callApi('/api/leads/tx-comp-lead/comp', 'POST', {});
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.needsManual, true);
  assert.equal(body.lead, undefined);
  const saved = store.getLead('tx-comp-lead');
  assert.equal(saved.estARV, null);
  assert.equal(saved.compedAt, null);
});

test('POST /api/leads/:id/comp/manual without report file returns REPORT_FILE_REQUIRED', async () => {
  const lead = txLead();
  store.upsertLead(lead);
  const res = await callApi('/api/leads/tx-comp-lead/comp/manual', 'POST', {
    arv: 275000,
    comps: SAMPLE_COMPS,
    note: 'Propelio CMA'
  });
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'REPORT_FILE_REQUIRED');
  assert.equal(store.getLead('tx-comp-lead').estARV, null);
});

test('POST /api/leads/:id/comp/manual saves estARV after report upload', async () => {
  const lead = txLead();
  store.upsertLead(lead);
  await attachPropelio('tx-comp-lead');
  const res = await callApi('/api/leads/tx-comp-lead/comp/manual', 'POST', {
    arv: 275000,
    comps: SAMPLE_COMPS,
    note: 'Propelio CMA'
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.lead.estARV, 275000);
  assert.equal(body.lead.compSource, 'manual_propelio');
  assert.ok(body.lead.compedAt);
  assert.equal(body.report.arv, 275000);
  const saved = store.getLead('tx-comp-lead');
  assert.equal(saved.estARV, 275000);
  assert.ok(Array.isArray(saved.compReportFiles) && saved.compReportFiles.length >= 1);
});

test('POST /api/leads/:id/comp on comped lead without replace returns confirmReplace, ARV unchanged', async () => {
  const lead = txLead();
  store.upsertLead(lead);
  await attachPropelio('tx-comp-lead');
  const manualRes = await callApi('/api/leads/tx-comp-lead/comp/manual', 'POST', {
    arv: 275000,
    comps: SAMPLE_COMPS,
    note: 'Propelio CMA'
  });
  assert.equal(manualRes.statusCode, 200);
  const savedBefore = store.getLead('tx-comp-lead');
  assert.equal(savedBefore.estARV, 275000);
  assert.ok(savedBefore.compedAt);

  const res = await callApi('/api/leads/tx-comp-lead/comp', 'POST', {});
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.confirmReplace, true);
  assert.equal(body.needsManual, undefined);
  const savedAfter = store.getLead('tx-comp-lead');
  assert.equal(savedAfter.estARV, 275000);
  assert.equal(savedAfter.compedAt, savedBefore.compedAt);
});

test('POST /api/leads/:id/comp with replace:true on comped TX lead proceeds to needsManual', async () => {
  const lead = txLead();
  store.upsertLead(lead);
  await attachPropelio('tx-comp-lead');
  await callApi('/api/leads/tx-comp-lead/comp/manual', 'POST', {
    arv: 275000,
    comps: SAMPLE_COMPS,
    note: 'Propelio CMA'
  });

  const res = await callApi('/api/leads/tx-comp-lead/comp', 'POST', { replace: true });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.needsManual, true);
  assert.equal(body.confirmReplace, undefined);
  assert.equal(body.state, 'TX');
});

test('POST /api/leads/:id/comp/block-pass saves pass and kill', async () => {
  const lead = ohLead();
  store.upsertLead(lead);
  const passRes = await callApi('/api/leads/oh-comp-lead/comp/block-pass', 'POST', { pass: 'pass' });
  assert.equal(passRes.statusCode, 200);
  const passBody = JSON.parse(passRes.body);
  assert.equal(passBody.ok, true);
  assert.equal(passBody.compBlockPass, 'pass');
  assert.equal(store.getLead('oh-comp-lead').compBlockPass, 'pass');

  const killRes = await callApi('/api/leads/oh-comp-lead/comp/block-pass', 'POST', { pass: 'kill' });
  assert.equal(killRes.statusCode, 200);
  const killBody = JSON.parse(killRes.body);
  assert.equal(killBody.compBlockPass, 'kill');
  assert.equal(store.getLead('oh-comp-lead').compBlockPass, 'kill');

  const bad = await callApi('/api/leads/oh-comp-lead/comp/block-pass', 'POST', { pass: 'maybe' });
  assert.equal(bad.statusCode, 400);
});

test('POST /api/leads/:id/comp on OH lead without API key returns 503', async () => {
  const lead = ohLead();
  store.upsertLead(lead);
  const res = await callApi('/api/leads/oh-comp-lead/comp', 'POST', {});
  assert.equal(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.match(body.error, /REALESTATE_API_KEY/i);
});

test('POST report-file then GET download returns stored bytes', async () => {
  const lead = txLead();
  store.upsertLead(lead);
  const pdf = Buffer.from('%PDF-1.4 propelio-test');
  const uploadRes = await callApi('/api/leads/tx-comp-lead/comp/report-file', 'POST', {
    contentBase64: pdf.toString('base64'),
    filename: 'Propelio Report.pdf',
    mime: 'application/pdf'
  });
  assert.equal(uploadRes.statusCode, 200);
  const upload = JSON.parse(uploadRes.body);
  assert.equal(upload.ok, true);
  assert.ok(upload.file.id);
  assert.equal(upload.file.mime, 'application/pdf');

  const downloadRes = await callApi(
    `/api/leads/tx-comp-lead/comp/report-file/${upload.file.id}`,
    'GET'
  );
  assert.equal(downloadRes.statusCode, 200);
  assert.equal(downloadRes.headers['Content-Type'], 'application/pdf');
  assert.equal(downloadRes.body, pdf.toString());
});
