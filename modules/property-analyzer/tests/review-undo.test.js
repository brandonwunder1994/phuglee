'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Mirrors applyReviewUndoSnapshot stamp-clearing rules from session.js
 * so Keep→Undo cannot leave reviewResolved/manuallyReviewed stuck true.
 */
function applyReviewUndoSnapshot(record, snapshot) {
  const snap = snapshot || {};
  const CLEAR_IF_ABSENT = [
    'manualScore', 'tierLocked', 'manualOverride', 'autoWellMaintained',
    'manualEditedAt', 'tierRationale', 'aiScore'
  ];
  const merged = { ...record, ...snap };
  for (const k of CLEAR_IF_ABSENT) {
    if (!(k in snap)) delete merged[k];
  }
  if (!snap.manuallyReviewed) {
    delete merged.manuallyReviewed;
    delete merged.manuallyReviewedAt;
    delete merged.manuallyReviewedVia;
  }
  if (!snap.reviewResolved) delete merged.reviewResolved;
  if (!snap.needsReviewLater) merged.needsReviewLater = false;
  if (!snap.satelliteOnly) merged.satelliteOnly = false;
  if (!snap.indicators) merged.indicators = [];
  return merged;
}

describe('review undo snapshot', () => {
  it('clears Keep stamps so the lead is pending again', () => {
    const before = {
      email: 'a@t.com',
      phone: '1',
      address: '1 Main',
      leadTier: 'distressed',
      category: 'property',
      manuallyReviewed: false,
      reviewResolved: false
    };
    const afterKeep = {
      ...before,
      manuallyReviewed: true,
      manuallyReviewedAt: Date.now(),
      manuallyReviewedVia: 'review_keep',
      reviewResolved: true,
      needsReview: false
    };
    const restored = applyReviewUndoSnapshot(afterKeep, {
      email: before.email,
      phone: before.phone,
      address: before.address,
      leadTier: before.leadTier,
      category: before.category,
      manuallyReviewed: before.manuallyReviewed,
      reviewResolved: before.reviewResolved,
      needsReview: true,
      indicators: []
    });
    assert.equal(restored.manuallyReviewed, undefined);
    assert.equal(restored.reviewResolved, undefined);
    assert.equal(restored.leadTier, 'distressed');
    assert.equal(restored.address, '1 Main');
  });

  it('restores prior tier after Change', () => {
    const afterChange = {
      email: 'a@t.com',
      phone: '1',
      address: '1 Main',
      leadTier: 'well_maintained',
      manuallyReviewed: true,
      reviewResolved: true
    };
    const restored = applyReviewUndoSnapshot(afterChange, {
      email: 'a@t.com',
      phone: '1',
      address: '1 Main',
      leadTier: 'distressed',
      manuallyReviewed: false,
      reviewResolved: false,
      indicators: []
    });
    assert.equal(restored.leadTier, 'distressed');
    assert.equal(restored.manuallyReviewed, undefined);
    assert.equal(restored.reviewResolved, undefined);
  });
});
