const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

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

for (const [route, file] of Object.entries(config.DISTRESS_ROUTES)) {
  test(`DISTRESS_ROUTES ${route} maps to existing public/${file}`, () => {
    const full = path.join(config.PUBLIC, file);
    assert.ok(fs.existsSync(full), `missing ${full}`);
  });
}

test('GET /vault serves vault.html', async () => {
  const res = mockRes();
  await handleRequest({ method: 'GET', url: '/vault', headers: { host: '127.0.0.1:3000' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'] || '', /text\/html/);
  assert.match(res.body, /MAX PLAN ONLY/);
  assert.match(res.body, /The Vault/);
});