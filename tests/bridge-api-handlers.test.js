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
    bodyBuffer: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
      this.headersSent = true;
    },
    end(data) {
      if (Buffer.isBuffer(data)) {
        this.bodyBuffer = data;
        this.body = data.toString('utf8');
      } else {
        this.body = typeof data === 'string' ? data : data?.toString('utf8') || '';
        this.bodyBuffer = Buffer.from(this.body, 'utf8');
      }
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
  let json = {};
  const contentType = String(res.headers['Content-Type'] || res.headers['content-type'] || '');
  if (res.body && contentType.includes('json')) {
    json = JSON.parse(res.body);
  } else if (res.body && res.body.trim().startsWith('{')) {
    try { json = JSON.parse(res.body); } catch (_) {}
  }
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body,
    bodyBuffer: res.bodyBuffer,
    json
  };
}

let originalLoadIndex;
let indexModule;
let listRootOriginal;
let listRootTemp;
let config;
let originalFormatsRoot;
let tempFormatsRoot;

before(async () => {
  listRootTemp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bridge-lists-api-'));
  tempFormatsRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bridge-city-formats-api-'));

  indexModule = require('../lib/analyzer-import-index');
  originalLoadIndex = indexModule.loadImportAddressIndex;
  indexModule.loadImportAddressIndex = async () => ({
    loadedAt: Date.now(),
    addresses: new Set(),
    count: 0,
    sources: null
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
    '../lib/bridge-list-store',
    '../lib/bridge-api'
  ]) {
    delete require.cache[require.resolve(mod)];
  }
  config = require('../lib/config');
  listRootOriginal = config.FILTER_LISTS_ROOT;
  config.FILTER_LISTS_ROOT = listRootTemp;
  originalFormatsRoot = config.BRIDGE_CITY_FORMATS_ROOT;
  config.BRIDGE_CITY_FORMATS_ROOT = tempFormatsRoot;
  bridgeApi = require('../lib/bridge-api');
});

after(async () => {
  await new Promise((resolve) => mockForge.close(resolve));
  delete process.env.FORM_FORGE_HOST;
  delete process.env.FORM_FORGE_PORT;
  if (indexModule && originalLoadIndex) {
    indexModule.loadImportAddressIndex = originalLoadIndex;
  }
  if (config && listRootOriginal !== undefined) {
    config.FILTER_LISTS_ROOT = listRootOriginal;
  }
  if (config) {
    if (originalFormatsRoot === undefined) {
      delete config.BRIDGE_CITY_FORMATS_ROOT;
    } else {
      config.BRIDGE_CITY_FORMATS_ROOT = originalFormatsRoot;
    }
  }
  try {
    if (listRootTemp) fs.rmSync(listRootTemp, { recursive: true, force: true });
  } catch (_) {}
  try {
    if (tempFormatsRoot) fs.rmSync(tempFormatsRoot, { recursive: true, force: true });
  } catch (_) {}
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
  // Phase 52: first CV format needs admin Type confirm (+ persist fingerprint)
  const { body, contentType } = buildMultipart(
    {
      cityId: 'arizona-marana',
      uploadType: 'code_violation',
      confirmedTypeHeader: 'Violation Type'
    },
    { name: 'file', filename: 'violations.csv', data: csv }
  );
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: {
      'Content-Type': contentType,
      'x-phuglee-user': 'admin'
    },
    body
  });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.ok(json.stats.kept >= 1);
  assert.ok(Array.isArray(json.rows));
  assert.equal(json.analyzerPush, undefined);
});

