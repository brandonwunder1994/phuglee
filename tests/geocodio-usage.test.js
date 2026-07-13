const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  calendarDayInTz,
  loadUsage,
  recordLookups,
  markExhausted,
  remainingForKey,
  pickNextKey,
  getUsageForModal
} = require('../lib/geocodio-usage');

describe('geocodio-usage', () => {
  let tmp;
  const env = {
    GEOCODIO_API_KEYS: 'keyone111,keytwo222',
    GEOCODIO_API_ACCOUNTS: 'one@test.com,two@test.com',
    GEOCODIO_DAILY_LIMIT: '2500',
    GEOCODIO_USAGE_TZ: 'America/Phoenix'
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-usage-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  });

  it('calendarDayInTz returns YYYY-MM-DD', () => {
    const day = calendarDayInTz('UTC', new Date('2026-07-11T15:00:00Z'));
    assert.equal(day, '2026-07-11');
  });

  it('records lookups and reduces remaining', () => {
    const opts = { root: tmp, env };
    recordLookups('k0', 100, opts);
    assert.equal(remainingForKey('k0', opts), 2400);
    assert.equal(remainingForKey('k1', opts), 2500);
  });

  it('marks exhausted at daily limit', () => {
    const opts = { root: tmp, env };
    recordLookups('k0', 2500, opts);
    assert.equal(remainingForKey('k0', opts), 0);
    const picked = pickNextKey(opts);
    assert.equal(picked.id, 'k1');
  });

  it('markExhausted forces remaining to zero', () => {
    const opts = { root: tmp, env };
    recordLookups('k0', 10, opts);
    markExhausted('k0', 'Daily limit', opts);
    assert.equal(remainingForKey('k0', opts), 0);
  });

  it('getUsageForModal masks keys and includes totals', () => {
    const opts = { root: tmp, env };
    recordLookups('k0', 500, opts);
    const modal = getUsageForModal(opts);
    assert.equal(modal.accounts.length, 2);
    assert.equal(modal.accounts[0].apiKey, undefined);
    assert.equal(modal.accounts[0].apiKeyMasked, '••••e111');
    assert.equal(modal.accounts[0].remaining, 2000);
    assert.equal(modal.totalRemaining, 4500);
    assert.ok(modal.note);
  });

  it('rolls over on new day', () => {
    const opts = { root: tmp, env, now: new Date('2026-07-11T12:00:00Z') };
    recordLookups('k0', 900, opts);
    const nextDay = loadUsage({
      root: tmp,
      env,
      now: new Date('2026-07-12T12:00:00Z')
    });
    // day string changes → used reset
    assert.equal(nextDay.keys[0].used, 0);
  });
});
