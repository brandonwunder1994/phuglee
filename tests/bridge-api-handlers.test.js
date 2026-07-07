const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

const FIXTURES = path.join(__dirname, 'fixtures', 'bridge');
const MOCK_CITIES = {
  items: [
    { id: 'arizona-marana', city: 'Marana', state: 'Arizona' },
    { id: 'nevada-reno', city: 'Reno', state: 'Nevada' }
  ]
};

let mockForge;
let mockPort;
let bridgeApi;

function buildMultipart(fields, fileField) {
  const boundary = '----BridgeTestBoundary';
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="${name}"\r\n\r\n`,
      `${value}\r\n`
    );
  }
  if (fileField) {
    parts.push(
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\n`,
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const header = Buffer.from(parts.join(''), 'utf8');
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    return {
      body: Buffer.concat([header, fileField.data, footer]),
      contentType: `multipart/form-data; boundary=${boundary}`
    };
  }
  parts.push(`--${boundary}--\r\n`);
  return {
    body: Buffer.from(parts.join(''), 'utf8'),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function createMockReq({ method = 'GET', url = '/', headers = {}, body = null }) {
  const { Readable } = require('stream');
  const req = new Readable({ read() {} });
  req.method = method;
  req.url = url;
  req.headers = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  if (body) {
    queueMicrotask(() => {
      req.push(body);
      req.push(null);
    });
  }
  return req;
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(data) {
      this.body = typeof data === 'string' ? data : data?.toString('utf8') || '';
    },
    headersSent: false
  };
}

async function callBridge(method, pathname, { headers = {}, body = null } = {}) {
  const url = new URL(`http://127.0.0.1${pathname}`);
  const req = createMockReq({ method, url: url.pathname + url.search, headers, body });
  const res = createMockRes();
  const handled = await bridgeApi.handle(req, res, url.pathname, url);
  assert.equal(handled, true);
  return {
    status: res.statusCode,
    json: res.body ? JSON.parse(res.body) : {}
  };
}

let originalLoadIndex;
let originalPush;
let indexModule;
let pushModule;

before(async () => {
  indexModule = require('../lib/analyzer-import-index');
  originalLoadIndex = indexModule.loadImportAddressIndex;
  indexModule.loadImportAddressIndex = async () => ({
    loadedAt: Date.now(),
    addresses: new Set(),
    count: 0,
    sources: null
  });

  pushModule = require('../lib/bridge-analyzer-push');
  originalPush = pushModule.pushRowsToAnalyzer;
  pushModule.pushRowsToAnalyzer = async () => ({
    ok: true,
    added: 0,
    skipped: 0,
    totalRecords: 0,
    mode: 'test'
  });

  mockForge = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'form-forge-mock' }));
      return;
    }
    if (url.pathname === '/api/portal/cities/summary') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(MOCK_CITIES));
      return;
    }
    if (url.pathname === '/api/portal/city/arizona-marana') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'arizona-marana',
        city: 'Marana',
        state: 'Arizona',
        bridge_datasets: [{
          id: 'v1',
          upload_type: 'code_violation',
          upload_type_label: 'Code Violation',
          original_filename: 'old.csv',
          attached_at: '2026-07-01T12:00:00+00:00',
          kept_count: 10,
          csv_path: 'data/bridge-datasets/Arizona/arizona-marana/old.csv',
          xlsx_path: ''
        }]
      }));
      return;
    }
    if (url.pathname === '/api/portal/city/unknown-city') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    if (url.pathname === '/api/portal/city/arizona-marana/bridge/attach' && req.method === 'POST') {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const body = JSON.parse(raw);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          version: {
            id: '20260706-test-arizona-marana',
            upload_type: body.uploadType,
            original_filename: body.originalFilename,
            response_received_at: body.responseReceivedAt,
            kept_count: body.rows.length,
            csv_path: 'data/bridge-datasets/Arizona/arizona-marana/test.csv',
            xlsx_path: 'data/bridge-datasets/Arizona/arizona-marana/test.xlsx',
            turnaround_days: 5
          },
          event: { turnaround_days: 5 }
        }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => {
    mockForge.listen(0, '127.0.0.1', () => {
      mockPort = mockForge.address().port;
      resolve();
    });
  });

  process.env.FORM_FORGE_HOST = '127.0.0.1';
  process.env.FORM_FORGE_PORT = String(mockPort);
  for (const mod of [
    '../lib/config',
    '../lib/bridge-engine',
    '../lib/bridge-api'
  ]) {
    delete require.cache[require.resolve(mod)];
  }
  bridgeApi = require('../lib/bridge-api');
});

after(async () => {
  await new Promise((resolve) => mockForge.close(resolve));
  delete process.env.FORM_FORGE_HOST;
  delete process.env.FORM_FORGE_PORT;
  if (indexModule && originalLoadIndex) {
    indexModule.loadImportAddressIndex = originalLoadIndex;
  }
  if (pushModule && originalPush) {
    pushModule.pushRowsToAnalyzer = originalPush;
  }
});

test('GET /api/bridge/states returns aggregated states', async () => {
  const { status, json } = await callBridge('GET', '/api/bridge/states');
  assert.equal(status, 200);
  assert.equal(json.states.length, 2);
  const az = json.states.find((s) => s.code === 'Arizona');
  assert.equal(az.cityCount, 1);
});

test('GET /api/bridge/cities requires state param', async () => {
  const { status, json } = await callBridge('GET', '/api/bridge/cities');
  assert.equal(status, 400);
  assert.equal(json.code, 'MISSING_STATE');
});

