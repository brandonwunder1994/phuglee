// scan-ready.js — Import dropzone + Start Scan
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const ib = () => PDA.lib?.importBatches;
    const im = () => PDA.lib?.importMeta;

    R.updateScanReadyUi = function updateScanReadyUi() {
      // Always show Ready to scan so import stays available
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
            `${pendingUnscanned.toLocaleString()} lead${pendingUnscanned === 1 ? '' : 's'} ready to scan`;
        } else {
          scanReadyCount.textContent =
            'Upload a CSV/Excel file, then start Street View + AI scan.';
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
      $('scanImportDrop')?.classList.toggle('dragover', !!active);
    }

    function wireScanImportZone() {
      const drop = $('scanImportDrop');
      const input = $('scanFileInput');
      initLeadTypeSelects?.();

      input?.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (state.running) {
          alert('Stop the scan before uploading a new file.');
          input.value = '';
          return;
        }
        await handleFile(file, {
          keepResults: $('scanImportKeepResults')?.checked !== false
        });
        input.value = '';
      });

      if (drop) {
        drop.addEventListener('dragenter', (e) => {
          if (!hasFileDrag?.(e.dataTransfer)) return;
          e.preventDefault();
          setScanDropActive(true);
        });
        drop.addEventListener('dragover', (e) => {
          if (!hasFileDrag?.(e.dataTransfer)) return;
          e.preventDefault();
          setScanDropActive(true);
        });
        drop.addEventListener('dragleave', (e) => {
          if (!drop.contains(e.relatedTarget)) setScanDropActive(false);
        });
        drop.addEventListener('drop', async (e) => {
          e.preventDefault();
          setScanDropActive(false);
          if (state.running) {
            alert('Stop the scan before uploading a new file.');
            return;
          }
          const file = fileFromDataTransfer?.(e.dataTransfer) || e.dataTransfer?.files?.[0];
          if (!file) return;
          await handleFile(file, {
            keepResults: $('scanImportKeepResults')?.checked !== false
          });
        });
        drop.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input?.click();
          }
        });
      }
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
