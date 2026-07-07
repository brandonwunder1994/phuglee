const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeReviewedKeysByFilter,
  mergeSessionSave,
  countReviewedKeys
} = require('../lib/backup-logic');

describe('review persistence merge', () => {
  it('unions reviewed keys across filters instead of overwriting', () => {
    const merged = mergeReviewedKeysByFilter(
      { distressed: ['a', 'b'], vacant: [] },
      { distressed: ['b'], vacant: ['c', 'd'] }
    );
    assert.deepEqual(merged.distressed, ['a', 'b']);
    assert.deepEqual(merged.vacant, ['c', 'd']);
  });

  it('merges metadata-only save without wiping vacant bucket', () => {
    const existing = {
      savedAt: 100,
      processed: 2,
      results: [
        { email: 'a', phone: '1', address: '1 Main', category: 'vacant_lot', score: 0 },
        { email: 'b', phone: '2', address: '2 Oak', category: 'property', leadTier: 'distressed', score: 8 }
      ],
      reviewedKeysByFilter: {
        distressed: ['b|2|2 Oak'],
        vacant: []
      }
    };
    const incoming = {
      partialReviewSync: true,
      savedAt: 200,
      processed: 2,
      results: [],
      reviewedKeysByFilter: {
        distressed: [],
        vacant: ['a|1|1 Main', 'x|9|9 Pine']
      }
    };
    const merged = mergeSessionSave(existing, incoming);
    assert.equal(merged.results.length, 2);
    assert.deepEqual(merged.reviewedKeysByFilter.distressed, ['b|2|2 Oak']);
    assert.deepEqual(merged.reviewedKeysByFilter.vacant, ['a|1|1 Main', 'x|9|9 Pine']);
    assert.equal(countReviewedKeys(merged.reviewedKeysByFilter), 3);
  });

  it('preserves every review bucket when server total is higher', () => {
    const existing = {
      savedAt: 500,
      processed: 3,
      results: [
        { email: 'd', phone: '1', address: '1 Main', category: 'property', leadTier: 'distressed', score: 8 },
        { email: 'w', phone: '2', address: '2 Oak', category: 'property', leadTier: 'well_maintained', score: 1 },
        { email: 'l', phone: '3', address: '3 Field', category: 'vacant_lot', score: 0 }
      ],
      reviewedKeysByFilter: {
        distressed: ['d|1|1 Main', 'x|9|9 Pine'],
        well_maintained: [],
        vacant: [],
        review: [],
        low_confidence: ['y|8|8 Elm']
      }
    };
    const incoming = {
      partialReviewSync: true,
      savedAt: 400,
      processed: 3,
      results: [],
      reviewedKeysByFilter: {
        distressed: [],
        well_maintained: ['w|2|2 Oak'],
        vacant: ['l|3|3 Field'],
        review: ['n|4|4 Need'],
        low_confidence: []
      }
    };
    const merged = mergeSessionSave(existing, incoming);
    assert.deepEqual(merged.reviewedKeysByFilter.distressed, ['d|1|1 Main', 'x|9|9 Pine']);
    assert.deepEqual(merged.reviewedKeysByFilter.well_maintained, ['w|2|2 Oak']);
    assert.deepEqual(merged.reviewedKeysByFilter.vacant, ['l|3|3 Field']);
    assert.deepEqual(merged.reviewedKeysByFilter.review, ['n|4|4 Need']);
    assert.deepEqual(merged.reviewedKeysByFilter.low_confidence, ['y|8|8 Elm']);
  });

  it('merges partial result patches with reviewed keys', () => {
    const existing = {
      savedAt: 100,
      processed: 1,
      results: [
        { email: 'a', phone: '1', address: '1 Main', category: 'vacant_lot', score: 0 }
      ],
      reviewedKeysByFilter: { vacant: [] }
    };
    const incoming = {
      partialReviewSync: true,
      savedAt: 300,
      processed: 1,
      results: [
        {
          email: 'a', phone: '1', address: '1 Main',
          category: 'vacant_lot', score: 0,
          manuallyReviewed: true,
          manuallyReviewedVia: 'review_keep'
        }
      ],
      reviewedKeysByFilter: {
        vacant: ['a|1|1 Main']
      }
    };
    const merged = mergeSessionSave(existing, incoming);
    assert.equal(merged.results[0].manuallyReviewed, true);
    assert.deepEqual(merged.reviewedKeysByFilter.vacant, ['a|1|1 Main']);
  });
});