const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  cacheControlForExt,
  CACHE_IMMUTABLE,
  CACHE_STATIC,
  CACHE_VERSIONED,
  CACHE_GEOJSON,
  CACHE_DATA_JSON,
  CACHE_NONE
} = require('../lib/static-cache');

test('logo SVG gets immutable long cache', () => {
  assert.equal(cacheControlForExt('.svg'), CACHE_IMMUTABLE);
});

test('PNG images get immutable long cache', () => {
  assert.equal(cacheControlForExt('.png'), CACHE_IMMUTABLE);
});

test('CSS and JS get day cache without version query', () => {
  assert.equal(cacheControlForExt('.css'), CACHE_STATIC);
  assert.equal(cacheControlForExt('.js'), CACHE_STATIC);
});

test('versioned CSS/JS get short revalidate cache', () => {
  assert.equal(cacheControlForExt('.css', '/css/bridge.css?v=60'), CACHE_VERSIONED);
  assert.equal(cacheControlForExt('.js', '/js/bridge.js?v=2'), CACHE_VERSIONED);
});

test('geojson gets long public cache', () => {
  assert.equal(cacheControlForExt('.geojson', '/data/geo/us-states.geojson'), CACHE_GEOJSON);
});

test('public /data JSON gets short revalidate cache', () => {
  assert.equal(
    cacheControlForExt('.json', '/data/coverage-map-bootstrap.json?v=17'),
    CACHE_DATA_JSON
  );
});

test('non-data JSON stays no-store', () => {
  assert.equal(cacheControlForExt('.json', '/api/something.json'), CACHE_NONE);
  assert.equal(cacheControlForExt('.json'), CACHE_NONE);
});

test('HTML gets no-store', () => {
  assert.equal(cacheControlForExt('.html'), CACHE_NONE);
});