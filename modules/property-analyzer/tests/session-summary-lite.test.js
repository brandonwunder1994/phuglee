'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const createBackups = require('../lib/backups');
const config = require('../lib/config');

describe('session summary lite', () => {
  it('lite summary omits heavy review and brain payloads', () => {
    const backups = createBackups({
      config,
      fs,
      path,
      crypto,
      getSafety: () => null
    });
    const session = {
      results: [{ score: 1, tier: 'distressed', address: '1 Main' }],
      records: [],
      processed: 1,
      savedAt: Date.now(),
      reviewedKeysByFilter: { distressed: ['a|1|1 Main'], well_maintained: [], vacant: [], review: [], low_confidence: [] },
      reviewProgressByFilter: { distressed: { index: 1 } },
      learnedRules: [{ id: 'r1' }],
      correctionEvents: [{ id: 'c1' }]
    };
    const full = backups.buildSessionSummary(session);
    const lite = backups.buildSessionSummary(session, { lite: true });
    const meta = backups.buildSessionReviewMeta(session);

    assert.ok(JSON.stringify(full).length > JSON.stringify(lite).length);
    assert.equal(lite.lite, true);
    assert.deepEqual(lite.reviewedKeysByFilter.distressed, []);
    assert.deepEqual(lite.reviewProgressByFilter, {});
    assert.equal(lite.learnedRules, undefined);
    assert.deepEqual(meta.reviewedKeysByFilter.distressed, ['a|1|1 Main']);
    assert.ok(Array.isArray(meta.learnedRules));
  });

  it('caches lite and full summary bodies separately', () => {
    const backups = createBackups({
      config,
      fs,
      path,
      crypto,
      getSafety: () => null
    });
    const session = {
      results: [{ score: 1, tier: 'distressed', address: '2 Oak' }],
      records: [],
      processed: 1,
      savedAt: 12345
    };
    const lite1 = backups.getSessionSummaryResponseBody(session, { lite: true });
    const lite2 = backups.getSessionSummaryResponseBody(session, { lite: true });
    const full1 = backups.getSessionSummaryResponseBody(session, { lite: false });
    assert.equal(lite1, lite2);
    assert.notEqual(lite1, full1);
    assert.equal(JSON.parse(lite1).lite, true);
  });
});