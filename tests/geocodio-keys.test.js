const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadGeocodioKeys,
  fingerprint,
  hasGeocodioKeys
} = require('../lib/geocodio-keys');

describe('geocodio-keys', () => {
  it('parses comma-separated keys and accounts', () => {
    const env = {
      GEOCODIO_API_KEYS: 'keyaaa,keybbb',
      GEOCODIO_API_ACCOUNTS: 'a@x.com,b@y.com',
      GEOCODIO_DAILY_LIMIT: '2500',
      GEOCODIO_USAGE_TZ: 'America/Phoenix'
    };
    const { keys, dailyLimit, timezone } = loadGeocodioKeys(env);
    assert.equal(keys.length, 2);
    assert.equal(keys[0].key, 'keyaaa');
    assert.equal(keys[0].email, 'a@x.com');
    assert.equal(keys[1].email, 'b@y.com');
    assert.equal(dailyLimit, 2500);
    assert.equal(timezone, 'America/Phoenix');
    assert.equal(fingerprint('abcdefgh'), '…efgh');
  });

  it('hasGeocodioKeys is false when empty', () => {
    assert.equal(hasGeocodioKeys({}), false);
    assert.equal(hasGeocodioKeys({ GEOCODIO_API_KEYS: 'abc' }), true);
  });
});
