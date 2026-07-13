'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  leanResultForList,
  leanResultsForList,
  profilePayloadFromResult
} = require('../lib/result-lean');
const {
  mergeSessionSave,
  preserveProfileFromPrevious
} = require('../lib/backup-logic');

describe('result-lean', () => {
  it('strips nested profile and marks profileDeferred', () => {
    const full = {
      address: '1 Main St',
      email: 'a@test.com',
      phone: '1',
      leadTier: 'distressed',
      score: 9,
      reason: 'Boarded windows',
      marketValue: 120000,
      profile: {
        beds: 3,
        phones: [{ number: '555-1212' }],
        flags: { absenteeOwner: true }
      }
    };
    const lean = leanResultForList(full);
    assert.equal(lean.profile, undefined);
    assert.equal(lean.profileDeferred, true);
    assert.equal(lean.leadTier, 'distressed');
    assert.equal(lean.reason, 'Boarded windows');
    assert.equal(lean.marketValue, 120000);
    // Original untouched
    assert.ok(full.profile.beds === 3);
  });

  it('leaves results without profile unchanged (no deferred flag)', () => {
    const row = { address: '2 Oak', leadTier: 'well_maintained', score: 2 };
    const lean = leanResultForList(row);
    assert.equal(lean.profileDeferred, undefined);
    assert.equal(lean.leadTier, 'well_maintained');
  });

  it('profilePayloadFromResult returns nested profile', () => {
    const payload = profilePayloadFromResult({
      marketValue: 99,
      profile: { beds: 4, avm: 100 }
    });
    assert.equal(payload.profile.beds, 4);
    assert.equal(payload.marketValue, 99);
  });

  it('leanResultsForList maps arrays', () => {
    const out = leanResultsForList([
      { address: 'a', profile: { beds: 1 } },
      { address: 'b' }
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].profileDeferred, true);
    assert.equal(out[1].profileDeferred, undefined);
  });
});

describe('merge preserves profiles when client is lean', () => {
  it('preserveProfileFromPrevious keeps server profile', () => {
    const prev = {
      address: '1 Main',
      email: 'a@t.com',
      phone: '1',
      profile: { beds: 3, phones: [{ number: '555' }] },
      marketValue: 200000
    };
    const lean = {
      address: '1 Main',
      email: 'a@t.com',
      phone: '1',
      leadTier: 'distressed',
      score: 8,
      profileDeferred: true,
      analyzedAt: Date.now()
    };
    const merged = preserveProfileFromPrevious(prev, lean);
    assert.equal(merged.profile.beds, 3);
    assert.equal(merged.marketValue, 200000);
    assert.equal(merged.leadTier, 'distressed');
    assert.equal(merged.profileDeferred, undefined);
  });

  it('mergeSessionSave does not wipe profiles when incoming is lean and longer', () => {
    const existing = {
      results: [
        {
          email: 'a@t.com', phone: '1', address: '1 Main',
          leadTier: 'well_maintained', score: 2,
          profile: { beds: 3, county: 'Travis' },
          marketValue: 150000
        }
      ],
      processed: 1,
      savedAt: 1
    };
    const incoming = {
      results: [
        {
          email: 'a@t.com', phone: '1', address: '1 Main',
          leadTier: 'distressed', score: 9,
          profileDeferred: true,
          analyzedAt: Date.now()
        },
        {
          email: 'b@t.com', phone: '2', address: '2 Oak',
          leadTier: 'distressed', score: 8,
          analyzedAt: Date.now()
        }
      ],
      processed: 2,
      savedAt: Date.now()
    };
    const merged = mergeSessionSave(existing, incoming);
    assert.equal(merged.results.length, 2);
    assert.ok(merged.results[0].profile, 'profile must survive lean client save');
    assert.equal(merged.results[0].profile.beds, 3);
    assert.equal(merged.results[0].marketValue, 150000);
    assert.equal(merged.results[0].leadTier, 'distressed');
  });
});
