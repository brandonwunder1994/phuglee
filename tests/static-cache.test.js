const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cacheControlForExt, CACHE_IMMUTABLE, CACHE_STATIC, CACHE_NONE } = require('../lib/static-cache');

test('logo SVG gets immutable long cache', () => {
  assert.equal(cacheControlForExt('.svg'), CACHE_IMMUTABLE);
});

test('PNG images get immutable long cache', () => {
  assert.equal(cacheControlForExt('.png'), CACHE_IMMUTABLE);
});

test('CSS and JS get day cache', () => {
  assert.equal(cacheControlForExt('.css'), CACHE_STATIC);
  assert.equal(cacheControlForExt('.js'), CACHE_STATIC);
});

test('HTML gets no-store', () => {
  assert.equal(cacheControlForExt('.html'), CACHE_NONE);
});