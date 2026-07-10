/**
 * Phase 55 Independence Lock (IND-01, IND-02, IND-03)
 *
 * Negative contracts: Filter process / save / Train write paths must never
 * re-wire Analyze push, require the deleted adapter, or invent Analyzer
 * session files under an isolated ANALYZER_DATA_ROOT.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'bridge');

const FILTER_WRITE_PATHS = [
  'lib/bridge-api.js',
  'lib/bridge-engine/index.js',
  'lib/bridge-list-store.js',
  'lib/bridge-brain-decisions.js',
  'lib/bridge-brain-apply.js',
  'lib/bridge-brain-store.js'
];

const FORBIDDEN = [
  'bridge-analyzer-push',
  'pushRowsToAnalyzer',
  'bridge-import-records'
];

const MOCK_CITIES = {
  items: [
    { id: 'arizona-marana', city: 'Marana', state: 'Arizona' },
    { id: 'nevada-reno', city: 'Reno', state: 'Nevada' }
  ]
};

function findAnalyzerSessionFiles(root) {
  if (!root || !fs.existsSync(root)) return [];
  const found = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (/^distressAnalyzerSession_.*\.json$/i.test(ent.name)) {
        found.push(full);
      }
    }
  }
  walk(root);
  return found;
}

// ── Static bans + module absence (IND-01 / IND-02) ──────────────────────────

for (const rel of FILTER_WRITE_PATHS) {
  test(`IND-01/02: ${rel} must not reference Analyze push strings`, () => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const banned of FORBIDDEN) {
      assert.equal(
        src.includes(banned),
        false,
        `${rel} must not contain "${banned}"`
      );
    }
  });
}

test('IND-02: lib/bridge-analyzer-push.js does not exist on disk', () => {
  assert.equal(
    fs.existsSync(path.join(ROOT, 'lib', 'bridge-analyzer-push.js')),
    false
  );
});

test('IND-02: bridge-analyzer-push module is not loadable (require.resolve throws)', () => {
  assert.throws(
    () => require.resolve('../lib/bridge-analyzer-push'),
    (err) => err && err.code === 'MODULE_NOT_FOUND'
  );
});

// ── Runtime process / save negatives (IND-01 / IND-03) ──────────────────────

function buildMultipart(fields, fileField) {
  const boundary = '----IndependenceTestBoundary';
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

let mockForge;
let mockPort;
let bridgeApi;
let config;
let indexModule;
let originalLoadIndex;

let listRootOriginal;
let listRootTemp;
let analyzerRootOriginal;
let analyzerRootTemp;
let formatsRootOriginal;
let formatsRootTemp;

before(async () => {
  listRootTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-ind-lists-'));
  analyzerRootTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-ind-analyzer-'));
  formatsRootTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-ind-formats-'));

  // Marker so we can detect accidental writes into the isolated analyzer root
  fs.writeFileSync(
    path.join(analyzerRootTemp, '.independence-marker'),
    'do-not-create-session-here',
    'utf8'
  );

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
        bridge_datasets: []
      }));
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
  analyzerRootOriginal = config.ANALYZER_DATA_ROOT;
  formatsRootOriginal = config.BRIDGE_CITY_FORMATS_ROOT;
  config.FILTER_LISTS_ROOT = listRootTemp;
  config.ANALYZER_DATA_ROOT = analyzerRootTemp;
  config.BRIDGE_CITY_FORMATS_ROOT = formatsRootTemp;

  bridgeApi = require('../lib/bridge-api');
});

after(async () => {
  await new Promise((resolve) => mockForge.close(resolve));
  delete process.env.FORM_FORGE_HOST;
  delete process.env.FORM_FORGE_PORT;

  if (indexModule && originalLoadIndex) {
    indexModule.loadImportAddressIndex = originalLoadIndex;
  }
  if (config) {
    if (listRootOriginal !== undefined) config.FILTER_LISTS_ROOT = listRootOriginal;
    if (analyzerRootOriginal !== undefined) config.ANALYZER_DATA_ROOT = analyzerRootOriginal;
    if (formatsRootOriginal === undefined) {
      delete config.BRIDGE_CITY_FORMATS_ROOT;
    } else {
      config.BRIDGE_CITY_FORMATS_ROOT = formatsRootOriginal;
    }
  }

  for (const dir of [listRootTemp, analyzerRootTemp, formatsRootTemp]) {
    try {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
});

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
    json
  };
}

test('IND-01/03: POST /api/bridge/process success never includes analyzerPush or invents session files', async () => {
  const beforeSessions = findAnalyzerSessionFiles(analyzerRootTemp);
  assert.equal(beforeSessions.length, 0, 'analyzer temp must start without session files');

  const csv = fs.readFileSync(path.join(FIXTURES, 'code-violations-varied.csv'));
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
  assert.ok(json.stats && json.stats.kept >= 1);
  assert.ok(Array.isArray(json.rows));

  // No push result shape on process success
  assert.equal(json.analyzerPush, undefined);
  assert.equal(json.analyzerPushResult, undefined);
  assert.equal(json.importBatchId, undefined);
  assert.equal(json.pushResult, undefined);
  assert.equal(json.bridgeImportRecords, undefined);

  const afterSessions = findAnalyzerSessionFiles(analyzerRootTemp);
  assert.equal(
    afterSessions.length,
    0,
    `process must not create Analyzer session files; found: ${afterSessions.join(', ')}`
  );

  // Marker still alone (no unexpected tree growth of session artifacts)
  assert.ok(
    fs.existsSync(path.join(analyzerRootTemp, '.independence-marker')),
    'isolated analyzer root marker must remain'
  );
});

test('IND-01/03: POST /api/bridge/lists save writes only under FILTER_LISTS_ROOT, no Analyzer sessions', async () => {
  const beforeSessions = findAnalyzerSessionFiles(analyzerRootTemp);
  assert.equal(beforeSessions.length, 0);

  const { status, json } = await callBridge('POST', '/api/bridge/lists', {
    headers: {
      'content-type': 'application/json',
      'x-phuglee-user': 'ind-list-tester'
    },
    body: Buffer.from(JSON.stringify({
      name: 'Independence Save List',
      cityName: 'Marana',
      state: 'Arizona',
      uploadType: 'code_violation',
      sourceFile: 'ind-test.csv',
      rows: [
        {
          streetAddress: '200 Independence Ave',
          city: 'Marana',
          state: 'Arizona',
          zip: '85704',
          distressedSignalTag: 'Standard Code Violation',
          confidenceLevel: 'high'
        }
      ]
    }))
  });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.list.name, 'Independence Save List');
  assert.equal(json.list.recordCount, 1);
  assert.ok(json.list.id);

  // List JSON lives under isolated FILTER_LISTS_ROOT only
  const listId = json.list.id;
  const scopeEntries = fs.readdirSync(listRootTemp);
  assert.ok(scopeEntries.length >= 1, 'save must create scope dir under filter-lists temp');

  let foundListMeta = false;
  function walkLists(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walkLists(full);
      else if (ent.name === 'meta.json' && full.includes(listId)) {
        foundListMeta = true;
      }
    }
  }
  walkLists(listRootTemp);
  assert.equal(foundListMeta, true, `list meta for ${listId} must exist under FILTER_LISTS_ROOT temp`);

  // No Analyze session side effects
  const afterSessions = findAnalyzerSessionFiles(analyzerRootTemp);
  assert.equal(
    afterSessions.length,
    0,
    `list save must not create Analyzer session files; found: ${afterSessions.join(', ')}`
  );

  // Response must not invent push fields
  assert.equal(json.analyzerPush, undefined);
  assert.equal(json.importBatchId, undefined);
});
