---
milestone: v1.7
audit_type: loading-imagery
audited: 2026-06-30
status: gaps_found
priority: P0
---

# Loading & Imagery Audit — Property Distress Analyzer

**Audited:** 2026-06-30  
**Scope:** Image loading across dashboard cards, property inspector, review mode, session bootstrap  
**User intent:** Images always present when needed; review queue advances without per-property lag

---

## Executive Summary

| Surface | Before | Root cause |
|---------|--------|------------|
| **Review mode images** | Broken on localhost / proxy | `getReviewImageUrls` required client `apiKey` string; proxy mode uses server key (`apiKey === ''`) |
| **Review mode speed** | Lag between properties | Review bypassed disk cache; hit `/api/sv-image` every advance |
| **Card / inspector** | Mostly OK | Cache-first via `getPropertyImageUrls` / `getCardThumbUrls` |
| **Session bootstrap** | Sequential | Imagery index fetched after full session load |

**Bottom line:** Review mode had a different (broken) URL path than the rest of the app. Fix = unified cache-first resolver + aggressive prefetch.

---

## Findings (ranked)

### P0 — Review images empty in proxy mode

```12:21:public/js/imagery.js
R.getReviewImageUrls = function getReviewImageUrls(address, result = null) {
  const key = getApiKeyForImagery();
  if (!key || !address) return { satellite: null, streetView: null };
  // ...
}
```

`getApiKeyForImagery()` returns `''` when `USE_PROXY` (localhost). `hasImageryKey()` correctly checks `serverConfig.hasMapsKey`. Review used the wrong guard.

### P0 — Review ignored disk cache

Cards and inspector call `getCachedImageryUrls()` first. Review always built fresh Maps API proxy URLs — slow and redundant when 7k+ images exist in `property_imagery/`.

### P1 — Prefetch too shallow

`prefetchUpcomingReviewImages` only preloaded 3 ahead. Fast review sessions need 8–12.

### P1 — Bootstrap waterfall

`loadSession()` then `fetchImageryIndexMap()` ran sequentially, delaying cache hydration.

### P2 — No shared test for URL resolution

Logic duplicated across `imagery.js` and `review.js` with no unit tests.

---

## Fix Plan (shipped in this pass)

| ID | Change | File(s) |
|----|--------|---------|
| LOAD-01 | `lib/imagery-urls.js` — cache-first resolver, proxy-safe `hasImageryKey` | `lib/imagery-urls.js` |
| LOAD-02 | Wire `getReviewImageUrls` through shared resolver | `public/js/imagery.js` |
| LOAD-03 | Prefetch 8 ahead + batch prefetch on `openReviewMode` | `public/js/imagery.js`, `config.js` |
| LOAD-04 | Parallel session + imagery index on bootstrap | `public/js/app.js` |
| LOAD-05 | Review image `decoding="async"` + loading class | `index.html`, `imagery.js` |
| LOAD-06 | Unit tests for resolver | `tests/imagery-urls.test.js` |

---

## Verification

```bash
npm test
```

Manual smoke:
1. Restore session with 1k+ leads
2. Open Distressed Review — first image appears immediately (cached)
3. Advance with `1` key — next 3–8 properties show without spinner lag
4. Card grid thumbs still load (unchanged path)

---

## Follow-up — Virtual scroll (2026-06-30)

**Symptom:** Scrolling lead-type filters only showed the first ~40 cards; deeper leads never appeared.

**Cause:** `renderVirtualCards` treated each card as one scroll row in a multi-column grid. Spacer height was `itemCount × rowHeight` instead of `rowCount × rowHeight`, so scroll position mapped to wrong indices.

**Fix:** `lib/virtual-scroll.js` — column-aware slice + spacer; filter/search resets scroll to top.

---

## GSD Next Steps

- **Milestone:** v1.7 Loading & Imagery Reliability (this audit)
- **Phase 27:** Preload tuning + perf profile on 10k review queue
- **Phase 28:** Lightbox + inspector loading skeletons (visual polish)

*Audit author: GSD loading-imagery audit · 2026-06-30*