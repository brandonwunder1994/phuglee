// scan-ready.js — Drag-and-drop import + Start Scan + zone visibility
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const ib = () => PDA.lib?.importBatches;
    const im = () => PDA.lib?.importMeta;
    let scanDropDepth = 0;

    /** True when session has analyzed results (in-memory or server-primed). */
    function analyzeHasResults() {
      if ((state.results || []).length > 0) return true;
      if (Number(sessionLoadState?.total || 0) > 0) return true;
      const tc = state._tierCountsFromServer;
      if (tc && (Number(tc.all) > 0 || Number(tc.total) > 0)) return true;
      return false;
    }

    /**
     * Scan-first IA: show/hide zones from pure getAnalyzeZones matrix.
     * Call after session load, scan start/stop, summary update, desk refresh.
     */
    R.applyAnalyzeVisibility = function applyAnalyzeVisibility() {
      const lib = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.analyzeVisibility) || null;
      const getZones = (lib && lib.getAnalyzeZones)
        || (typeof getAnalyzeZones === 'function' ? getAnalyzeZones : null);
      if (!getZones) return;

      const hasResults = analyzeHasResults();
      const z = getZones({
        hasRecords: (state.records && state.records.length > 0) || false,
        hasResults,
        isScanning: !!state.running,
        resultsWorkbenchOpen: !!state.resultsWorkbenchOpen,
        pastMarketsOpen: !!state.pastMarketsOpen
      });

      const pipeline = document.getElementById('analyzePipeline');
      const desk = scanReadySection || document.getElementById('scanReadySection');
      const live = liveScanSection || document.getElementById('liveScanSection');
      const summary = summarySection || document.getElementById('summarySection');
      const dash = dashboard || document.getElementById('dashboard');
      const hub = locationHub || document.getElementById('locationHub');
      const localKpi = localKpiSection || document.getElementById('localKpiSection');
      const workBtn = document.getElementById('openResultsWorkbenchBtn');

      if (pipeline) pipeline.hidden = !z.showPipeline;
      if (desk) desk.hidden = !z.showScanDesk;

      if (live) live.hidden = !z.showLiveScan;
      if (summary) {
        summary.hidden = !z.showSessionKpis;
        summary.classList.toggle('visible', z.showSessionKpis);
      }
      if (dash) dash.hidden = !z.showResultsWorkbench;
      if (localKpi && !z.showResultsWorkbench) localKpi.hidden = true;

      if (hub) {
        // Hard demote: never a peer panel on first paint — control or expanded only
        if (z.pastMarketsMode === 'control') {
          hub.hidden = false;
          hub.classList.add('historical-search--control');
          if (hub.open && !state.pastMarketsOpen) hub.open = false;
        } else if (z.pastMarketsMode === 'expanded') {
          hub.hidden = false;
          hub.classList.remove('historical-search--control');
          if (!hub.open) hub.open = true;
        } else {
          hub.hidden = true;
        }
      }

      // Work results entry when results exist but workbench closed (not while scanning)
      if (workBtn) {
        const showWork = hasResults && !state.resultsWorkbenchOpen && !state.running;
        workBtn.hidden = !showWork;
      }
    };

    R.updateScanReadyUi = function updateScanReadyUi() {
      if (scanReadySection) scanReadySection.hidden = false;

      const hasRecords = (state.records || []).length > 0;
      // Accurate pending: address + record key (same as Start Scan). Never treat 0 as "unknown".
      let pendingUnscanned = typeof countPendingScanLeads === 'function'
        ? countPendingScanLeads(state.records, state.results)
        : (typeof recordKey === 'function'
          ? (im()?.countUnscannedLeads(state.records, state.results, recordKey) || 0)
          : 0);
      // Only fall back to server hint when we have no local records loaded yet
      if (!hasRecords && Number(state._pendingUnscanned) > 0) {
        pendingUnscanned = Number(state._pendingUnscanned);
      }
      state._pendingUnscanned = pendingUnscanned;

      const batches = ib()?.deriveRecentImport(state.importBatches, state.records);
      let sourceFile = String(state.fileName || batches?.sourceFile || '').trim();
      const recentAt = Number(batches?.importedAt) || 0;
      if (recentAt && Array.isArray(state.importBatches)) {
        const sameWave = state.importBatches.filter(
          (b) => Math.abs((Number(b.importedAt) || 0) - recentAt) < 60_000
        );
        if (sameWave.length > 1) {
          sourceFile = sameWave.find((b) => b.sourceFile)?.sourceFile || sourceFile;
        }
      }

      const locationLabel = sourceFile
        || im()?.formatImportLocation?.({
          city: batches?.city || '',
          state: batches?.state || ''
        })
        || 'Import leads to scan';

      if (scanReadyLocation) {
        scanReadyLocation.textContent = hasRecords || pendingUnscanned
          ? locationLabel
          : 'Import leads to scan';
      }
      if (scanReadyCount) {
        const sessionTotal = (state.results || []).length || 0;
        const batchDone = Number(state.scanBatchDone) || 0;
        const batchTotal = Number(state.scanBatchTotal) || 0;
        if (state.running && batchTotal > 0) {
          scanReadyCount.textContent =
            `Scanning… ${batchDone.toLocaleString()} of ${batchTotal.toLocaleString()} on this list saved` +
            (sessionTotal ? ` · ${sessionTotal.toLocaleString()} total in session` : '') +
            ` — Stop keeps finished ones.`;
        } else if (pendingUnscanned > 0) {
          const onList = (state.records || []).length;
          const doneOnList = Math.max(0, onList - pendingUnscanned);
          scanReadyCount.textContent =
            `${pendingUnscanned.toLocaleString()} left to scan` +
            (onList ? ` (${doneOnList.toLocaleString()} of ${onList.toLocaleString()} on this list already done)` : '') +
            (sessionTotal ? ` · ${sessionTotal.toLocaleString()} saved total` : '') +
            ` — hit Start Scan`;
        } else if (sessionTotal > 0) {
          scanReadyCount.textContent =
            `All leads on this list are scanned (${sessionTotal.toLocaleString()} total saved). Drop another file or open Review Leads.`;
        } else {
          scanReadyCount.textContent =
            'Drop a file below, then start Street View + AI scan.';
        }
      }

      const canStart = pendingUnscanned > 0
        && hasRecords
        && !state.running
        && !!serverConfig?.hasMapsKey
        && !!serverConfig?.hasGeminiKey;
      if (scanReadyStartBtn) {
        scanReadyStartBtn.disabled = !canStart;
        scanReadyStartBtn.hidden = !!state.running;
        if (canStart) {
          scanReadyStartBtn.title = 'Start Street View + satellite AI scan';
        } else if (state.running) {
          scanReadyStartBtn.title = 'Scan already running';
        } else if (!serverConfig?.hasMapsKey || !serverConfig?.hasGeminiKey) {
          scanReadyStartBtn.title = 'Maps or Gemini API key missing on server';
        } else if (!hasRecords) {
          scanReadyStartBtn.title = 'Import a spreadsheet first';
        } else {
          scanReadyStartBtn.title = startBtn?.title || 'Cannot start yet';
        }
      }
      const readyStop = $('scanReadyStopBtn');
      if (readyStop) {
        readyStop.hidden = !state.running;
        readyStop.disabled = !state.running || !!state.aborted;
      }
      if (reviewLeadsBtn) reviewLeadsBtn.disabled = !(state.results || []).length;

      applyAnalyzeVisibility();
    };

    function setScanDropActive(active) {
      const drop = $('scanImportDrop');
      if (!drop) return;
      drop.classList.toggle('is-dragover', !!active);
      drop.classList.toggle('dragover', !!active); // legacy class
      drop.setAttribute('aria-dropeffect', active ? 'copy' : 'none');
    }

    async function importScanFile(file) {
      if (!file) return;
      if (state.running) {
        alert('Stop the scan before uploading a new file.');
        return;
      }
      // Always keep already-scanned results — import only replaces the next scan batch
      await handleFile(file, { keepResults: true });
    }

    function wireScanImportZone() {
      const drop = $('scanImportDrop');
      const input = $('scanFileInput');
      const browseLabel = $('scanImportBrowseLabel');
      input?.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        await importScanFile(file);
      });

      browseLabel?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        input?.click();
      });

      if (!drop) return;

      // Click empty drop area → browse (except when clicking the browse control)
      drop.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, select, label')) return;
        input?.click();
      });

      drop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input?.click();
        }
      });

      drop.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        scanDropDepth += 1;
        setScanDropActive(true);
      });

      drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        setScanDropActive(true);
      });

      drop.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        scanDropDepth = Math.max(0, scanDropDepth - 1);
        if (scanDropDepth === 0) setScanDropActive(false);
      });

      drop.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        scanDropDepth = 0;
        setScanDropActive(false);
        const file = fileFromDataTransfer?.(e.dataTransfer)
          || (e.dataTransfer?.files && e.dataTransfer.files[0])
          || null;
        if (!file) {
          alert('Drop a CSV or Excel file (.csv, .xlsx, .xls).');
          return;
        }
        if (typeof isSpreadsheetFile === 'function' && !isSpreadsheetFile(file)) {
          alert(`That file type is not supported.\n\nUse CSV or Excel:\n${file.name || ''}`);
          return;
        }
        await importScanFile(file);
      });

      // Prevent browser from opening the file if drop misses the zone slightly
      // only while pointer is over the import section
      const zone = $('scanImportZone');
      zone?.addEventListener('dragover', (e) => {
        if (hasFileDrag?.(e.dataTransfer)) e.preventDefault();
      });
    }

    function wireScanReady() {
      // Call startScanAnalysis directly — do not rely on hidden startBtn.click()
      // (disabled buttons suppress programmatic clicks; missing DOM nodes used to abort silently).
      scanReadyStartBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (scanReadyStartBtn.disabled) return;
        if (typeof startScanAnalysis === 'function') {
          startScanAnalysis();
          return;
        }
        // Fallback if app.js not yet bound
        if (startBtn && !startBtn.disabled) startBtn.click();
      });

      reviewLeadsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!reviewLeadsMenu) return;
        const open = !reviewLeadsMenu.hidden;
        reviewLeadsMenu.hidden = open;
        reviewLeadsBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      });

      reviewLeadsMenu?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-review-flow]');
        if (!btn) return;
        reviewLeadsMenu.hidden = true;
        reviewLeadsBtn?.setAttribute('aria-expanded', 'false');
        openReviewMode(btn.dataset.reviewFlow);
      });

      document.addEventListener('click', (e) => {
        if (!reviewLeadsWrap?.contains(e.target)) {
          if (reviewLeadsMenu) reviewLeadsMenu.hidden = true;
          reviewLeadsBtn?.setAttribute('aria-expanded', 'false');
        }
      });

      const openWorkbenchBtn = document.getElementById('openResultsWorkbenchBtn');
      openWorkbenchBtn?.addEventListener('click', () => {
        state.resultsWorkbenchOpen = true;
        applyAnalyzeVisibility();
        if (typeof renderResults === 'function') renderResults({ force: true });
        else if (typeof renderResultsProgressive === 'function') renderResultsProgressive();
        dashboard?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      });

      wireScanImportZone();
      updateScanReadyUi();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireScanReady);
    } else {
      wireScanReady();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
