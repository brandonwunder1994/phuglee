# Phase 31 Plan: Cross-App Signature QA

**Requirements:** BRAND-35–37  
**Repos:** all three  
**Status:** complete

## Approach

1. **Visual/code audit** — Walk 14 surfaces against v1.3 §8–9 checklist; document in `AUDIT.md`.
2. **Ember grep** — Eliminate hardcoded `#e85d04` from root tokens; add `brand-audit.test.js` guard.
3. **Wiring verification** — Assert phuglee CSS/JS linked on all brand pages + proxy injection stack.
4. **Test sweep** — Run all three repo suites; document pre-existing Forge exceptions.
5. **Milestone close** — Update STATE/ROADMAP/REQUIREMENTS/M4 doc; write closure plan.