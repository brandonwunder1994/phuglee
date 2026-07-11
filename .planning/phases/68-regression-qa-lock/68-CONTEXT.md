# Phase 68: Regression QA Lock - Context

**Gathered:** 2026-07-10  
**Status:** Ready for planning  
**Source:** QA-01–03; AGENTS.md verify-live

<domain>
## Phase Boundary

Formal lock: full suite green on v1.6–v2.0 bars + new theater tests as needed; verify-live exit 0; 390/1440 layout; 44px CTAs; reduced-motion for FEED/KILL/THTR. Prefer gates-only when already green; add tests for new theater contracts.

</domain>

<decisions>
## Implementation Decisions

### Gates
- `npm test` green including independence/accuracy/brain/processUpload locks
- `scripts/verify-live.ps1` exit 0; `/bridge` + homepage 200
- Mobile 390 + desktop 1440 checks documented or automated where practical
- Reduced-motion paths verified for feed/report/theater

### Claude's Discretion
- Add focused unit tests for pure feed/report helpers if introduced in 64–67
- Screenshot checklist vs automated if no visual regression harness

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — QA-01–03
- AGENTS.md — never wipe lists/brain; verify-live after public edits
- Phase 60 pattern for permanent bar packaging

</canonical_refs>

<deferred>
## Deferred Ideas

New product features

</deferred>

---
*Phase: 68-regression-qa-lock*
