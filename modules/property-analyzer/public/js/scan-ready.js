// scan-ready.js — Section 1: most recent import + Start Scan
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const ib = () => PDA.lib?.importBatches;
    const im = () => PDA.lib?.importMeta;

    R.updateScanReadyUi = function updateScanReadyUi() {
      const hasRecords = state.records.length > 0;
      const show = hasRecords && !state.running;
      if (scanReadySection) scanReadySection.hidden = !show;

      if (!show) return;

      const batches = ib()?.deriveRecentImport(state.importBatches, state.records);
      let city = '';
      let stateName = '';
      let leadCount = 0;

      if (batches) {
        city = batches.city || '';
        stateName = batches.state || '';
        leadCount = Number(batches.leadCount) || 0;
        if (!leadCount && batches.id) {
          leadCount = state.records.filter((r) => r.importBatchId === batches.id).length;
        }
      }

      if (!city && !stateName) {
        const loc = im()?.deriveImportLocation(state.records);
        if (loc) {
          city = loc.city;
          stateName = loc.state;
          leadCount = loc.count || state.records.length;
        }
      }

      if (!leadCount) {
        const pending = im()?.countUnscannedLeads(state.records, state.results, recordKey);
        leadCount = pending || state.records.length;
      }

      const locationLabel = im()?.formatImportLocation({ city, state: stateName })
        || state.fileName
        || 'Imported list';

      if (scanReadyLocation) scanReadyLocation.textContent = locationLabel;
      if (scanReadyCount) {
        scanReadyCount.textContent = `${leadCount.toLocaleString()} lead${leadCount === 1 ? '' : 's'} ready to scan`;
      }

      const canStart = hasRecords && !state.running && startBtn && !startBtn.disabled;
      if (scanReadyStartBtn) scanReadyStartBtn.disabled = !canStart;
      if (reviewLeadsBtn) reviewLeadsBtn.disabled = !state.results.length;
    };

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
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireScanReady);
    } else {
      wireScanReady();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);