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

      // Step bar retired — keep node hidden if any legacy markup remains.
      if (pipeline) pipeline.hidden = true;
      if (desk) desk.hidden = !z.showScanDesk;

      // Live scan theater only while scanning (never idle dead space).
      if (live) live.hidden = !z.showLiveScan;
      if (summary) {
        summary.hidden = !z.showSessionKpis;
        summary.classList.toggle('visible', z.showSessionKpis);
      }

      // Rankings workbench retired — always keep out of the page
      if (dash) dash.hidden = true;
      const dataZone = document.getElementById('analyzeDataZone');
      if (dataZone) dataZone.hidden = true;
      if (localKpi) localKpi.hidden = true;

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

      if (workBtn) workBtn.hidden = true;
    };

    let _pendingRefreshTimer = null;
    let _pendingRefreshInFlight = false;

    /** Pull pendingUnscanned from the logged-in server session (admin ≠ anonymous). */
    R.refreshServerScanPending = async function refreshServerScanPending(opts = {}) {
      if (!USE_PROXY || typeof apiFetch !== 'function') return null;
      if (_pendingRefreshInFlight && !opts.force) return state._serverPendingUnscanned;
      _pendingRefreshInFlight = true;
      try {
        const res = await apiFetch('/api/session-summary?lite=1', { cache: 'no-store' });
        if (!res.ok) return null;
        const summary = await res.json();
        if (!summary?.ok) return null;
        const pending = Math.max(0, Number(summary.pendingUnscanned) || 0);
        const freshImport = Number(state._freshImportAt) > 0
          && (Date.now() - Number(state._freshImportAt)) < 10 * 60 * 1000;
        // After a file drop, keep the list length the user just saw — don't
        // overwrite it with a stale/filtered server pending count.
        if (freshImport && (state.records || []).length > 0) {
          state._serverPendingUnscanned = (state.records || []).length;
          state._pendingUnscanned = (state.records || []).length;
        } else {
          state._serverPendingUnscanned = pending;
          if (pending > 0) state._pendingUnscanned = Math.max(Number(state._pendingUnscanned) || 0, pending);
        }
        if (summary.tierCounts && typeof normalizeTierCountsForDisplay === 'function') {
          state._tierCountsFromServer = normalizeTierCountsForDisplay(
            summary.tierCounts,
            summary.results || 0
          );
        }
        return pending;
      } catch (e) {
        console.warn('[scan-ready] pending refresh failed', e);
        return null;
      } finally {
        _pendingRefreshInFlight = false;
      }
    };

    R.scheduleRefreshServerScanPending = function scheduleRefreshServerScanPending() {
      if (!USE_PROXY) return;
      if (_pendingRefreshTimer) return;
      _pendingRefreshTimer = setTimeout(async () => {
        _pendingRefreshTimer = null;
        const before = Number(state._serverPendingUnscanned) || 0;
        const pending = await refreshServerScanPending();
        if (pending != null && pending !== before) {
          updateScanReadyUi();
          updateStartButton?.();
        } else if (pending > 0) {
          updateScanReadyUi();
        }
      }, 50);
    };

    R.updateScanReadyUi = function updateScanReadyUi() {
      if (scanReadySection) scanReadySection.hidden = false;

      // Always re-check server pending — browser records often look "fully scanned"
      // while forceRescan queue still exists on the logged-in user session.
      if (USE_PROXY) scheduleRefreshServerScanPending();

      const hasRecords = (state.records || []).length > 0;
      const expectedTotal = Math.max(
        Number(sessionLoadState?.total) || 0,
        Number(sessionLoadState?.serverCanonical) || 0,
        Number(state._tierCountsFromServer?.total) || 0,
        Number(state._tierCountsFromServer?.all) || 0,
        Number(state._scanBaselineTierCounts?.all) || 0
      );
      const serverPending = Number(state._serverPendingUnscanned);
      const batchDone = Number(state.scanBatchDone) || 0;
      const batchTotal = Number(state.scanBatchTotal) || 0;

      // Single display pending — after a fresh file drop, trust THIS list length.
      // Do not let a stale server queue inflate/deflate the number the user just saw.
      let pendingUnscanned = 0;
      const localQueue = Math.max(0, (state.records || []).length);
      const freshImport = Number(state._freshImportAt) > 0
        && (Date.now() - Number(state._freshImportAt)) < 10 * 60 * 1000;
      const localPending = hasRecords && typeof countPendingScanLeads === 'function'
        ? countPendingScanLeads(state.records, state.results)
        : Math.max(0, Number(state._pendingUnscanned) || 0);
      if (state.running && batchTotal > 0) {
        pendingUnscanned = Math.max(0, batchTotal - batchDone);
      } else if (freshImport && localQueue > 0) {
        // Match Start Scan: fresh drop scans every row in the list.
        pendingUnscanned = localQueue;
      } else if (hasRecords && (state.records || []).some((r) => r?.forceRescan)) {
        // forceRescan queue: use pending math (completed rescans are not pending).
        // Never fall back to raw queue length — `0 || localQueue` re-showed 750 after a full scan.
        pendingUnscanned = localPending;
      } else if (Number.isFinite(serverPending) && serverPending > 0 && !hasRecords) {
        pendingUnscanned = serverPending;
      } else if (hasRecords) {
        // Prefer real Start-Scan pending (excludes already-scanned) over raw queue length
        // so the top number never lies about what Start will run.
        pendingUnscanned = localPending;
      } else {
        pendingUnscanned = Math.max(0, Number(state._pendingUnscanned) || 0);
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

      const sessionSaved = typeof getTotalScannedCount === 'function'
        ? getTotalScannedCount()
        : Math.max((state.results || []).length || 0, expectedTotal);
      const locationLabel = sourceFile
        || im()?.formatImportLocation?.({
          city: batches?.city || '',
          state: batches?.state || ''
        })
        || (sessionSaved > 0
          ? `${sessionSaved.toLocaleString()} scanned`
          : 'Import');

      // Filename line — only show a real name when we have one; else quiet “No file yet”
      const hasFileIdentity = !!(sourceFile || (hasRecords && locationLabel && locationLabel !== 'Import'));
      if (scanReadyLocation) {
        if (hasFileIdentity || sessionSaved > 0 || pendingUnscanned > 0 || state.running) {
          scanReadyLocation.textContent = locationLabel;
          scanReadyLocation.hidden = false;
          scanReadyLocation.title = locationLabel;
        } else {
          scanReadyLocation.textContent = 'No file yet';
          scanReadyLocation.hidden = false;
          scanReadyLocation.title = '';
        }
      }
      // After a session exists, hide the tall drop zone — use Replace file instead.
      const sessionLoaded = sessionSaved > 0 || analyzeHasResults();
      const hasSession = sessionSaved > 0 || analyzeHasResults();
      const deskRoot = typeof scanReadySection !== 'undefined' && scanReadySection
        ? scanReadySection
        : document.getElementById('scanReadySection');
      if (deskRoot) deskRoot.classList.toggle('is-session-loaded', sessionLoaded);
      document.body.classList.toggle('analyze-has-session', hasSession);
      const heroZone = document.querySelector('.analyze-hero-zone');
      if (heroZone) heroZone.classList.toggle('has-session', hasSession);
      const pageLead = document.getElementById('analyzePageLead');
      if (pageLead) pageLead.hidden = hasSession;

      const replaceBtn = document.getElementById('scanImportReplaceBtn');
      if (replaceBtn) {
        replaceBtn.hidden = !sessionLoaded || !!state.running;
      }

      // One quiet status line — no duplicate “scanned” + “done” noise
      if (scanReadyCount) {
        if (state.running && batchTotal > 0) {
          scanReadyCount.textContent =
            `Scanning ${batchDone.toLocaleString()} of ${batchTotal.toLocaleString()}`;
        } else if (pendingUnscanned > 0) {
          scanReadyCount.textContent = `${pendingUnscanned.toLocaleString()} ready to scan`;
        } else if (sessionSaved > 0) {
          scanReadyCount.textContent = `${sessionSaved.toLocaleString()} scanned`;
        } else {
          scanReadyCount.textContent = 'Drop a spreadsheet to start';
        }
      }

      const canStart = pendingUnscanned > 0
        && !state.running
        && !!serverConfig?.hasMapsKey
        && !!serverConfig?.hasGeminiKey
        && (hasRecords || !!USE_PROXY);
      if (scanReadyStartBtn) {
        scanReadyStartBtn.disabled = !canStart;
        scanReadyStartBtn.hidden = !!state.running;
        // Primary CTA is Scan; review is via Queue KPI tiles.
        scanReadyStartBtn.classList.add('btn-primary');
        scanReadyStartBtn.classList.remove('btn-secondary');
        if (canStart) {
          scanReadyStartBtn.title = 'Run Street View + AI';
        } else if (state.running) {
          scanReadyStartBtn.title = 'Scanning…';
        } else if (!serverConfig?.hasMapsKey || !serverConfig?.hasGeminiKey) {
          scanReadyStartBtn.title = 'API keys missing on server';
        } else if (!hasRecords && pendingUnscanned <= 0) {
          scanReadyStartBtn.title = 'Import a list first';
        } else {
          scanReadyStartBtn.title = startBtn?.title || 'Not ready';
        }
      }
      const readyStop = $('scanReadyStopBtn');
      if (readyStop) {
        readyStop.hidden = !state.running;
        readyStop.disabled = !state.running || !!state.aborted;
      }

      applyAnalyzeVisibility();
    };

    /** Vault strip collapse (default collapsed). Persists open state for the session. */
    R.wireVaultStripToggle = function wireVaultStripToggle() {
      const btn = document.getElementById('summaryVaultToggle');
      const panel = document.getElementById('summaryVaultPanel');
      if (!btn || !panel || btn.dataset.wired === '1') return;
      btn.dataset.wired = '1';
      let open = false;
      try { open = sessionStorage.getItem('analyze_vault_strip_open') === '1'; } catch (_) {}
      const apply = () => {
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      apply();
      btn.addEventListener('click', () => {
        open = !open;
        try { sessionStorage.setItem('analyze_vault_strip_open', open ? '1' : '0'); } catch (_) {}
        apply();
      });
    };

    R.updateVaultStripMeta = function updateVaultStripMeta(total) {
      const meta = document.getElementById('summaryVaultToggleMeta');
      if (!meta) return;
      if (total == null || !Number.isFinite(Number(total))) {
        meta.textContent = '—';
        return;
      }
      meta.textContent = Number(total).toLocaleString();
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
      const replaceBtn = document.getElementById('scanImportReplaceBtn');
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

      // Compact “Replace file” when session already has data (tall drop zone is hidden)
      if (replaceBtn && replaceBtn.dataset.wired !== '1') {
        replaceBtn.dataset.wired = '1';
        replaceBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (state.running) {
            alert('Stop the scan before uploading a new file.');
            return;
          }
          input?.click();
        });
      }

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

    function positionScanDeskDropdown(menu, anchor) {
      if (!menu || !anchor) return;
      menu.style.position = 'fixed';
      menu.style.zIndex = '6000';
      const rect = anchor.getBoundingClientRect();
      const menuW = menu.offsetWidth || (menu.classList.contains('review-leads-menu') ? 184 : 216);
      const left = Math.min(Math.max(8, rect.right - menuW), window.innerWidth - menuW - 8);
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.left = `${left}px`;
      menu.style.right = 'auto';
    }

    function wireScanReady() {
      const overflowToggle = document.getElementById('scanDeskOverflowToggle');
      const overflowMenu = document.getElementById('scanDeskOverflow');
      const overflowWrap = document.getElementById('scanDeskOverflowWrap');

      function closeScanDeskOverflow() {
        if (overflowMenu) overflowMenu.hidden = true;
        overflowToggle?.setAttribute('aria-expanded', 'false');
      }

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

      // Review entry is Session Buckets KPIs (openBucketReviewFromKpi) — no Review Leads dropdown.

      overflowToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!overflowMenu) return;
        const willOpen = overflowMenu.hidden;
        overflowMenu.hidden = !willOpen;
        overflowToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (willOpen) positionScanDeskDropdown(overflowMenu, overflowToggle);
      });
      document.addEventListener('click', (e) => {
        if (!overflowWrap?.contains(e.target)) closeScanDeskOverflow();
      });
      overflowMenu?.addEventListener('click', () => {
        closeScanDeskOverflow();
      });

      window.addEventListener('resize', () => {
        if (overflowMenu && !overflowMenu.hidden) {
          positionScanDeskDropdown(overflowMenu, overflowToggle);
        }
      });

      // Admin tools stay in overflow only (API keys / AI brain) — never inline on the desk.
      document.getElementById('deskOpenSettingsBtn')?.addEventListener('click', () => {
        closeScanDeskOverflow();
        openSettingsModal?.();
      });
      document.getElementById('deskOpenBrainBtn')?.addEventListener('click', () => {
        closeScanDeskOverflow();
        openBrainModal?.();
      });

      applyTierUiLabelsToChrome?.();
      wireScanImportZone();
      wireVaultStripToggle?.();
      updateScanReadyUi();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireScanReady);
    } else {
      wireScanReady();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
