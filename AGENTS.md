# Distress OS / Phuglee — Agent Rules

## MANDATORY: Never wipe user work while editing

The user runs real Filter lists, Train decisions, and City Tracker work. **Site edits, restarts, and deploys must not destroy that work.**

### Hard rule (non-negotiable)

1. **Do not delete, truncate, reset, or “clean”** runtime data unless the user **explicitly** asks to wipe a specific dataset in that message.
2. **Never touch** these stores as part of normal coding, restarts, or deploys:
   - Filter saved lists — `FILTER_LISTS_ROOT` / `data/filter-lists/` (and Railway volume under `PDA_DATA_ROOT/filter-lists`)
   - Filter Superpower Brain — `BRIDGE_BRAIN_ROOT` / `data/bridge-brain/` / `global-brain.json`
   - Form Forge city/submission data — `modules/form-forge/data/` (except gitignored backups you create intentionally)
   - Analyzer session / user data — `modules/property-analyzer/users/`, analyzer data roots
3. **Edits are code + static assets only** by default: `public/`, `lib/`, tests, docs, configs that do not wipe volumes.
4. **Restart/redeploy is OK** — lists and brain live on disk/volume, not in the process. Prefer `scripts\restart.ps1` / Railway deploy over deleting folders.
5. **Git:** `data/filter-lists/` and `data/bridge-brain/` are gitignored — do not force-add or commit them away.
6. If a task seems to require clearing data, **stop and ask** with the exact path/scope first.

**User-only deletes:** Filter “delete list” / clear UI, or an explicit “wipe X” instruction. Agent never “tidy up” by removing user lists.

## MANDATORY: Local server must stay live after every edit

**Editing static files does not kill the server. Leaving it dead after a session does.**  
The user must never have to ask you to bring the server back up.

### Hard rule (non-negotiable)

Before you claim work is done, that the site is “live”, or that the user should refresh/preview:

1. **Verify** the local server answers HTTP 200:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
   ```
2. If verify fails, **start/restart** headless (no terminal window):
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restart.ps1
   ```
3. **Re-verify** until `http://127.0.0.1:3000/api/health` returns 200 and homepage returns 200.
4. Only then tell the user the site is ready. Quote the URLs:
   - http://127.0.0.1:3000/
   - http://localhost:3000/

**Do not end a site-edit turn without a successful health check in that same turn.**

### Why the server dies

- Agent shells often kill child process trees when the command finishes (Job Objects).
- Never start the server with a blocking `node server.js` inside the agent shell.
- Always start via `scripts\restart.ps1` or `scripts\ensure-server.ps1` / `scripts\run-hidden.vbs` (headless + detached).
- Keep-alive scheduled task: `PhugleeDistressOS` (every 2 min). `scripts\stop.ps1` removes it.

### Commands

| Action | Command |
|--------|---------|
| Verify live | `powershell -File scripts\verify-live.ps1` |
| Start / restart (no window) | `powershell -File scripts\restart.ps1` |
| Ensure if down | `powershell -File scripts\ensure-server.ps1` |
| Stop + remove keep-alive | `powershell -File scripts\stop.ps1` |

### Preview after UI edits

After CSS/HTML/JS changes: hard-refresh note for user (`Ctrl+Shift+R`), and confirm health 200 before saying “live”.

## Filter uploads: lopsided / scanned / redacted violation sheets

When a city packet is **not** a normal upright Excel/CSV/text PDF (sideways scan, image-only PDF, black-box redactions, Crystal Reports printout):

1. **Always** convert → clean filterable `.xlsx` first (PDF → OCR upright → structured columns → spreadsheet path). Never leave the operator on raw OCR lines or title-banner “headers”.
2. **Auto-rotate** via `lib/bridge-engine/parsers/pdf-ocr.js` before OCR text is trusted.
3. **Rebuild columns** with a report-family extractor when anchors match:
   - GENF / Enforcement Cases Detail → `pdf-enforcement-detail.js` (Record ID, Location, Violation Type, …)
   - CEU / CODE CASES OPENED → `pdf-code-cases-status.js`
   - Application Name / Street # grids → `pdf-code-compliance.js`
   - E-Gov PIR → `pdf-egov.js`
4. **Redactions:** keep only rows with a usable Location/address; do not invent missing Record IDs.
5. Full rules: `docs/bridge/DATA-STANDARDS.md` § “Lopsided / Scanned / Redacted Sheets”.
6. When a new city scan fails column rebuild, add a fixture under `tests/fixtures/bridge/` + a focused extractor/test — do not special-case only in chat.
