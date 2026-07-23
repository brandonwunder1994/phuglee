const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  pruneLoginAttempts,
  authRateLimitOk,
  MAX_KEYS
} = require('../lib/auth-rate-limit');

test('pruneLoginAttempts removes expired keys', () => {
  const map = new Map();
  const now = 1_000_000;
  map.set('a|u', { count: 1, resetAt: now - 1 });
  map.set('b|u', { count: 1, resetAt: now + 10_000 });
  pruneLoginAttempts(map, now);
  assert.equal(map.has('a|u'), false);
  assert.equal(map.has('b|u'), true);
});

test('authRateLimitOk allows first attempts and blocks after max', () => {
  const map = new Map();
  const now = Date.now();
  for (let i = 0; i < 20; i++) {
    assert.equal(authRateLimitOk(map, '1.2.3.4', 'admin', now), true);
  }
  assert.equal(authRateLimitOk(map, '1.2.3.4', 'admin', now), false);
});

test('MAX_KEYS is finite', () => {
  assert.ok(MAX_KEYS >= 100 && MAX_KEYS <= 50_000);
});
