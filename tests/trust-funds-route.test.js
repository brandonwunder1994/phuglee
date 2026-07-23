const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const config = require('../lib/config');

test('config does not map /trust-funds to a separate trust-funds.html', () => {
  assert.equal(config.DISTRESS_ROUTES['/trust-funds'], undefined);
  assert.equal(config.DISTRESS_ROUTES['/buyers'], 'buyers.html');
});

test('server redirects /trust-funds to /buyers', () => {
  const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(src, /pathname\s*===\s*['"]\/trust-funds['"]/);
  assert.match(src, /Location:\s*['"]\/buyers['"]/);
});
