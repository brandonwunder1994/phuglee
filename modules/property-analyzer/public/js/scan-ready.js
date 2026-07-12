// scan-ready.js — Drag-and-drop import + Start Scan
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const ib = () => PDA.lib?.importBatches;
    const im = () => PDA.lib?.importMeta;
    let scanDropDepth = 0;

    R.updateScanReadyUi = function updateScanReadyUi() {
      if (scanReadySection) scanReadySection.hidden = false;

      const hasRecords = (state.records || []).length > 0;
      let pendingUnscanned = typeof recordKey === 'function'
        ? (im()?.countUnscannedLeads(state.records, state.results, recordKey) || 0)
        : 0;
      if (!pendingUnscanned && hasRecords) {
        pendingUnscanned = state.records.length;
      }
      if (!pendingUnscanned && Number(state._pendingUnscanned) > 0) {
        pendingUnscanned = Number(state._pendingUnscanned);
      }

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
        if (pendingUnscanned > 0) {
          scanReadyCount.textContent =
            `${pendingUnscanned.toLocaleString()} lead${pendingUnscanned === 1 ? '' : 's'} ready to scan — hit Start Scan`;
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
      if (reviewLeadsBtn) reviewLeadsBtn.disabled = !(state.results || []).length;
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
      initLeadTypeSelects?.();

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
      scanReadyStartBtn?.addEventListener('click', () => startBtn?.click());

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
