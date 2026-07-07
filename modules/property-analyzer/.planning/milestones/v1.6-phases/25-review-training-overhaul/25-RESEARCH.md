# Phase 25 Research — Review Training Overhaul

**Gathered:** 2026-06-30  
**Status:** Complete  
**Audit:** Full review flow mapped (imagery.js, scan.js, session.js, review.js)

## Critical gaps found

1. Training logged on every Keep/Change click — undo restored property only, not tierCorrections/correctionEvents/Gemini
2. Keep → Undo → Change could produce duplicate training + duplicate Gemini calls
3. `reviewAffirmationEvent` never called — affirmations used correction prompt
4. Default Gemini on every review action — expensive for fast review

## Solution (all three priorities)

### A — Deferred commit (commit on advance)
- `lib/review-training.js` pending buffer per recordKey
- `deferTraining: true` on review Keep/Change
- `reviewAdvance` → `commitReviewTrainingForKey`
- `reviewUndo` → cancel pending + rollback committed

### B — Affirmation path + Gemini modes
- `queueCorrectionReview` uses `reviewAffirmationEvent` for affirmations
- `reviewTrainingGeminiMode`: `metadata` (default) | `full` | `off`
- Session dedupe: one Gemini job per recordKey+actionType

### C — UX consistency
- `low_confidence` in `reviewedKeysByFilter` defaults + session hydration
- Buffer reset on open/close review

## RESEARCH COMPLETE