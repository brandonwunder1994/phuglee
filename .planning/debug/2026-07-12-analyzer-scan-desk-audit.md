# Analyzer Scan Desk — GSD Audit

**Date:** 2026-07-12  
**Command intent:** `/gsd:debug` + product audit of upload → scan → group → review  
**Status:** Phase 1 root-cause complete — **no code shipped** (confirm before execute)  
**Surface:** `/analyzer` (`modules/property-analyzer`)

---

## What you want (operator truth)

```
Upload list → Start Scan → Google Street View + AI
  → bucket into:
      1. Distressed
      2. Well Maintained
      3. Land / Vacant
      4. Blurry / Blocked image
  → Review Leads by group when scan finishes
```

That is a **4-bucket scan desk**. The current product is a **mega-session research tool** (historical search, local KPIs, Needs Review residual queue, session-wide totals) layered on top of that engine.

---

## Live evidence (this audit)

### Local admin session (`users/admin/distressAnalyzerSession_LATEST.json`)

| Metric | Value |
|--------|------:|
| Session file size | **61.5 MB** |
| Results (scanned) | **10,290** |
| Records (scan queue) | **10,293** |
| Unscanned (queue vs results) | **~3** |
| `importBatches` | **0 (empty)** |
| `importedAt` / `importBatchId` on results | **0** |
| Last analyze window | 2026-06-27 → 2026-07-01 |
| Profile enrichment | 2026-07-12 (bulk profile push) |

### Real tier KPIs (authoritative `computeTierCounts`)

| Bucket | Count | Notes |
|--------|------:|-------|
| **Distressed** | **3,019** | Homes AI/manual called distressed |
| **Well maintained** | **6,720** | Majority of session |
| **Vacant / land** | **358** | `category === vacant_lot` |
| **Blurred / blocked** | **96** | Imagery quality path |
| **Needs review** (residual) | **75** | Uncertain / later — **not** a primary bucket |
| Scanned total | **10,290** | |

### Manual review progress already done

`reviewStats`: kept **1,993** · changed **882** · deferred **33** · blurred **27**  
Most of the 10k already has `manuallyReviewed` / resolved marks.

### “New Analyzer Leads” upload (last few days)

Script report `scripts/_import-new-analyzer-leads-report.json`:

- CSV: **5,666** rows → **5,291** new after dedupe
- Import stamped batches `batch_new_analyzer_leads_*`
- Backup taken: `backups/manual/distressAnalyzerSession_BEFORE_NEW_LEADS_*.json`
- Later: **queue purge scripts** removed those leads from `records`
- **Current session matches pre-import** (same 10,290 addresses) — new list is **not** sitting ready to scan right now

### Runtime health (audit moment)

| Check | Result |
|-------|--------|
| Local shell `http://127.0.0.1:3000/` | Up after ensure |
| Local analyzer port **3456** | Starts, then often dies; process ~**700MB+** RAM with session |
| `/analyzer/` via proxy | Intermittent **502** when child dead |
| **Production** `phuglee-production…/analyzer/` | **HTTP 502** (HTML body ~99 bytes) — **down for you online** |
| Session parse cost (Node) | ~0.5s parse + ~0.5s stringify; **~330MB heap** for JSON alone |

---

## Why the page “keeps crashing” on new upload

Root causes (ordered by impact):

### 1. Mega-session memory bomb (primary)

Every upload/save path still treats the whole world as one blob:

- ~**61 MB** JSON session
- Browser holds: full `results[]` + `records[]` + re-stringify for IndexedDB/server
- Upload with `keepResults: true` keeps **all 10k** and adds new rows
- Analyzer Node process observed at **~700MB** WorkingSet with session loaded
- Profile enrichment (AVM, flags, phones arrays) **inflated** payload vs first pure-scan batch

**Symptom:** tab freeze, white screen, “crash,” hung Start Scan, failed save — especially on second+ upload.

### 2. Production / proxy 502 (primary for “site is broken”)

`/analyzer` is a **proxy** to the Property Analyzer process. When that process OOMs, exits, or fails health:

- Shell stays up
- Analyzer returns **502 Bad Gateway**
- Page looks like it “crashed” mid-upload or on load

**Production is currently 502** — not a UI typo; the analyzer service is unhealthy.

### 3. Scan queue vs history is tangled

- `records` ≈ full history (~10k), not “this upload only”
- Only ~**3** truly unscanned
- UI copy mixes: “left to scan” · “total saved” · “session totals” · historical search
- After “New Leads” purge, Start Scan correctly finds **nothing new** → feels “broken” vs first 10k run

### 4. KPI UI does not match the 4 buckets you care about

Visible **Session totals** cards:

- Distressed  
- **Needs Review**  
- Scanned  

Well maintained / vacant / blurred exist in:

- Filter segment buttons  
- **Hidden** `#summaryBreakdown` (not shown as hero KPIs)  
- Review Leads menu (Distressed / WM / Land / Manual Review — **no Blocked** entry)

So the desk **computes** the four groups correctly but **displays** a different story (Distressed + residual Needs Review + Scanned). That is why it “doesn’t work the same” as when the first 10k finished and you lived in the filter/review groups.

### 5. Batch identity missing on the original 10k

- `importBatches: []`
- No `importedAt` / `importBatchId` on results

