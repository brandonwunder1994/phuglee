const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  classifyApiError,
  isHardQuotaError,
  isSoftRateLimitError,
  createUsageStore
} = require('../lib/api-usage');

describe('api-usage classification', () => {
  it('detects hard Gemini free-tier quota', () => {
    const msg = 'You exceeded your current quota, please check your plan and billing details.';
    assert.equal(isHardQuotaError(429, msg), true);
    assert.equal(classifyApiError(429, msg).kind, 'hard_quota');
    assert.equal(classifyApiError(429, msg).retryable, false);
  });

  it('treats soft rate limits as retryable', () => {
    const msg = 'Resource exhausted: rate limit exceeded, try again in 30s';
    // message has both - if "rate" and try again, soft
    assert.equal(isSoftRateLimitError(429, 'Too many requests, rate limit'), true);
    assert.equal(classifyApiError(503, 'high demand overloaded').kind, 'soft_rate_limit');
  });

  it('detects Maps billing / over query', () => {
    assert.equal(isHardQuotaError(403, 'OVER_QUERY_LIMIT'), true);
    assert.equal(isHardQuotaError(403, 'You must enable billing on this project'), true);
  });

  it('detects Gemini credit exhaustion / spend limit (stop scan, no uncategorized rows)', () => {
    assert.equal(isHardQuotaError(429, 'Out of credits on this project'), true);
    assert.equal(isHardQuotaError(403, 'Billing hard limit reached'), true);
    assert.equal(isHardQuotaError(429, 'CONSUMER_SUSPENDED: purchase additional quota'), true);
    assert.equal(isHardQuotaError(429, '[GEMINI] QUOTA/CREDITS EXHAUSTED — prepaid credit depleted'), true);
    assert.equal(classifyApiError(429, 'Out of credits').retryable, false);
  });

  it('keeps soft per-minute rate limits retryable (not a credit halt)', () => {
    assert.equal(isSoftRateLimitError(429, 'Too many requests, rate limit — try again in 20s'), true);
    assert.equal(isHardQuotaError(429, 'Too many requests, rate limit — try again in 20s'), false);
  });
});

describe('client scan hard-quota halt policy', () => {
  it('propagates hardQuota from Gemini/Maps fetchers and never Needs-Reviews billing fails', () => {
    const renderSrc = fs.readFileSync(path.join(__dirname, '../public/js/render.js'), 'utf8');
    assert.match(renderSrc, /throwHardQuotaIfNeeded/);
    assert.match(renderSrc, /QUOTA\/CREDITS EXHAUSTED/);
    assert.match(renderSrc, /err\.hardQuota\s*=\s*true/);

    const appSrc = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    assert.match(appSrc, /errorIsHardQuota/);
    assert.match(appSrc, /Never persist uncategorized/);

    const configSrc = fs.readFileSync(path.join(__dirname, '../public/js/config.js'), 'utf8');
    assert.match(configSrc, /errorIsHardQuota/);
    assert.match(configSrc, /st\.hardQuotaActive/);
    assert.match(configSrc, /out of credits/);
    assert.match(configSrc, /spend\.\?limit/);
    assert.match(configSrc, /consumer_/);
  });
});

describe('api-usage ledger', () => {
  it('records gemini + maps and estimates remaining', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pda-usage-'));
    const store = createUsageStore(dir);
    store.recordGemini({ ok: true, status: 200 });
    store.recordGemini({ ok: true, status: 200 });
    store.recordGemini({
      ok: false,
      status: 429,
      error: 'You exceeded your current quota'
    });
    store.recordMaps({ ok: true, kind: 'streetView', status: 200 });
    const snap = store.snapshot({
      geminiOk: 2,
      geminiFail: 1,
      mapsOk: 1,
      mapsFail: 0,
      streetViewOk: 1,
      streetViewFail: 0
    });
    assert.equal(snap.gemini.todayOk, 2);
    assert.equal(snap.gemini.todayHardQuota, 1);
    assert.equal(snap.hardQuotaActive, true);
    assert.equal(snap.maps.todayStreetViewOk, 1);
    assert.ok(snap.gemini.remainingTodayEst < snap.gemini.freeTierDailyLimitEst);
    assert.ok(snap.maps.remainingCreditUsdEst <= snap.maps.monthlyCreditUsdEst);
  });
});