test('GET /api/bridge/cities returns sorted cities for valid state', async () => {
  const { status, json } = await callBridge('GET', '/api/bridge/cities?state=Arizona');
  assert.equal(status, 200);
  assert.equal(json.cities.length, 1);
  assert.equal(json.cities[0].city, 'Marana');
});

test('GET /api/bridge/cities rejects unknown state', async () => {
  const { status, json } = await callBridge('GET', '/api/bridge/cities?state=Ohio');
  assert.equal(status, 400);
  assert.equal(json.code, 'UNKNOWN_STATE');
});

test('POST /api/bridge/process rejects non-multipart', async () => {
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: { 'Content-Type': 'application/json' },
    body: Buffer.from('{}')
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'INVALID_CONTENT_TYPE');
});

test('POST /api/bridge/process rejects missing cityId', async () => {
  const { body, contentType } = buildMultipart({ uploadType: 'code_violation' }, {
    name: 'file',
    filename: 'test.csv',
    data: Buffer.from('Property Address\n123 Main St\n')
  });
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: { 'Content-Type': contentType },
    body
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'MISSING_CITY');
});

test('POST /api/bridge/process rejects invalid upload type', async () => {
  const { body, contentType } = buildMultipart(
    { cityId: 'arizona-marana', uploadType: 'probate' },
    { name: 'file', filename: 'test.csv', data: Buffer.from('a\n1\n') }
  );
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: { 'Content-Type': contentType },
    body
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'INVALID_UPLOAD_TYPE');
});

test('POST /api/bridge/process rejects unsupported .zip file', async () => {
  const { body, contentType } = buildMultipart(
    { cityId: 'arizona-marana', uploadType: 'code_violation' },
    { name: 'file', filename: 'archive.zip', data: Buffer.from('PK') }
  );
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: { 'Content-Type': contentType },
    body
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'UNSUPPORTED_FILE');
});

test('POST /api/bridge/process rejects legacy .doc file', async () => {
  const { body, contentType } = buildMultipart(
    { cityId: 'arizona-marana', uploadType: 'code_violation' },
    { name: 'file', filename: 'list.doc', data: Buffer.from('legacy doc') }
  );
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: { 'Content-Type': contentType },
    body
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'UNSUPPORTED_FILE');
});

test('POST /api/bridge/process rejects empty file', async () => {
  const { body, contentType } = buildMultipart(
    { cityId: 'arizona-marana', uploadType: 'code_violation' },
    { name: 'file', filename: 'empty.csv', data: Buffer.alloc(0) }
  );
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: { 'Content-Type': contentType },
    body
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'EMPTY_FILE');
});

test('POST /api/bridge/process returns 404 for unknown city', async () => {
  const { body, contentType } = buildMultipart(
    { cityId: 'unknown-city', uploadType: 'code_violation' },
    { name: 'file', filename: 'test.csv', data: Buffer.from('Property Address\n123 Main St\n') }
  );
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: { 'Content-Type': contentType },
    body
  });
  assert.equal(status, 404);
  assert.equal(json.code, 'CITY_NOT_FOUND');
});

test('POST /api/bridge/process succeeds with valid CSV fixture', async () => {
  const csv = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
  const { body, contentType } = buildMultipart(
    { cityId: 'arizona-marana', uploadType: 'code_violation' },
    { name: 'file', filename: 'violations.csv', data: csv }
  );
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: { 'Content-Type': contentType },
    body
  });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.ok(json.stats.kept >= 1);
  assert.ok(Array.isArray(json.rows));
  assert.ok(json.analyzerPush);
});

test('POST /api/bridge/attach rejects invalid JSON', async () => {
  const { status, json } = await callBridge('POST', '/api/bridge/attach', {
    headers: { 'Content-Type': 'application/json' },
    body: Buffer.from('{not json')
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'INVALID_JSON');
});

test('POST /api/bridge/attach rejects missing responseReceivedAt', async () => {
  const { status, json } = await callBridge('POST', '/api/bridge/attach', {
    headers: { 'Content-Type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      cityId: 'arizona-marana',
      uploadType: 'code_violation',
      originalFilename: 'test.csv',
      rows: [{ streetAddress: '123 Main St' }]
    }))
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'INVALID_RESPONSE_AT');
});

test('POST /api/bridge/attach succeeds with valid payload', async () => {
  const { status, json } = await callBridge('POST', '/api/bridge/attach', {
    headers: { 'Content-Type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      cityId: 'arizona-marana',
      uploadType: 'code_violation',
      responseReceivedAt: '2026-07-04T09:42:00.000-07:00',
      originalFilename: 'violations.csv',
      stats: { kept: 2, discarded: 0 },
      rows: [
        { streetAddress: '123 Main St', city: 'Marana', state: 'Arizona' },
        { streetAddress: '456 Oak Ave', city: 'Marana', state: 'Arizona' }
      ]
    }))
  });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.match(json.version.csv_download_url, /^\/forge\/api\/file\//);
  assert.equal(json.turnaroundDays, 5);
});

test('GET /api/bridge/history returns datasets with download URLs', async () => {
  const { status, json } = await callBridge('GET', '/api/bridge/history/arizona-marana');
  assert.equal(status, 200);
  assert.equal(json.cityId, 'arizona-marana');
  assert.equal(json.history.length, 1);
  assert.match(json.history[0].csv_download_url, /^\/forge\/api\/file\//);
});

test('GET /api/bridge/history returns 404 for unknown city', async () => {
  const { status, json } = await callBridge('GET', '/api/bridge/history/unknown-city');
  assert.equal(status, 404);
  assert.equal(json.code, 'CITY_NOT_FOUND');
});