Historical “upload date chips” and “this list vs that list” cannot reconstruct the first batch cleanly. Everything is one undifferentiated pile.

### 6. Confusing process layers (product, not just bugs)

Stack built over multiple redesigns:

1. Scan Ready + drop zone + Start Scan  
2. Live scan feed + live KPIs (Distressed / Needs Review / Scanned / Workers)  
3. Session totals (same skewed KPI set)  
4. Historical search (state/city) + local KPIs  
5. Distress Rankings filters (all 6 filters including WM / vacant / blocked)  
6. Review Leads submenu  
7. API usage, bulk edit, location breadcrumb  

You asked for **one linear desk**. We shipped a **multi-mode control room**.

---

## How it worked for the first ~10k vs now

| First batch | Now |
|-------------|-----|
| Fresh / smaller session | 61MB + profiles |
| Scan wrote into empty/growing results | Results full; queue empty |
| Mental model: scan → filters → review | Same engine, plus historical hub + residual “Needs Review” KPI |
| Process felt linear | Upload appends / dedupes / may no-op; prod 502; KPIs hide WM/land/blocked |
| Review groups usable | Still usable via filter bar / Review Leads — but easy to miss |

**The AI classification engine is not “gone.”**  
The **session shape + UI framing + service health** are what broke the experience.

---

## Intended simple architecture (recommendation)

### Product contract (lock this)

1. **Upload** → only the new list becomes the scan queue (history stays for search/export, not mixed into “ready to scan”).  
2. **Start Scan** → Street View + AI only for unscanned on **this list**.  
3. **Buckets (always visible KPIs):** Distressed · Well Maintained · Land · Blocked · Scanned (optional: Needs Review as small badge only).  
4. **Review Leads** → same four buckets (plus optional Manual Review residual).  
5. **History** → secondary (collapsed): pick market/export; never blocks upload/scan.

### Technical contract (crash-proof)

1. **Never re-serialize full 60MB on every upload** — save new records + meta; append results per property.  
2. **Scan jobs per batch** — `importBatches` always stamped; KPIs for “this scan” vs “all time”.  
3. **Lean session** — strip or lazy-load fat `profile` blobs from hot path.  
4. **Process health** — analyzer must not die on load; Railway memory + restart; local ensure-server keep-alive.  
5. **Prod 502** = P0 ops before UX polish.

---

## GSD path (exact commands style)

Current GSD state: **v3.0 Filter Visual Makeover complete** (phases 75–81). Analyzer is **not** the active milestone.

### Proposed next milestone

**`/gsd:new-milestone` → v3.1 Analyzer Scan Desk (linear)**

Phases (draft):

| Phase | Goal |
|-------|------|
| **A0 — Stabilize** | Fix prod 502 / analyzer process memory; verify `/analyzer` 200 + session-summary |
| **A1 — KPI truth** | Hero KPIs = Distressed / WM / Land / Blocked / Scanned; demote Needs Review |
| **A2 — Upload isolation** | New file = new batch queue only; never force full session rewrite in browser |
| **A3 — Scan resume** | Pending count, skip already-scanned, batch progress accurate after stop/refresh |
| **A4 — Review desk** | Review Leads = 4 buckets + residual; post-scan default to groups |
| **A5 — History freeze** | Historical search stays; optional; not on critical path |
| **A6 — QA lock** | Upload 100 + 2k fixtures; no tab crash; prod smoke |

Do **not** start implement until you approve scope (A0-only hotfix vs full v3.1).

---

## Immediate actions (if you want relief tonight)

1. **Ops:** Restore production analyzer (Railway logs, OOM, volume session size).  
2. **Local:** Keep `ensure-server` / restart; confirm both :3000 and :3456.  
3. **Do not** re-upload the full 5k into the same browser tab until batch isolation lands — use a **lean** import path or temporary dedicated session if scanning is urgent.  
4. **To review the existing 10k right now:** use filter bar  
   - Distressed · Well Maintained · Vacant Lot/Land · Blocked Image  
   or Review Leads → Distressed / WM / Land.

---

## Files of record

| Area | Path |
|------|------|
| Page | `modules/property-analyzer/public/index.html` |
| Upload | `public/js/render.js` → `handleFile` |
| Scan ready | `public/js/scan-ready.js` |
| KPIs | `public/js/session.js` → `updateSummaryStats` / `countTierBuckets` |
| Tier truth | `lib/tier-counts.js`, `lib/result-classify.js` |
| Session API | `routes/session.js` |
| Proxy | `lib/analyzer-proxy.js`, `lib/analyzer-process.js` |
| Prior redesign plan | `docs/gsd/plans/2026-07-08-analyze-page-simplification.md` |
| New leads import report | `scripts/_import-new-analyzer-leads-report.json` |
| Pre-import backup | `modules/property-analyzer/backups/manual/distressAnalyzerSession_BEFORE_NEW_LEADS_*` |

---

## Open decisions for you

1. **Hotfix only (A0 + A1 KPIs)** or **full Scan Desk milestone (A0–A6)**?  
2. Should **new uploads replace the scan queue** while keeping history, or **always append** (current intent)?  
3. Is **Needs Review** still useful as a small residual queue, or remove it from hero KPIs entirely?  
4. Production: scan/review on **Railway only**, or is local `127.0.0.1:3000/analyzer` also required tonight?
