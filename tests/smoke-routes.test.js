/**
 * Minimal smoke: DISTRESS_ROUTES + /api/health return 200 via handleRequest.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.VERCEL = '1';
const config = require('../lib/config');
const { handleRequest } = require('../server');

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

async function get(url) {
  const res = mockRes();
  await handleRequest(
    { method: 'GET', url, headers: { host: '127.0.0.1:3000' } },
    res
  );
  return res;
}

const SMOKE_ROUTES = [
  ...Object.keys(config.DISTRESS_ROUTES),
  '/api/health'
];

for (const route of SMOKE_ROUTES) {
  test(`smoke GET ${route} → 200`, async () => {
    const res = await get(route);
    assert.equal(res.statusCode, 200, `${route} expected 200, got ${res.statusCode}`);
  });
}

test('smoke includes /filter (Filter desk)', async () => {
  assert.ok(SMOKE_ROUTES.includes('/filter'), 'DISTRESS_ROUTES must include /filter');
  const res = await get('/filter');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'] || '', /text\/html/);
});

test('smoke /api/health reports version', async () => {
  const res = await get('/api/health');
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.version, '1.1.0');
});
