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
      // Total still waiting for Street View / satellite AI (not already in results)
      const pendingUnscanned = typeof recordKey === 'function'
        ? (im()?.countUnscannedLeads(state.records, state.results, recordKey) || 0)
        : 0;
      const show = hasRecords && !state.running && pendingUnscanned > 0;
      if (scanReadySection) scanReadySection.hidden = !show;

      if (!show) return;

      const batches = ib()?.deriveRecentImport(state.importBatches, state.records);
      let city = '';
      let stateName = '';
      let sourceFile = String(state.fileName || batches?.sourceFile || '').trim();

      // If many batches share the same import (e.g. New Analyzer Leads), roll up label
      const recentAt = Number(batches?.importedAt) || 0;
      if (recentAt && Array.isArray(state.importBatches)) {
        const sameWave = state.importBatches.filter(
          (b) => Math.abs((Number(b.importedAt) || 0) - recentAt) < 60_000
        );
        if (sameWave.length > 1) {
          sourceFile = sameWave.find((b) => b.sourceFile)?.sourceFile || sourceFile;
          city = '';
          stateName = '';
        }
      }

      if (batches && sameWaveIsSingleLocation(batches, state.importBatches)) {
        city = batches.city || '';
        stateName = batches.state || '';
      }

      if (!city && !stateName && !sourceFile) {
        const loc = im()?.deriveImportLocation(state.records);
        if (loc) {
          city = loc.city;
          stateName = loc.state;
        }
      }

      // Always show full unscanned queue — not a single batch's leadCount (was showing 41 of 5,291)
      const leadCount = pendingUnscanned || state.records.length;

      const locationLabel = sourceFile
        || im()?.formatImportLocation({ city, state: stateName })
        || 'Imported list';

      if (scanReadyLocation) scanReadyLocation.textContent = locationLabel;
      if (scanReadyCount) {
        scanReadyCount.textContent = `${leadCount.toLocaleString()} lead${leadCount === 1 ? '' : 's'} ready to scan`;
      }

      const canStart = pendingUnscanned > 0 && !state.running && startBtn && !startBtn.disabled;
      if (scanReadyStartBtn) scanReadyStartBtn.disabled = !canStart;
      if (reviewLeadsBtn) reviewLeadsBtn.disabled = !state.results.length;
    };

    function sameWaveIsSingleLocation(recent, allBatches) {
      if (!recent) return false;
      const recentAt = Number(recent.importedAt) || 0;
      const wave = (allBatches || []).filter(
        (b) => Math.abs((Number(b.importedAt) || 0) - recentAt) < 60_000
      );
      if (wave.length <= 1) return true;
      const cities = new Set(wave.map((b) => String(b.city || '').trim().toLowerCase()).filter(Boolean));
      return cities.size <= 1;
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
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireScanReady);
    } else {
      wireScanReady();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);