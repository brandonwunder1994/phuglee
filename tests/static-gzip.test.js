const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clientAcceptsGzip, gzippableExt } = require('../lib/static-gzip');

test('clientAcceptsGzip detects gzip token', () => {
  assert.equal(clientAcceptsGzip('gzip, deflate, br'), true);
  assert.equal(clientAcceptsGzip('identity'), false);
  assert.equal(clientAcceptsGzip(''), false);
});

test('gzippableExt allows text assets only', () => {
  assert.equal(gzippableExt('.js'), true);
  assert.equal(gzippableExt('.css'), true);
  assert.equal(gzippableExt('.json'), true);
  assert.equal(gzippableExt('.geojson'), true);
  assert.equal(gzippableExt('.mp4'), false);
  assert.equal(gzippableExt('.png'), false);
});
