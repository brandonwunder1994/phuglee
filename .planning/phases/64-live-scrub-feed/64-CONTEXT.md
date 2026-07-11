# Phase 64: Live Scrub Feed - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** Showstopper 1; design bible D4

<domain>
## Phase Boundary

During process, show live scrub activity feed (addresses/types + status language). Prefer client-staged feed from process response (or progressive client reveal after response) — not SSE unless proven necessary later. Reduced-motion safe. No kill-rate report layout (65).

</domain>

<decisions>
## Implementation Decisions

### Feed data
- Prefer client-staged from process response rows/meta (D4)
- Status language: kept / no-distress / discarded / already-in-Analyze as applicable
- Never invent fake addresses as unlabeled “proof”

### Motion
- FEED-02: prefers-reduced-motion → static summary / crossfade; motion not required for comprehension

### Claude's Discretion
- Whether feed animates before HTTP returns (optimistic phases) vs only post-response staged play
- Row sampling vs full list for large files (cap with “+N more” OK)

</decisions>

<canonical_refs>
## Canonical References

- `.planning/v2.1-FILTER-SCRUB-THEATER.md` D4
- `.planning/REQUIREMENTS.md` — FEED-01, FEED-02
- `public/js/bridge.js` — processUpload client path, loading panel
- Analyze activity-feed concept (reference only; different app)

</canonical_refs>

<deferred>
## Deferred Ideas

SSE streaming; kill-rate report chrome (65)

</deferred>

---
*Phase: 64-live-scrub-feed*
