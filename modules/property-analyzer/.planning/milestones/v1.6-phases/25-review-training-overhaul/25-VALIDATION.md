---
phase: 25-review-training-overhaul
nyquist_compliant: true
wave_0_complete: true
validated: "2026-06-30"
---

# Phase 25 Validation — Review Training Overhaul

| REQ | Observable check | Evidence |
|-----|------------------|----------|
| REV-01 | `reviewAdvance` calls `commitReviewTrainingForKey` | `imagery.js:390-391`, `review-training.test.js` |
| REV-02 | `reviewUndo` calls `rollbackReviewTrainingForKey` when `trainingCommitted` | `imagery.js:712-713`, `review-training-flow.test.js` |
| REV-03 | `queueCorrectionReview` uses `reviewAffirmationEvent` for `kind === 'affirmation'` | `scan.js:698-701` |
| REV-04 | `getReviewTrainingGeminiMode()` returns `metadata` by default | `scan.js:31-33` |

**Regression suite:** `npm test` — 133 tests (includes flow integration)