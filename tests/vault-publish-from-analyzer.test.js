'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.VERCEL = '1';

let tmpRoot;
let api;

function mockRes() {
  return {
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
}

function adminReq(url, method = 'GET', body = null) {
  return {
    method,
    url,
    headers: {
      host: '127.0.0.1:3000',
      'x-phuglee-user': 'admin',
      'x-phuglee-plan': 'max'
    },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(JSON.stringify(body));
    }
  };
}

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-publish-'));
  process.env.LEADS_CATALOG_ROOT = tmpRoot;
  delete require.cache[require.resolve('../lib/config')];
  delete require.cache[require.resolve('../lib/leads-platform/schema')];
  delete require.cache[require.resolve('../lib/leads-platform/store')];
  delete require.cache[require.resolve('../lib/leads-platform/analyzer-sync')];
  delete require.cache[require.resolve('../lib/leads-platform/api')];
  api = require('../lib/leads-platform/api');
});

after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  delete process.env.LEADS_CATALOG_ROOT;
});

test('publish-from-analyzer accepts JSON body (no double-parse)', async () => {
  const res = mockRes();
  const body = {
    result: {
      email: 'a@t.com',
      phone: '1',
      address: '1 Main St, Austin, TX 78701',
      leadTier: 'distressed',
      category: 'property',
      score: 8,
      manuallyReviewed: true,
      reviewResolved: true
    },
    storageKey: 'admin'
  };
  await api.handle(
    adminReq('/api/leads/publish-from-analyzer', 'POST', body),
    res,
    '/api/leads/publish-from-analyzer',
    new URL('http://127.0.0.1/api/leads/publish-from-analyzer')
  );
  const parsed = JSON.parse(res.body || '{}');
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.published, true);
  assert.ok(parsed.leadId);
  assert.match(parsed.lead?.city || '', /Austin/i);
  assert.equal(parsed.lead?.state, 'TX');
});
