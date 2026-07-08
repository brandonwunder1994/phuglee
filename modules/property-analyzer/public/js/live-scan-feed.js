// live-scan-feed.js — property-by-property live scan feed
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const MAX_FEED = 50;
    const feedItems = [];

    R.resetLiveScanFeed = function resetLiveScanFeed() {
      feedItems.length = 0;
      if (liveScanFeed) liveScanFeed.innerHTML = '';
      updateLiveScanSectionUi();
    };

    R.pushLiveScanFeedItem = function pushLiveScanFeedItem({ address, status, tier, phase }) {
      const addr = shortAgentAddress(address);
      const existing = feedItems.find((item) => item.address === addr && item.phase === 'working');
      if (existing) {
        existing.status = status || existing.status;
        existing.tier = tier || existing.tier;
        existing.phase = phase || existing.phase;
        renderLiveScanFeed();
        return;
      }

      feedItems.unshift({
        address: addr,
        status: status || 'Working…',
        tier: tier || '',
        phase: phase || 'working'
      });
      while (feedItems.length > MAX_FEED) feedItems.pop();
      renderLiveScanFeed();
    };

    R.completeLiveScanFeedItem = function completeLiveScanFeedItem(address, patch = {}) {
      const addr = shortAgentAddress(address);
      let item = feedItems.find((row) => row.address === addr);
      if (!item) {
        pushLiveScanFeedItem({ address: addr, status: patch.status || 'Done', tier: patch.tier, phase: 'done' });
        return;
      }
      Object.assign(item, patch, { phase: patch.phase || 'done' });
      renderLiveScanFeed();
    };

    function renderLiveScanFeed() {
      if (!liveScanFeed) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      liveScanFeed.innerHTML = feedItems.map((item) => {
        const tierHtml = item.tier
          ? `<span class="live-scan-tier tier-${escapeHtml(item.tier)}">${escapeHtml(leadTierLabel(item.tier) || item.tier)}</span>`
          : '';
        return `<li class="live-scan-item is-${escapeHtml(item.phase || 'working')}${reducedMotion ? ' no-motion' : ''}">
          <span class="live-scan-addr">${escapeHtml(item.address)}</span>
          <span class="live-scan-status">${escapeHtml(item.status || '')}</span>
          ${tierHtml}
        </li>`;
      }).join('');
      if (!reducedMotion && liveScanFeed.firstElementChild) {
        liveScanFeed.scrollTop = 0;
      }
    }

    R.updateLiveScanSectionUi = function updateLiveScanSectionUi() {
      const show = !!state.running;
      if (liveScanSection) liveScanSection.hidden = !show;
      if (stopBtn) stopBtn.hidden = !show;

      if (!show) return;
      const total = state.records.length || 0;
      const done = state.processed || 0;
      if (liveScanProgress) {
        liveScanProgress.textContent = `${done.toLocaleString()} / ${total.toLocaleString()}`;
      }
    };

    const origScanPreview = R.scanPreview;
    if (typeof origScanPreview === 'function') {
      R.scanPreview = function scanPreview(address, status, streetViewUrl, satelliteUrl, score, animateGauge, workerNum) {
        origScanPreview(address, status, streetViewUrl, satelliteUrl, score, animateGauge, workerNum);
        pushLiveScanFeedItem({ address, status: status || 'Analyzing…', phase: 'working' });
        updateLiveScanSectionUi();
      };
    }

    const origUpdateScanRunningUi = R.updateScanRunningUi;
    if (typeof origUpdateScanRunningUi === 'function') {
      R.updateScanRunningUi = function updateScanRunningUiWrapped() {
        origUpdateScanRunningUi();
        updateLiveScanSectionUi();
        updateScanReadyUi?.();
        if (!state.running) resetLiveScanFeed();
      };
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);