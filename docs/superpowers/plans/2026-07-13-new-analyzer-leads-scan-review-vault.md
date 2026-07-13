# New Analyzer Leads → Review → Vault (fix)

> **For agentic workers:** execute top-to-bottom. User already approved execute + Railway push.

**Goal:** Stop the false “5,291 left to scan” on Railway, put New Analyzer Leads into Distressed / Well Maintained / Vacant for human Keep/Change, re-queue only failed/`unavailable` rows for a real rescan, and publish Keep/Change into The Vault immediately.

## Root cause

Railway admin session already has **~15,581 results** and **`pendingUnscanned: 0`**. CSV addresses match into results. Browser only loads a **partial** `state.results` (often ~10,293) while `state.records` still lists the sheet → `countPendingScanLeads` reports ~5,291 “left to scan” even though the server already has AI scores. Soft vias previously hid pending review.

## Design

1. **Trust server when results are partial** — Scan Ready / Start Scan use `summary.pendingUnscanned` + `/api/import-address-index`, not partial browser results alone.
2. **Open manual review** on production for New Analyzer Leads that lack a real Keep/Change (clear soft vias / false stamps).
3. **True rescan queue** only for New Analyzer Leads with `unavailable` / failed imagery (remove from results → re-add to records). Keep solid Distressed/WM/Vacant AI results for review, not credit burn.
4. **Vault on Keep/Change** — after real review vias, call analyzer→Vault publish for that lead (plus force sync hook).
5. **Push Railway** and verify Scan Ready shows correct pending (unavailable count only) + review queues non-empty.

## Files

| File | Change |
|------|--------|
| `modules/property-analyzer/public/js/scan-ready.js` | Prefer server pending when results partial |
| `modules/property-analyzer/public/js/app.js` | Always fetch address index before pending/start |
| `modules/property-analyzer/public/js/session.js` | Hook Vault publish after real review mark |
| `lib/leads-platform/analyzer-sync.js` | Export `publishAnalyzerResult(result)` |
| `lib/leads-platform/api.js` | `POST /api/leads/publish-from-analyzer` |
| `scripts/prepare-new-analyzer-leads-for-scan-review.js` | Prod: clear soft review + requeue unavailable |

## Tasks

- [ ] Task 1: Fix false pending scan count
- [ ] Task 2: Vault publish-on-review API + client hook
- [ ] Task 3: Prod prepare script (review open + unavailable requeue)
- [ ] Task 4: Push Railway + verify counts
