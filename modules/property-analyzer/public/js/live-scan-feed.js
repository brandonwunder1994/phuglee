// live-scan-feed.js — property-by-property live scan feed + live KPIs / stop
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {
    const MAX_FEED = 50;
    const feedItems = [];

    function requestStopScan() {
      if (!state.running) return;
      state.aborted = true;
      if (stopBtn) stopBtn.disabled = true;
      const liveStop = $('liveScanStopBtn');
      const readyStop = $('scanReadyStopBtn');
      if (liveStop) liveStop.disabled = true;
      if (readyStop) readyStop.disabled = true;
      // Immediate durable save so refresh keeps everything already finished
      try {
        state.processed = (state.results || []).length;
        if (typeof persistScanProgressNow === 'function') {
          persistScanProgressNow('scan-stop');
        } else if (typeof flushSaveSession === 'function') {
          sessionDirty = true;
          flushSaveSession({ sync: true, force: true, reason: 'scan-stop' });
        }
      } catch (e) {
        console.warn('[scan] stop save failed', e);
      }
      log?.(
        `Stopping after current properties finish… ` +
        `${Number(state.scanBatchDone) || 0} of ${Number(state.scanBatchTotal) || 0} this list saved ` +
        `(${(state.results || []).length.toLocaleString()} total in session).`
      );
      updateLiveScanSectionUi();
      updateScanReadyUi?.();
    }

    R.requestStopScan = requestStopScan;

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
        const tierKey = item.tier || '';
        const uiLabel = (typeof tierUiLabel === 'function' && tierKey)
          ? tierUiLabel(tierKey)
          : (leadTierLabel(tierKey) || tierKey);
        const tierHtml = tierKey
          ? `<span class="live-scan-tier tier-${escapeHtml(tierKey)}">${escapeHtml(uiLabel)}</span>`
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
      // Live KPIs are scan-time truth only; session strip owns post-scan buckets
      const show = !!state.running;
      if (liveScanSection) liveScanSection.hidden = !show;
      if (stopBtn) stopBtn.hidden = !show;

      const liveStop = $('liveScanStopBtn');
      const readyStop = $('scanReadyStopBtn');
      const readyStart = scanReadyStartBtn || $('scanReadyStartBtn');
      if (liveStop) {
        liveStop.hidden = !show;
        liveStop.disabled = !show || !!state.aborted;
      }
      if (readyStop) {
        readyStop.hidden = !show;
        readyStop.disabled = !show || !!state.aborted;
      }
      if (readyStart && show) {
        readyStart.disabled = true;
      }

      // When idle, applyAnalyzeVisibility owns zone visibility; do not paint live KPI grid
      if (!show) return;

      // THIS list progress (not historical session total vs queue size)
      const batchTotal = Number(state.scanBatchTotal) || 0;
      const batchDone = Number(state.scanBatchDone) || 0;
      const sessionTotal = (state.results || []).length || 0;
      if (liveScanProgress) {
        if (batchTotal > 0) {
          liveScanProgress.textContent =
            `${batchDone.toLocaleString()} / ${batchTotal.toLocaleString()} this list` +
            (sessionTotal ? ` · ${sessionTotal.toLocaleString()} saved total` : '');
        } else {
          liveScanProgress.textContent = `${sessionTotal.toLocaleString()} saved`;
        }
      }

      // Live KPIs — four primary buckets + scanned (Needs Review residual only)
      let distressed = 0;
      let wellMaintained = 0;
      let land = 0;
      let blocked = 0;
      let review = 0;
      let scanned = sessionTotal;
      try {
        if (typeof getSummaryMetrics === 'function') {
          const m = getSummaryMetrics();
          distressed = Number(m?.counts?.distressed) || 0;
          wellMaintained = Number(m?.counts?.well_maintained) || 0;
          land = Number(m?.counts?.vacant) || 0;
          blocked = Number(m?.counts?.blurred) || 0;
          review = Number(m?.counts?.review) || 0;
          scanned = Number(m?.total) || scanned;
        } else if (typeof getTierCounts === 'function') {
          const c = getTierCounts({ global: true });
          distressed = Number(c?.distressed) || 0;
          wellMaintained = Number(c?.well_maintained) || 0;
          land = Number(c?.vacant) || 0;
          blocked = Number(c?.blurred) || 0;
          review = Number(c?.review) || 0;
        }
      } catch (_) {}

      const elD = $('liveScanKpiDistressed');
      const elWm = $('liveScanKpiWellMaintained');
      const elL = $('liveScanKpiLand');
      const elB = $('liveScanKpiBlocked');
      const elR = $('liveScanKpiReview');
      const elRw = $('liveScanKpiReviewWrap');
      const elS = $('liveScanKpiScanned');
      const elW = $('liveScanKpiWorkers');
      if (elD) elD.textContent = distressed.toLocaleString();
      if (elWm) elWm.textContent = wellMaintained.toLocaleString();
      if (elL) elL.textContent = land.toLocaleString();
      if (elB) elB.textContent = blocked.toLocaleString();
      if (elR) elR.textContent = review.toLocaleString();
      if (elRw) elRw.hidden = review <= 0;
      if (elS) elS.textContent = scanned.toLocaleString();

      const configured = typeof getConcurrentLimit === 'function' ? getConcurrentLimit() : 0;
      const effective = typeof getEffectiveConcurrentLimit === 'function'
        ? getEffectiveConcurrentLimit()
        : configured;
      const active = typeof countActiveWorkers === 'function' ? countActiveWorkers() : 0;
      if (elW) {
        elW.textContent = `${active}/${effective}`;
        elW.title = configured !== effective
          ? `Auto-throttled: ${configured} set → ${effective} effective`
          : `${effective} parallel workers (max you set)`;
        elW.parentElement?.classList.toggle('is-throttled', effective < configured);
      }

      const meta = $('liveScanMeta');
      if (meta) {
        const parts = [];
        if (batchTotal > 0) {
          parts.push(`${batchDone.toLocaleString()} of ${batchTotal.toLocaleString()} on this list done (saved)`);
        }
        parts.push(`${sessionTotal.toLocaleString()} total in session`);
        if (state.aborted) {
          parts.push('stopping after current properties…');
        } else if (Date.now() < (rateLimitUntil || 0)) {
          const sec = Math.ceil((rateLimitUntil - Date.now()) / 1000);
          parts.push(`rate-limit pause ~${sec}s`);
        } else if (effective < configured) {
          parts.push(`workers ${effective} (auto-throttled)`);
        } else {
          parts.push(`${effective} workers`);
        }
        meta.textContent = parts.filter(Boolean).join(' · ');
      }
    };

    function wireLiveScanControls() {
      $('liveScanStopBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        requestStopScan();
      });
      $('scanReadyStopBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        requestStopScan();
      });
    }

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

    const origFlush = R.flushThrottledUi;
    if (typeof origFlush === 'function') {
      R.flushThrottledUi = function flushThrottledUiWrapped(force) {
        origFlush(force);
        if (state.running) updateLiveScanSectionUi();
      };
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireLiveScanControls);
    } else {
      wireLiveScanControls();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