test('POST /api/bridge/process returns 409 TYPE_COLUMN_CONFIRM_REQUIRED without confirm', async () => {
  // Headers differ from prior success fixture so fingerprint has no format memory match
  const csv = Buffer.from(
    'Site Address,Issue Type,Notes\n99 Unique Gate Rd,Weeds,tall grass\n',
    'utf8'
  );
  const { body, contentType } = buildMultipart(
    { cityId: 'arizona-marana', uploadType: 'code_violation' },
    { name: 'file', filename: 'need-confirm.csv', data: csv }
  );
  const { status, json } = await callBridge('POST', '/api/bridge/process', {
    headers: { 'Content-Type': contentType },
    body
  });
  assert.equal(status, 409);
  assert.equal(json.code, 'TYPE_COLUMN_CONFIRM_REQUIRED');
  assert.ok(json.formatFingerprint);
  assert.ok(Array.isArray(json.candidates));
  assert.ok(json.candidates.length >= 1);
  assert.ok('suggestedHeader' in json);
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

test('Filter lists CRUD + download without Analyze push', async () => {
  const empty = await callBridge('GET', '/api/bridge/lists', {
    headers: { 'x-phuglee-user': 'list-tester' }
  });
  assert.equal(empty.status, 200);
  assert.equal(empty.json.ok, true);
  assert.deepEqual(empty.json.lists, []);

  const created = await callBridge('POST', '/api/bridge/lists', {
    headers: {
      'content-type': 'application/json',
      'x-phuglee-user': 'list-tester'
    },
    body: Buffer.from(JSON.stringify({
      name: 'API Test List',
      cityName: 'Marana',
      state: 'Arizona',
      uploadType: 'code_violation',
      sourceFile: 'api-test.csv',
      rows: [
        {
          streetAddress: '100 Test Ave',
          city: 'Marana',
          state: 'Arizona',
          zip: '85704',
          distressedSignalTag: 'Standard Code Violation',
          confidenceLevel: 'high'
        }
      ]
    }))
  });
  assert.equal(created.status, 200);
  assert.equal(created.json.ok, true);
  assert.equal(created.json.list.name, 'API Test List');
  assert.equal(created.json.list.recordCount, 1);
  const listId = created.json.list.id;
  assert.ok(listId);

  const listed = await callBridge('GET', '/api/bridge/lists', {
    headers: { 'x-phuglee-user': 'list-tester' }
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.lists.length, 1);

  const renamed = await callBridge('PATCH', `/api/bridge/lists/${listId}`, {
    headers: {
      'content-type': 'application/json',
      'x-phuglee-user': 'list-tester'
    },
    body: Buffer.from(JSON.stringify({ name: 'Renamed API List' }))
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.list.name, 'Renamed API List');

  const download = await callBridge('GET', `/api/bridge/lists/${listId}/download?format=csv`, {
    headers: { 'x-phuglee-user': 'list-tester' }
  });
  assert.equal(download.status, 200);
  assert.match(String(download.headers['Content-Type'] || ''), /csv/i);
  assert.match(download.body, /Street Address/);
  assert.match(download.body, /100 Test Ave/);

  const afterDl = await callBridge('GET', `/api/bridge/lists/${listId}`, {
    headers: { 'x-phuglee-user': 'list-tester' }
  });
  assert.equal(afterDl.status, 200);
  assert.equal(afterDl.json.list.status, 'downloaded');

  const otherUser = await callBridge('GET', '/api/bridge/lists', {
    headers: { 'x-phuglee-user': 'someone-else' }
  });
  assert.equal(otherUser.status, 200);
  assert.equal(otherUser.json.lists.length, 0);

  const deleted = await callBridge('DELETE', `/api/bridge/lists/${listId}`, {
    headers: { 'x-phuglee-user': 'list-tester' }
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.ok, true);

  const gone = await callBridge('GET', `/api/bridge/lists/${listId}`, {
    headers: { 'x-phuglee-user': 'list-tester' }
  });
  assert.equal(gone.status, 404);
  assert.equal(gone.json.code, 'LIST_NOT_FOUND');
});

test('POST /api/bridge/lists rejects empty rows', async () => {
  const { status, json } = await callBridge('POST', '/api/bridge/lists', {
    headers: {
      'content-type': 'application/json',
      'x-phuglee-user': 'list-tester'
    },
    body: Buffer.from(JSON.stringify({ name: 'Nope', rows: [] }))
  });
  assert.equal(status, 400);
  assert.equal(json.code, 'MISSING_ROWS');
});

test('download-all and clear-all for saved lists', async () => {
  const headers = {
    'content-type': 'application/json',
    'x-phuglee-user': 'bulk-tester'
  };
  await callBridge('POST', '/api/bridge/lists', {
    headers,
    body: Buffer.from(JSON.stringify({
      name: 'Bulk A',
      cityName: 'Alpha',
      state: 'AZ',
      rows: [{ streetAddress: '10 Bulk', city: 'Alpha', state: 'AZ' }]
    }))
  });
  await callBridge('POST', '/api/bridge/lists', {
    headers,
    body: Buffer.from(JSON.stringify({
      name: 'Bulk B',
      cityName: 'Beta',
      state: 'TX',
      rows: [{ streetAddress: '20 Bulk', city: 'Beta', state: 'TX' }]
    }))
  });

  const all = await callBridge('GET', '/api/bridge/lists/download-all?format=csv', {
    headers: { 'x-phuglee-user': 'bulk-tester' }
  });
  assert.equal(all.status, 200);
  assert.match(String(all.headers['Content-Type'] || ''), /csv/i);
  assert.match(all.body, /Bulk A/);
  assert.match(all.body, /Bulk B/);
  assert.match(all.body, /10 Bulk/);

  const cleared = await callBridge('DELETE', '/api/bridge/lists', {
    headers: { 'x-phuglee-user': 'bulk-tester' }
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.ok, true);
  assert.ok(cleared.json.deleted >= 2);

  const empty = await callBridge('GET', '/api/bridge/lists', {
    headers: { 'x-phuglee-user': 'bulk-tester' }
  });
  assert.equal(empty.json.lists.length, 0);
});