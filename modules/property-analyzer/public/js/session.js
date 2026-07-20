// session.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  if (typeof window !== 'undefined') window.PDA = PDA;
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {

R.resetSavedAppData = async function resetSavedAppData() {
  const ok = window.DistressPersistence
    ? await DistressPersistence.confirmDestructive(
      'Reset saved browser data?',
      'This DELETES scan progress in the browser. Server backup files on disk are kept.'
    )
    : confirm('This DELETES your scan progress in the browser (server backup files are kept). Continue?');
  if (!ok) return;
  if (prompt('Type DELETE to confirm') !== 'DELETE') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('distressAnalyzerKeys');
    localStorage.removeItem(CORRECTIONS_KEY);
    localStorage.removeItem(CATEGORY_CORRECTIONS_KEY);
    localStorage.removeItem(TIER_CORRECTIONS_KEY);
    localStorage.removeItem(LEARNED_RULES_KEY);
    localStorage.removeItem(CORRECTION_EVENTS_KEY);
  } catch (_) {}
  openSessionIdb().then((db) => {
    const tx = db.transaction(SESSION_IDB_STORE, 'readwrite');
    tx.objectStore(SESSION_IDB_STORE).delete(STORAGE_KEY);
  }).catch(() => {}).finally(() => location.reload());
}

R.openBucketReviewFromKpi = function openBucketReviewFromKpi(filter) {
  if (typeof openReviewMode !== 'function') return;
  if (state.reviewMode && state.reviewFilter === filter) {
    if (typeof showReviewOverlay === 'function') showReviewOverlay();
    if (typeof renderReviewLead === 'function') renderReviewLead();
    return;
  }
  openReviewMode(filter);
}

R.bindDistressedSummaryClick = function bindDistressedSummaryClick(el) {
  el?.addEventListener('click', (e) => {
    e.preventDefault();
    openBucketReviewFromKpi('distressed');
  });
}
R.setViewMode = function setViewMode(mode, save = true) {
  const changed = state.viewMode !== mode;
  state.viewMode = mode;
  if (changed) resetVirtualScrollPosition();
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  $('cardsView')?.classList.toggle('active', mode === 'cards');
  $('tableView')?.classList.toggle('active', mode === 'table');
  if (changed && state.results.length) renderResults({ force: true });
  if (save) scheduleSaveSession();
}

R.tierCountsCache = null;
R.tierCountsCacheKey = '';
R.resultMutationEpoch = 0;

R.tierCountsCacheKeyFromState = function tierCountsCacheKeyFromState(scope = 'market') {
  const loc = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.locationIndex)
    ? PDA.lib.locationIndex.locationFilterKey(state.locationFilter)
    : (state.locationFilter ? `${state.locationFilter.state}|${state.locationFilter.city || ''}` : '');
  const dates = (state.importDateFilter || []).slice().sort().join(',');
  const leadType = state.leadTypeFilter || 'all';
  return `${scope}:${state.results.length}:${state.processed}:${sessionLoadState.total}:${sessionLoadState.complete}:${loc}|${dates}|${leadType}|${resultMutationEpoch}`;
}

R.getTotalScannedCount = function getTotalScannedCount() {
  // Session total = analyzed results only. Prefer server canonical while pages hydrate.
  // Never use stale `processed` meta (historically a high-water mark after purges).
  const canonical = Math.max(
    Number(sessionLoadState?.serverCanonical) || 0,
    Number(sessionLoadState?.total) || 0,
    Number(state._tierCountsFromServer?.all) || 0,
    Number(state._scanBaselineTierCounts?.all) || 0
  );
  const loaded = (state.results || []).length;
  if (state.running) {
    const baseline = Number(state.scanBaselineResults) || 0;
    const batchDone = Number(state.scanBatchDone) || 0;
    return Math.max(canonical, baseline + batchDone, loaded);
  }
  if (!sessionLoadState?.complete && canonical > 0) {
    return Math.max(canonical, loaded);
  }
  return Math.max(loaded, canonical);
}

R.normalizeTierCountsForDisplay = function normalizeTierCountsForDisplay(counts, totalHint) {
  if (!counts || typeof counts !== 'object') return counts;
  const total = Math.max(Number(totalHint) || 0, getTotalScannedCount(), Number(counts.all) || 0);
  if (!total || counts.all === total) return counts;
  return { ...counts, all: total };
}

R.countTierBuckets = function countTierBuckets(results, totalHint) {
  const list = results || [];
  let all = totalHint != null ? totalHint : list.length;
  let distressed = 0;
  let well_maintained = 0;
  let vacant = 0;
  let blurred = 0;
  let review = 0;
  let satellite_only = 0;
  for (const r of list) {
    if (r?.satelliteOnly) {
      satellite_only++;
      continue;
    }
    if (computeNeedsReview(r)) review++;
    if (isBlurredImagery(r)) blurred++;
    if (!isClassifiedResult(r)) continue;
    const cat = resultCategory(r);
    if (cat === 'vacant_lot') {
      vacant++;
      continue;
    }
    if (isBlurredImagery(r)) continue;
    if (cat !== 'property') continue;
    const tier = resultLeadTier(r);
    if (tier === 'distressed') distressed++;
    else if (tier === 'well_maintained') well_maintained++;
  }
  return { all, distressed, well_maintained, vacant, blurred, review, satellite_only };
}

/**
 * Bucket counts for THIS scan run only (starts at 0 when the run begins).
 * Used by live KPI strip — never merges historical session totals.
 */
R.getScanBatchTierCounts = function getScanBatchTierCounts() {
  const startedAt = Number(state.scanStartedAt) || 0;
  const batchDone = Math.max(0, Number(state.scanBatchDone) || 0);
  if (!startedAt) {
    return { all: 0, distressed: 0, well_maintained: 0, vacant: 0, blurred: 0, review: 0, satellite_only: 0 };
  }
  const keySet = state._scanBatchResultKeys;
  const batchNew = (state.results || []).filter((r) => {
    const k = typeof recordKey === 'function' ? recordKey(r) : '';
    if (keySet && keySet.size && k && keySet.has(k)) return true;
    return Number(r.analyzedAt || r.savedAt || 0) >= startedAt - 60_000;
  });
  return countTierBuckets(batchNew, Math.max(batchDone, batchNew.length));
};

/** Zero-paint live scan KPI DOM before the first result arrives. */
R.zeroPaintLiveScanKpis = function zeroPaintLiveScanKpis() {
  const ids = [
    'liveScanKpiDistressed',
    'liveScanKpiWellMaintained',
    'liveScanKpiLand',
    'liveScanKpiBlocked',
    'liveScanKpiScanned',
    'liveScanKpiReview'
  ];
  for (const id of ids) {
    const el = $(id);
    if (el) el.textContent = '0';
  }
  const wrap = $('liveScanKpiReviewWrap');
  if (wrap) wrap.hidden = true;
};

/**
 * Awaiting-review queue sizes (still need Keep/Change).
 * Uses the same exclusion rules as Review Leads.
 */
R.AWAITING_REVIEW_FILTERS = ['distressed', 'well_maintained', 'vacant', 'blurred', 'review', 'satellite_only'];

R.getAwaitingReviewBucketCounts = function getAwaitingReviewBucketCounts(opts = {}) {
  const all = Math.max(
    getTotalScannedCount(),
    (state.results || []).length,
    Number(state._tierCountsFromServer?.all) || 0
  );

  // Prefer server single-pass awaiting counts when:
  // - full hydrate is not ready yet, OR
  // - we just refreshed them (fresh < 45s) after Exit Review / Keep batch
  // so the KPI strip can show 0 without waiting on 16k client scans.
  const server = state._awaitingCountsFromServer;
  const serverAge = server?.at ? (Date.now() - Number(server.at)) : Infinity;
  const hydrated = !!(sessionLoadState?.complete && (state.results || []).length > 0);
  const preferServer = !!opts.preferServer
    || !hydrated
    || (server?.awaiting && serverAge < 45_000);
  if (preferServer && server && server.awaiting) {
    const a = server.awaiting;
    return {
      all: Math.max(all, Number(server.scanned) || 0),
      distressed: Number(a.distressed) || 0,
      well_maintained: Number(a.well_maintained) || 0,
      vacant: Number(a.vacant) || 0,
      blurred: Number(a.blurred) || 0,
      review: Number(a.review) || 0,
      satellite_only: Number(a.satellite_only) || 0,
      _source: 'server'
    };
  }

  const snaps = buildAllReviewSnapshots();
  return {
    all,
    distressed: Number(snaps.distressed?.pending) || 0,
    well_maintained: Number(snaps.well_maintained?.pending) || 0,
    vacant: Number(snaps.vacant?.pending) || 0,
    blurred: Number(snaps.blurred?.pending) || 0,
    review: Number(snaps.review?.pending) || 0,
    satellite_only: Number(snaps.satellite_only?.pending) || 0,
    _source: 'client'
  };
};

/** Fetch server-computed awaiting-review bucket counts (single pass over disk session). */
R.fetchAwaitingCounts = async function fetchAwaitingCounts(opts = {}) {
  if (typeof USE_PROXY !== 'undefined' && !USE_PROXY && !opts.force) return state._awaitingCountsFromServer || null;
  try {
    const fetcher = typeof apiFetch === 'function' ? apiFetch : fetch;
    const res = await fetcher('/api/session-awaiting-counts', { cache: 'no-store' });
    if (!res || !res.ok) return null;
    const body = await res.json().catch(() => null);
    if (!body || !body.ok || !body.awaiting) return null;
    state._awaitingCountsFromServer = {
      scanned: Number(body.scanned) || 0,
      awaiting: body.awaiting,
      totalInFilter: body.totalInFilter || {},
      at: Date.now()
    };
    // Refresh Review primary CTA count once server awaiting is known.
    try { updateScanReadyUi?.(); } catch (_) {}
    return state._awaitingCountsFromServer;
  } catch (_) {
    return null;
  }
};

R.VAULT_META_CACHE_MS = 45_000;

/** Fetch The Vault catalog meta (byType / total). Cached ~45s. */
R.fetchVaultMeta = async function fetchVaultMeta(opts = {}) {
  const force = !!opts.force;
  const cached = state._vaultMeta;
  const cachedAt = Number(state._vaultMetaAt) || 0;
  if (!force && cached && (Date.now() - cachedAt) < (R.VAULT_META_CACHE_MS || 45_000)) {
    return cached;
  }
  try {
    const headers = { Accept: 'application/json' };
    try {
      const user = sessionStorage.getItem('phuglee_session') || 'admin';
      headers['X-Phuglee-User'] = user;
      headers['X-Phuglee-Plan'] = sessionStorage.getItem('phuglee_plan')
        || (user === 'admin' ? 'max' : 'max');
    } catch (_) {
      headers['X-Phuglee-User'] = 'admin';
      headers['X-Phuglee-Plan'] = 'max';
    }
    const res = await fetch('/api/leads/meta', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers
    });
    if (!res.ok) {
      state._vaultMeta = null;
      state._vaultMetaAt = Date.now();
      state._vaultMetaError = `HTTP ${res.status}`;
      return null;
    }
    const body = await res.json().catch(() => null);
    const meta = body?.meta || body;
    if (!meta || typeof meta !== 'object') {
      state._vaultMeta = null;
      state._vaultMetaAt = Date.now();
      state._vaultMetaError = 'bad_payload';
      return null;
    }
    state._vaultMeta = meta;
    state._vaultMetaAt = Date.now();
    state._vaultMetaError = null;
    return meta;
  } catch (err) {
    state._vaultMeta = null;
    state._vaultMetaAt = Date.now();
    state._vaultMetaError = err?.message || 'fetch_failed';
    return null;
  }
};

R.invalidateVaultMetaCache = function invalidateVaultMetaCache() {
  delete state._vaultMeta;
  delete state._vaultMetaAt;
  delete state._vaultMetaError;
};

R.paintVaultSummaryRow = function paintVaultSummaryRow(meta, opts = {}) {
  const instant = opts.instant !== false;
  const animOpts = instant ? { instant: true } : { duration: 450 };
  const byType = meta?.byType || {};
  const available = !!(meta && typeof meta === 'object' && !state._vaultMetaError);

  const setVal = (id, n) => {
    const el = $(id);
    if (!el) return;
    if (!available) {
      el.textContent = '—';
      return;
    }
    if (typeof animateStatNumber === 'function') {
      animateStatNumber(el, n, animOpts);
    } else {
      el.textContent = Number(n || 0).toLocaleString();
    }
  };

  const distressed = Number(byType.distressed) || 0;
  const wm = Number(byType.well_maintained) || 0;
  const land = Number(byType.land) || 0;
  const total = Number(meta?.catalogTotal ?? meta?.total) || (distressed + wm + land);

  setVal('sumVaultDistressed', distressed);
  setVal('sumVaultWellMaintained', wm);
  setVal('sumVaultLand', land);
  setVal('sumVaultTotal', total);
  if (typeof updateVaultStripMeta === 'function') {
    updateVaultStripMeta(available ? total : null);
  }

  const row = $('summaryVaultRow');
  if (row) {
    row.hidden = false;
    row.classList.toggle('is-unavailable', !available);
    row.title = available
      ? 'Approved leads in The Vault catalog'
      : 'Vault totals unavailable — check Max plan / login';
  }
  const collapse = $('summaryVaultCollapse');
  if (collapse) collapse.classList.toggle('is-unavailable', !available);
};

/** Refresh Vault strip (force refetch). Safe to call fire-and-forget. */
R.refreshVaultSummaryRow = async function refreshVaultSummaryRow(opts = {}) {
  if (opts.force) invalidateVaultMetaCache();
  const meta = await fetchVaultMeta({ force: !!opts.force });
  paintVaultSummaryRow(meta, { instant: opts.instant !== false });
  return meta;
};

R.getResultsForMarketTierCounts = function getResultsForMarketTierCounts() {
  const li = PDA.lib?.locationIndex;
  const ib = PDA.lib?.importBatches;
  if (!state.locationFilter || !li?.filterResultsForMarket) return state.results;
  return li.filterResultsForMarket(state.results, {
    locationFilter: state.locationFilter,
    importDateFilter: state.importDateFilter,
    leadTypeFilter: state.leadTypeFilter
  }, {
    normalizeStateAbbr,
    matchesImportDateFilter: ib?.matchesImportDateFilter,
    resultLeadType
  });
}

/** Look up server-computed geo tier bucket for the active location filter. */
R.getServerGeoTierBucket = function getServerGeoTierBucket(filter = state.locationFilter) {
  const geo = state._geoFromServer;
  if (!geo || !filter) return null;
  if (filter.state === '__unknown__' || filter.state === (PDA.lib?.locationIndex?.UNKNOWN_STATE)) {
    return geo.unknownTier || null;
  }
  const abbr = normalizeStateAbbr(filter.state) || filter.state;
  const states = Array.isArray(geo.states) ? geo.states : [];
  const st = states.find((s) => s.abbr === abbr);
  if (!st) return null;
  if (!filter.city) return st.tierCounts || null;
  const cityName = String(filter.city).trim().toLowerCase();
  const city = (st.cities || []).find((c) => String(c.name || '').trim().toLowerCase() === cityName);
  return city?.tierCounts || null;
};

R.getTierCounts = function getTierCounts(opts = {}) {
  const useGlobal = opts.global === true || !state.locationFilter;
  const scope = useGlobal ? 'global' : 'market';
  const totalScanned = getTotalScannedCount();

  // Live scan: keep pre-scan server buckets + add only this-run results (partial pages lie).
  if (
    useGlobal
    && state.running
    && state._scanBaselineTierCounts
    && Number(state.scanStartedAt) > 0
  ) {
    const baseline = state._scanBaselineTierCounts;
    const startedAt = Number(state.scanStartedAt);
    const batchNew = (state.results || []).filter(
      (r) => Number(r.analyzedAt || r.savedAt || 0) >= startedAt - 60_000
    );
    const delta = countTierBuckets(batchNew, batchNew.length);
    const merged = {
      all: Math.max(Number(baseline.all) || 0, 0) + (Number(state.scanBatchDone) || batchNew.length),
      distressed: (Number(baseline.distressed) || 0) + (Number(delta.distressed) || 0),
      well_maintained: (Number(baseline.well_maintained) || 0) + (Number(delta.well_maintained) || 0),
      vacant: (Number(baseline.vacant) || 0) + (Number(delta.vacant) || 0),
      blurred: (Number(baseline.blurred) || 0) + (Number(delta.blurred) || 0),
      review: (Number(baseline.review) || 0) + (Number(delta.review) || 0),
      satellite_only: (Number(baseline.satellite_only) || 0) + (Number(delta.satellite_only) || 0)
    };
    return normalizeTierCountsForDisplay(merged, merged.all);
  }

  // Prefer authoritative server KPIs until the full result set is hydrated
  if (useGlobal && state._tierCountsFromServer && (!sessionLoadState.complete || !state.results.length)) {
    return normalizeTierCountsForDisplay(state._tierCountsFromServer, totalScanned);
  }
  if (!useGlobal && state._geoFromServer && !sessionLoadState.complete) {
    // Server geo is full-market; skip when extra filters need client recompute
    const hasDateFilter = (state.importDateFilter || []).length > 0;
    const hasLeadType = state.leadTypeFilter && state.leadTypeFilter !== 'all';
    if (!hasDateFilter && !hasLeadType) {
      const bucket = getServerGeoTierBucket(state.locationFilter);
      if (bucket) return normalizeTierCountsForDisplay(bucket, bucket.all);
    }
  }
  // After full load (or no server snapshot): recompute from in-memory results
  if (useGlobal && sessionLoadState.complete && state._tierCountsFromServer && state.results.length) {
    // Keep server snapshot only as fallback if recompute would under-count mid-hydration race
    if (state.results.length < (sessionLoadState.total || 0)) {
      return normalizeTierCountsForDisplay(state._tierCountsFromServer, totalScanned);
    }
  }
  const key = tierCountsCacheKeyFromState(scope);
  if (tierCountsCache && tierCountsCacheKey === key) return tierCountsCache;
  const sourceResults = useGlobal ? state.results : getResultsForMarketTierCounts();
  const allHint = useGlobal ? (totalScanned || state.results.length) : sourceResults.length;
  tierCountsCache = countTierBuckets(sourceResults, allHint);
  tierCountsCacheKey = key;
  return tierCountsCache;
}

R.filteredResultsCache = null;
R.filteredResultsCacheKey = '';

R.filteredResultsCacheKeyFromState = function filteredResultsCacheKeyFromState() {
  const loc = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.locationIndex)
    ? PDA.lib.locationIndex.locationFilterKey(state.locationFilter)
    : (state.locationFilter ? `${state.locationFilter.state}|${state.locationFilter.city || ''}` : '');
  const dates = (state.importDateFilter || []).slice().sort().join(',');
  return `${state.filter}|${state.leadTypeFilter || 'all'}|${(state.searchQuery || '').trim().toLowerCase()}|${loc}|${dates}|${state.results.length}|${state.processed}|${state.sortMode}|${resultMutationEpoch}`;
}

R.invalidateFilteredResultsCache = function invalidateFilteredResultsCache() {
  filteredResultsCache = null;
  filteredResultsCacheKey = '';
}

R.notifyResultMutation = function notifyResultMutation(opts = {}) {
  resultMutationEpoch++;
  // Do NOT wipe server KPI snapshots on filter/location changes — only when results change.
  if (opts.clearServerTierCounts) {
    delete state._tierCountsFromServer;
    delete state._geoFromServer;
  }
  tierCountsCache = null;
  tierCountsCacheKey = '';
  invalidateFilteredResultsCache();
  if (!opts.keepReviewSnapshot) invalidateReviewSnapshotCache();
}

R.reviewSnapshotCache = null;
R.reviewSnapshotCacheKey = '';

R.reviewSnapshotCacheKeyFromState = function reviewSnapshotCacheKeyFromState() {
  return `${state.results.length}:${resultMutationEpoch}`;
}

R.invalidateReviewSnapshotCache = function invalidateReviewSnapshotCache() {
  reviewSnapshotCache = null;
  reviewSnapshotCacheKey = '';
}

R.isClassifiedResultFast = function isClassifiedResultFast(r) {
  if (!r) return false;
  if (isBlurredImagery(r)) return true;
  if (r.reviewResolved) return true;
  if (r.manuallyReviewed && !r.needsReviewLater) return true;
  if (r.needsReviewLater) return false;
  return isClassifiedResult(r);
}

R.fastPropertyLeadTier = function fastPropertyLeadTier(r) {
  if (!r?.leadTier) return null;
  const t = String(r.leadTier).toLowerCase().replace('well-maintained', 'well_maintained');
  if (t === 'distressed' || t === 'hot_lead') return 'distressed';
  if (t === 'well_maintained') return 'well_maintained';
  return null;
}

R.scanReviewFilterSnapshot = function scanReviewFilterSnapshot(filter) {
  const key = reviewSnapshotCacheKeyFromState();
  if (reviewSnapshotCache && reviewSnapshotCacheKey === key && reviewSnapshotCache[filter]) {
    return reviewSnapshotCache[filter];
  }
  let total = 0;
  let pending = 0;
  let reviewedInFilter = 0;
  const pendingKeys = [];
  const allKeys = [];
  for (const r of state.results) {
    if (!matchesReviewFilter(r, filter)) continue;
    total++;
    const rk = recordKey(r);
    allKeys.push(rk);
    if (isExcludedFromAllReviewQueues(r, rk, filter)) {
      reviewedInFilter++;
    } else {
      pending++;
      pendingKeys.push(rk);
    }
  }
  const snap = { total, pending, reviewedInFilter, pendingKeys, allKeys };
  if (!reviewSnapshotCache || reviewSnapshotCacheKey !== key) {
    reviewSnapshotCache = {};
    reviewSnapshotCacheKey = key;
  }
  reviewSnapshotCache[filter] = snap;
  return snap;
}

/**
 * Build snapshots for every awaiting-review bucket in a single pass over state.results
 * (computes recordKey once per row instead of once per filter). Populates the shared
 * reviewSnapshotCache so later per-filter calls hit the cache. Same semantics as
 * scanReviewFilterSnapshot called per filter.
 */
R.buildAllReviewSnapshots = function buildAllReviewSnapshots() {
  const key = reviewSnapshotCacheKeyFromState();
  const filters = R.AWAITING_REVIEW_FILTERS;
  const cacheFresh = reviewSnapshotCache && reviewSnapshotCacheKey === key;
  if (cacheFresh && filters.every((f) => reviewSnapshotCache[f])) {
    return reviewSnapshotCache;
  }
  const snaps = {};
  for (const f of filters) {
    snaps[f] = { total: 0, pending: 0, reviewedInFilter: 0, pendingKeys: [], allKeys: [] };
  }
  for (const r of state.results) {
    const rk = recordKey(r);
    for (const f of filters) {
      if (!matchesReviewFilter(r, f)) continue;
      const s = snaps[f];
      s.total++;
      s.allKeys.push(rk);
      if (isExcludedFromAllReviewQueues(r, rk, f)) {
        s.reviewedInFilter++;
      } else {
        s.pending++;
        s.pendingKeys.push(rk);
      }
    }
  }
  if (!reviewSnapshotCache || reviewSnapshotCacheKey !== key) {
    reviewSnapshotCache = {};
    reviewSnapshotCacheKey = key;
  }
  for (const f of filters) reviewSnapshotCache[f] = snaps[f];
  return reviewSnapshotCache;
}

R.invalidateTierCountsCache = function invalidateTierCountsCache(opts = {}) {
  tierCountsCache = null;
  tierCountsCacheKey = '';
  if (opts.clearServer) {
    delete state._tierCountsFromServer;
    delete state._geoFromServer;
  }
}

R.getDisplayCap = function getDisplayCap() {
  if (state.running) return MAX_LIVE_DOM_CARDS;
  const initial = getDisplayLimitInitial();
  return Math.max(initial, state.displayLimit || initial);
}

R.updateLoadMoreBar = function updateLoadMoreBar(filteredTotal, shown) {
  if (!resultsLoadMore || !resultsLoadMoreBtn || !resultsLoadMoreHint) return;
  if (state.running || state.viewMode !== 'cards') {
    resultsLoadMore.hidden = true;
    return;
  }
  const remaining = Math.max(0, filteredTotal - shown);
  if (remaining <= 0) {
    resultsLoadMore.hidden = true;
    return;
  }
  resultsLoadMore.hidden = false;
  const step = Math.min(getDisplayLimitStep(), remaining);
  if (document.body.classList.contains('analyze-phuglee')) {
    resultsLoadMoreBtn.textContent = `Load next ${step}`;
    resultsLoadMoreHint.textContent = `Showing ${shown.toLocaleString()} of ${filteredTotal.toLocaleString()} properties`;
  } else {
    resultsLoadMoreBtn.textContent = `Load ${step.toLocaleString()} more`;
    resultsLoadMoreHint.textContent = `Showing ${shown.toLocaleString()} of ${filteredTotal.toLocaleString()} in this view`;
  }
}

R.tierUiLabel = function tierUiLabel(key) {
  const lib = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.tierLabels) || null;
  if (lib && typeof lib.tierUiLabel === 'function') return lib.tierUiLabel(key);
  return (FILTER_LABELS && FILTER_LABELS[key]) || String(key || '').replace(/_/g, ' ') || '—';
}

R.categoryLabelWithCount = function categoryLabelWithCount(filter, count) {
  const base = tierUiLabel(filter);
  return `${base} (${count})`;
}

R.updateFilterLabels = function updateFilterLabels() {
  const counts = getTierCounts();
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    const f = btn.dataset.filter;
    if (counts[f] !== undefined) {
      btn.textContent = categoryLabelWithCount(f, counts[f]);
    }
  });
  const lbl = (id, filter, count) => {
    const el = document.querySelector(`#${id} .summary-lbl`);
    if (el) el.textContent = categoryLabelWithCount(filter, count);
  };
  // KPI tiles are the review entry point (Review Leads dropdown removed).
  lbl('sumDistressedKpiCard', 'distressed', counts.distressed);
  lbl('sumWellMaintainedCard', 'well_maintained', counts.well_maintained);
  lbl('sumVacantCard', 'vacant', counts.vacant);
  lbl('sumReviewCard', 'review', counts.review);
  lbl('sumBlurredCard', 'blurred', counts.blurred);
}

R.formatTierRate = function formatTierRate(count, total) {
  return total ? `${Math.round((count / total) * 100)}%` : '0%';
}

R.getSummaryMetrics = function getSummaryMetrics() {
  const counts = getTierCounts({ global: true });
  const total = getTotalScannedCount();
  const callableHomes = counts.distressed + counts.well_maintained;
  const distressedRate = callableHomes ? counts.distressed / callableHomes : 0;
  return { total, counts, callableHomes, distressedRate };
}

R.updateScannedCountUi = function updateScannedCountUi() {}

R.buildSummaryIntro = function buildSummaryIntro(metrics) {
  const { total, counts } = metrics;
  const parts = [];
  const batchTotal = Number(state.scanBatchTotal) || 0;
  const batchDone = Number(state.scanBatchDone) || 0;
  if (state.running && batchTotal > 0) {
    parts.push(`${batchDone.toLocaleString()} of ${batchTotal.toLocaleString()} on this list`);
    parts.push(`${total.toLocaleString()} total saved`);
  } else if (state.running && state.records.length) {
    parts.push(`${total.toLocaleString()} saved · ${state.records.length.toLocaleString()} in queue`);
  } else {
    parts.push(`${total.toLocaleString()} scanned`);
  }
  if (counts.distressed) parts.push(`${counts.distressed.toLocaleString()} distressed`);
  if (counts.well_maintained) parts.push(`${counts.well_maintained.toLocaleString()} well maintained`);
  if (counts.vacant) parts.push(`${counts.vacant.toLocaleString()} land`);
  if (counts.blurred) parts.push(`${counts.blurred.toLocaleString()} blocked`);
  if (counts.review) parts.push(`${counts.review.toLocaleString()} residual review`);
  return parts.join(' · ');
}

R.animateStatNumber = function animateStatNumber(el, value, opts = {}) {
  if (!el) return;
  const suffix = opts.suffix || '';
  const target = Math.max(0, Math.round(Number(value) || 0));
  const instant = opts.instant || opts.duration === 0;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (instant || reduced) {
    el.textContent = target.toLocaleString() + suffix;
    return;
  }

  const duration = opts.duration || 900;
  const startVal = parseInt(String(el.textContent).replace(/[^\d]/g, ''), 10) || 0;
  if (startVal === target) {
    el.textContent = target.toLocaleString() + suffix;
    return;
  }

  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = Math.round(startVal + (target - startVal) * eased);
    el.textContent = current.toLocaleString() + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

R.pipelineMetricsSig = '';

R.summaryPipelineSig = function summaryPipelineSig(metrics) {
  const { total, counts } = metrics;
  return `${total}|${counts.distressed}|${counts.well_maintained}|${counts.vacant}|${counts.review}|${counts.blurred}`;
}

R.updateSummaryPipeline = function updateSummaryPipeline(metrics, skipIfUnchanged = false) {
  const track = $('summaryPipelineTrack');
  const pipeline = $('summaryPipeline');
  if (!track) return;

  const sig = summaryPipelineSig(metrics);
  if (skipIfUnchanged && sig === pipelineMetricsSig) return;
  pipelineMetricsSig = sig;

  const { total, counts } = metrics;
  if (!total) {
    track.innerHTML = '';
    if (pipeline) pipeline.style.display = 'none';
    return;
  }
  if (pipeline) pipeline.style.display = '';

  const segments = [
    { key: 'distressed', count: counts.distressed, label: 'Distressed' },
    { key: 'well-maintained', count: counts.well_maintained, label: 'Well Maintained' },
    { key: 'vacant', count: counts.vacant, label: 'Vacant' },
    { key: 'review', count: counts.review, label: 'Needs Review' },
    { key: 'blurred', count: counts.blurred, label: 'Blocked Image' }
  ].filter(s => s.count > 0);

  track.innerHTML = segments.map(s => {
    const pct = (s.count / total) * 100;
    return `<div class="summary-pipeline-seg ${s.key}" style="flex-grow:${s.count}" title="${s.label}: ${s.count.toLocaleString()} (${Math.round(pct)}%)"></div>`;
  }).join('') || '<div class="summary-pipeline-seg review" style="flex-grow:1;opacity:0.25"></div>';
}

R.PIPELINE_STEPS = ['upload', 'scan', 'buckets', 'review'];

/** Determine the active Analyze pipeline step from current state. */
R.activePipelineStep = function activePipelineStep() {
  if (state.reviewMode) return 'review';
  if (state.running) return 'scan';
  const hasResults = (state.results || []).length > 0 || getTotalScannedCount() > 0;
  if (hasResults) return 'buckets';
  const hasRecords = (state.records || []).length > 0;
  if (hasRecords) return 'scan';
  return 'upload';
};

/** Toggle is-complete / is-active on the four pipeline steps to match state. */
R.paintAnalyzePipeline = function paintAnalyzePipeline() {
  const nav = $('analyzePipeline');
  if (!nav) return;
  const active = activePipelineStep();
  const activeIdx = PIPELINE_STEPS.indexOf(active);
  nav.querySelectorAll('.analyze-pipeline-step').forEach((li) => {
    const step = li.dataset.step;
    const idx = PIPELINE_STEPS.indexOf(step);
    li.classList.toggle('is-active', idx === activeIdx);
    li.classList.toggle('is-complete', idx >= 0 && idx < activeIdx);
  });
};

R.updateSummaryStats = function updateSummaryStats(opts = {}) {
  if (state.reviewMode && !opts.force) return;
  const n = state.results.length;
  const metrics = getSummaryMetrics();
  const scanLight = opts.light || (state.running && !opts.full);
  // Instant paint when server KPIs are ready — 900ms count-up made totals feel "slow to load"
  const usingServerKpis = !!(state._tierCountsFromServer && !sessionLoadState.complete);
  const instant = !!(opts.instant || scanLight || usingServerKpis || opts.full === false && usingServerKpis);
  const animOpts = instant ? { instant: true } : { duration: 450 };

  // While scanning, live strip owns bucket UI — don't paint session dual totals
  if (state.running && !opts.force) {
    updateScannedCountUi();
    updateScanReadyUi?.();
    applyAnalyzeVisibility?.();
    return;
  }

  const totalScanned = metrics.total || 0;
  const hasData = totalScanned > 0 || n > 0 || state.records.length > 0;
  if (!hasData) {
    animateStatNumber($('sumDistressedKpi'), 0, { instant: true });
    animateStatNumber($('sumWellMaintained'), 0, { instant: true });
    animateStatNumber($('sumVacant'), 0, { instant: true });
    animateStatNumber($('sumBlurred'), 0, { instant: true });
    animateStatNumber($('sumScannedHero'), 0, { instant: true });
    animateStatNumber($('sumReview'), 0, { instant: true });
    paintVaultSummaryRow(null, { instant: true });
    const intro = $('summaryIntro');
    if (intro) {
      intro.hidden = true;
      intro.textContent = '';
    }
    $('sumReviewCard')?.classList.remove('has-items');
    if ($('sumReviewCard')) $('sumReviewCard').hidden = false;
    animateStatNumber($('sumSatelliteOnly'), 0, { instant: true });
    if ($('sumSatelliteOnlyCard')) $('sumSatelliteOnlyCard').hidden = true;
    updateScannedCountUi();
    updateScanReadyUi?.();
    applyAnalyzeVisibility?.();
    return;
  }

  updateScannedCountUi();

  // Post-scan primary row = awaiting Keep/Change (not all-time classified totals)
  if (opts.force) invalidateReviewSnapshotCache?.();
  const awaiting = typeof getAwaitingReviewBucketCounts === 'function'
    ? getAwaitingReviewBucketCounts()
    : (metrics.counts || {});
  animateStatNumber($('sumDistressedKpi'), awaiting.distressed, animOpts);
  animateStatNumber($('sumWellMaintained'), awaiting.well_maintained, animOpts);
  animateStatNumber($('sumVacant'), awaiting.vacant, animOpts);
  animateStatNumber($('sumBlurred'), awaiting.blurred, animOpts);
  animateStatNumber($('sumScannedHero'), totalScanned, animOpts);
  const reviewN = Number(awaiting.review) || 0;
  animateStatNumber($('sumReview'), reviewN, animOpts);
  if ($('sumReviewCard')) {
    // Peer card in the same KPI row as Distressed / Well Maintained (always shown).
    $('sumReviewCard').hidden = false;
    $('sumReviewCard').classList.toggle('has-items', reviewN > 0);
  }
  const satelliteN = Number(awaiting.satellite_only) || 0;
  animateStatNumber($('sumSatelliteOnly'), satelliteN, animOpts);
  if ($('sumSatelliteOnlyCard')) {
    $('sumSatelliteOnlyCard').hidden = satelliteN <= 0;
    $('sumSatelliteOnlyCard').classList.toggle('has-items', satelliteN > 0);
  }
  if (awaiting.distressed > 0 && typeof R.pulseDistressedKpi === 'function' && !instant) {
    R.pulseDistressedKpi(awaiting.distressed);
  }

  const pendingReview =
    (Number(awaiting.distressed) || 0)
    + (Number(awaiting.well_maintained) || 0)
    + (Number(awaiting.vacant) || 0)
    + (Number(awaiting.blurred) || 0)
    + reviewN;
  const intro = $('summaryIntro');
  if (intro) {
    // Header is title-only — no “X open” / status line under Review Properties.
    intro.hidden = true;
    intro.textContent = '';
    intro.setAttribute('aria-hidden', 'true');
  }
  const awaitingLbl = $('summaryAwaitingLabel');
  if (awaitingLbl) {
    awaitingLbl.hidden = true;
    awaitingLbl.textContent = '';
    awaitingLbl.setAttribute('aria-hidden', 'true');
  }

  // Vault row — use cache instantly, refresh in background when stale/forced
  if (state._vaultMeta) {
    paintVaultSummaryRow(state._vaultMeta, { instant: true });
  }
  if (opts.refreshVault !== false) {
    void refreshVaultSummaryRow({ force: !!opts.forceVault, instant: true });
  }

  if (!scanLight) updateFilterLabels();
  updateScanReadyUi?.();
  updateLocalKpis?.();
  applyAnalyzeVisibility?.();
}

R.gaugeFillClass = function gaugeFillClass(score, category = 'property', leadTier = null) {
  if (category === 'vacant_lot') return 'vacant';
  if (category === 'blurred') return 'blurred';
  if (leadTier === 'well_maintained') return 'well-maintained';
  if (leadTier === 'distressed' || score >= DISTRESSED_MIN_SCORE) return 'distressed';
  if (score < DISTRESSED_MIN_SCORE) return 'well-maintained';
  return 'low';
}

R.updateGauge = function updateGauge(score, animate = false, target = 'property', meta = {}) {
  const fill = target === 'scan' ? scanGaugeFill : gaugeFill;
  const num = target === 'scan' ? scanGaugeNum : gaugeNum;
  if (!num) return;
  const isCircle = !!(fill && (fill.tagName === 'circle' || fill.tagName === 'CIRCLE'));
  const barExtra = isCircle || !fill ? '' : ' property-distress-meter-fill';
  const panel = target === 'property' ? inspectorGaugePanel : null;
  const scaleEl = target === 'property' ? propertyDistressScale : null;

  if (score == null || score === undefined) {
    if (fill) {
      if (isCircle) fill.style.strokeDashoffset = GAUGE_CIRC;
      else {
        fill.style.width = '0%';
        fill.style.strokeDashoffset = '';
      }
      fill.className = 'gauge-fill' + barExtra;
    }
    num.textContent = '—';
    num.classList.remove('emoji-tier');
    if (scaleEl) scaleEl.hidden = true;
    if (panel) {
      panel.className = panel.className
        .split(/\s+/)
        .filter((c) => c && !c.startsWith('distress-') && c !== 'has-score')
        .concat(['property-distress'])
        .filter((c, i, a) => a.indexOf(c) === i)
        .join(' ');
    }
    return;
  }

  const pct = Math.max(0, Math.min(1, Number(score) / 10));
  const category = meta.category || 'property';
  const leadTier = meta.leadTier ?? tierFromScore(score, category);
  const fillTone = gaugeFillClass(score, category, leadTier);
  if (fill) {
    if (isCircle) {
      fill.style.strokeDashoffset = GAUGE_CIRC * (1 - pct);
      fill.style.width = '';
    } else {
      fill.style.width = `${Math.round(pct * 100)}%`;
      fill.style.strokeDashoffset = '';
    }
    fill.className = 'gauge-fill ' + fillTone + barExtra;
  }

  // Clean numeric distress (no emoji HUD cosplay) on property modal; scan follows same number.
  const n = Number(score);
  num.textContent = Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '—';
  num.classList.remove('emoji-tier');
  if (scaleEl) scaleEl.hidden = false;
  if (panel) {
    const base = ['property-distress', 'has-score', 'distress-' + fillTone];
    panel.className = base.join(' ');
  }
  if (animate) {
    num.classList.remove('pop');
    void num.offsetWidth;
    num.classList.add('pop');
  }
}

R.openPropertyModal = function openPropertyModal() {
  if (!propertyModal) return;
  propertyModal.hidden = false;
  propertyModal.classList.add('open');
  document.body.classList.add('property-modal-open');
  if (!imageLightbox.classList.contains('open')) {
    document.body.style.overflow = 'hidden';
  }
  state.propertyModalOpen = true;
  updateLiveScanDock();
  updateAppNav();
}

R.closePropertyModal = function closePropertyModal(opts = {}) {
  if (!state.propertyModalOpen) return;
  propertyModal?.classList.remove('open');
  if (propertyModal) propertyModal.hidden = true;
  document.body.classList.remove('property-modal-open');
  if (!imageLightbox.classList.contains('open')) {
    document.body.style.overflow = '';
  }
  if (state._profileSpy) {
    try { state._profileSpy.disconnect(); } catch (_) { /* ignore */ }
    state._profileSpy = null;
  }
  state.propertyModalOpen = false;
  state.selectedKey = null;
  state.scoreEditKey = null;
  state.pinnedKey = null;
  state.pinnedLiveAddress = null;
  updateScanPinUi();
  if (state.scanLiveSnapshot && state.running) {
    const s = state.scanLiveSnapshot;
    showPreview(s.address, s.status, s.streetViewUrl, s.satelliteUrl, s.score, false);
  }
  renderResults();
  updateLiveScanDock();
  updateAppNav();
  if (opts.save !== false) saveSession();
}

R.categoryLabel = function categoryLabel(category) {
  if (category === 'vacant_lot') return 'Vacant Lot/Land';
  if (category === 'blurred') return 'Blocked Image';
  if (category === 'unavailable') return 'Unavailable';
  return 'Property';
}

R.isVacantLot = function isVacantLot(r) {
  return resultCategory(r) === 'vacant_lot';
}

R.finalizeBlurredLead = function finalizeBlurredLead(record, reasonSuffix = 'You marked as Blocked Image — cannot see or assess the home.') {
  const baseReason = String(record.reason || '')
    .replace(/ Flagged for Needs Review — decide later\./g, '')
    .replace(/ Flagged Satellite Only — re-scan later\./g, '')
    .replace(/ You (changed category|confirmed|marked).*$/i, '')
    .trim();
  return attachTierRationale({
    ...record,
    manualOverride: 'blurred',
    category: 'blurred',
    structureOnLot: null,
    score: 0,
    indicators: [],
    leadTier: 'blurred',
    needsReview: false,
    needsReviewLater: false,
    satelliteOnly: false,
    landHomeConflict: false,
    satelliteConflict: false,
    reviewResolved: true,
    reason: baseReason ? `${baseReason} ${reasonSuffix}` : reasonSuffix
  });
}

R.getGoogleSearchUrl = function getGoogleSearchUrl(address) {
  return `https://www.google.com/search?q=${encodeURIComponent(String(address || '').trim())}`;
}

R.agentUiTimer = null;
R.AGENT_PANEL_COLLAPSED_KEY = 'distressAnalyzerAgentPanelCollapsed';

R.isAgentPanelCollapsed = function isAgentPanelCollapsed() {
  try { return sessionStorage.getItem(AGENT_PANEL_COLLAPSED_KEY) === '1'; }
  catch (_) { return false; }
}

R.setAgentPanelCollapsed = function setAgentPanelCollapsed(collapsed) {
  try { sessionStorage.setItem(AGENT_PANEL_COLLAPSED_KEY, collapsed ? '1' : '0'); }
  catch (_) {}
  applyAgentPanelCollapsedUi();
}

R.applyAgentPanelCollapsedUi = function applyAgentPanelCollapsedUi() {
  const panel = $('agentGridPanel');
  const btn = $('agentGridCollapseBtn');
  const collapsed = isAgentPanelCollapsed() && state.running;
  panel?.classList.toggle('collapsed', collapsed);
  if (btn) {
    btn.textContent = collapsed ? 'Show workers' : 'Hide workers';
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.title = collapsed
      ? 'Show live worker cards'
      : 'Hide worker cards to scroll to Scan Summary';
  }
  const cmdWorkers = $('commandWorkersStatus');
  if (cmdWorkers && state.running) {
    cmdWorkers.title = collapsed
      ? 'Workers running — click to expand live worker panel'
      : 'Active parallel workers during scan';
    cmdWorkers.style.cursor = collapsed ? 'pointer' : '';
  }
}

R.countActiveWorkers = function countActiveWorkers() {
  return (state.agentSlots || []).filter(s => s.active || s.phase === 'working').length;
}

R.updateWorkerActivityUi = function updateWorkerActivityUi(serverSt = lastServerApiStatus) {
  const summaryEl = $('agentWorkerSummary');
  const subEl = $('agentGridSub');
  const activeEl = $('statWorkersActive');
  const setEl = $('statWorkersSet');
  const metricEl = $('statWorkersMetric');
  const cmdWorkers = $('commandWorkersStatus');
  const cmdWorkersLabel = $('commandWorkersLabel');

  if (!state.running) {
    if (summaryEl) {
      summaryEl.textContent = 'Start a scan to see per-worker status.';
      summaryEl.classList.remove('paused');
    }
    if (subEl) subEl.textContent = '—';
    if (activeEl) activeEl.textContent = '0';
    if (setEl) setEl.textContent = '0';
    metricEl?.classList.remove('throttled');
    if (cmdWorkers) cmdWorkers.hidden = true;
    return;
  }

  if (cmdWorkers) cmdWorkers.hidden = false;

  const configured = getConcurrentLimit();
  const effective = getEffectiveConcurrentLimit();
  const slots = state.agentSlots?.length || effective;
  const active = countActiveWorkers();
  const idle = Math.max(0, slots - active);
  const paused = Date.now() < rateLimitUntil;

  if (activeEl) activeEl.textContent = String(active);
  if (setEl) setEl.textContent = String(effective);
  metricEl?.classList.toggle('throttled', effective < configured || paused);

  if (subEl) {
    subEl.textContent = `${active}/${effective} working · ${idle} idle`;
  }

  const parts = [];
  if (configured !== effective) {
    parts.push(`${configured} set → ${effective} effective`);
  } else {
    parts.push(`${effective} parallel slot${effective === 1 ? '' : 's'}`);
  }
  if (adaptiveConcurrentCap != null && adaptiveConcurrentCap < configured) {
    parts.push(`auto-throttled to ${adaptiveConcurrentCap}`);
  }
  if (paused) {
    parts.push(`rate-limit pause ~${Math.ceil((rateLimitUntil - Date.now()) / 1000)}s`);
  }
  if (serverSt?.gemini) {
    const g = serverSt.gemini;
    parts.push(`Gemini ${g.active}/${g.maxConcurrent} API${g.waiting ? ` · ${g.waiting} queued` : ''}`);
  }
  if (serverSt?.maps && (serverSt.maps.active > 0 || serverSt.maps.waiting > 0)) {
    const m = serverSt.maps;
    parts.push(`Maps ${m.active}/${m.maxConcurrent}${m.waiting ? ` · ${m.waiting} queued` : ''}`);
  }
  if (summaryEl) {
    summaryEl.textContent = parts.join(' · ');
    summaryEl.classList.toggle('paused', paused);
    summaryEl.title = 'Active workers = properties being analyzed right now. Gemini/Maps = server-side API slots (may be lower than worker count while images load).';
  }
  if (cmdWorkersLabel) {
    const gem = serverSt?.gemini;
    const gemPart = gem ? ` · Gemini ${gem.active}/${gem.maxConcurrent}` : '';
    cmdWorkersLabel.textContent = `Workers ${active}/${effective}${gemPart}`;
  }
  cmdWorkers?.classList.toggle('throttled', effective < configured || paused);
}

R.initAgentSlots = function initAgentSlots(count = 25) {
  const n = typeof clampWorkerCount === 'function'
    ? clampWorkerCount(count || DEFAULT_CONCURRENT_LIMIT || 25)
    : Math.max(5, Math.min(50, count || 25));
  state.agentSlots = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    active: false,
    address: '',
    status: 'Standing by',
    phase: 'idle'
  }));
  ensureAgentGridDom(n);
  updateWorkerActivityUi();
  scheduleAgentGridRender(true);
}

R.ensureAgentGridDom = function ensureAgentGridDom(count) {
  const grid = $('agentGrid');
  if (!grid) return;
  if (grid.dataset.slots === String(count)) return;
  grid.dataset.slots = String(count);
  grid.innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="agent-card" data-agent="${i}">
      <div class="agent-card-head">
        <span class="agent-id">AGT-${String(i + 1).padStart(2, '0')}</span>
        <span class="agent-dot" aria-hidden="true"></span>
      </div>
      <div class="agent-addr" data-f="addr">—</div>
      <div class="agent-status" data-f="status">Standing by</div>
    </div>
  `).join('');
}

R.scheduleAgentGridRender = function scheduleAgentGridRender(force = false) {
  const paint = () => {
    agentUiTimer = null;
    renderAgentGrid();
  };
  if (force) {
    if (agentUiTimer) clearTimeout(agentUiTimer);
    paint();
    return;
  }
  if (agentUiTimer) return;
  agentUiTimer = setTimeout(paint, 280);
}

R.renderAgentGrid = function renderAgentGrid() {
  const panel = $('agentGridPanel');
  if (!panel) return;
  panel.classList.toggle('visible', state.running);
  applyAgentPanelCollapsedUi();
  if (!state.running) {
    panel.classList.remove('collapsed');
    updateWorkerActivityUi();
    return;
  }
  const slots = state.agentSlots || [];
  ensureAgentGridDom(slots.length || 8);
  slots.forEach((slot, i) => {
    const card = panel.querySelector(`.agent-card[data-agent="${i}"]`);
    if (!card) return;
    card.classList.toggle('active', !!slot.active);
    card.classList.toggle('done', slot.phase === 'done');
    card.classList.toggle('failed', slot.phase === 'failed');
    const addrEl = card.querySelector('[data-f="addr"]');
    const statusEl = card.querySelector('[data-f="status"]');
    if (addrEl) addrEl.textContent = slot.address || '—';
    if (statusEl) statusEl.textContent = slot.status || 'Standing by';
  });
  updateWorkerActivityUi();
}

R.updateAgentSlot = function updateAgentSlot(workerNum, patch) {
  if (workerNum == null || workerNum < 0) return;
  if (!state.agentSlots[workerNum]) return;
  Object.assign(state.agentSlots[workerNum], patch);
  scheduleAgentGridRender();
}

R.shortAgentAddress = function shortAgentAddress(address, record = null) {
  const line = record?.street || String(address || '').split(',')[0] || address || '—';
  return line.length > 42 ? line.slice(0, 39) + '…' : line;
}

R.scanPreview = function scanPreview(address, status, streetViewUrl, satelliteUrl, score, animateGauge, workerNum) {
  if (workerNum != null) {
    updateAgentSlot(workerNum, {
      active: true,
      address: shortAgentAddress(address),
      status: status || 'Working…',
      phase: 'working'
    });
  }
  if (workerNum === 0 || workerNum == null) {
    showPreview(address, status, streetViewUrl, satelliteUrl, score, animateGauge);
  }
}

R.updateScanRunningUi = function updateScanRunningUi() {
  document.body.classList.toggle('scan-running', state.running);
  document.documentElement.classList.toggle('scan-active', state.running);
  if (typeof R.syncScanTheaterClass === 'function') R.syncScanTheaterClass(state.running);
  if (!state.running) {
    hideLiveTierAlert();
    scheduleAgentGridRender(true);
  }
  updateAppNav();
}

R.getFilterLabel = function getFilterLabel() {
  const counts = getTierCounts();
  if (state.filter === 'all') return `All leads (${counts.all})`;
  if (counts[state.filter] !== undefined) {
    return categoryLabelWithCount(state.filter, counts[state.filter]);
  }
  return state.filter;
}

R.updateAppNav = function updateAppNav() {
  const view = state.running && state.appView === 'scan' ? 'dashboard' : state.appView;
  document.body.dataset.appView = view === 'setup' && (state.records.length || state.results.length)
    ? 'dashboard'
    : (view === 'scan' ? 'dashboard' : view);
  updateCommandBar();
}

R.setAppView = function setAppView(view, opts = {}) {
  if (view !== 'property') closePropertyModal({ save: false });

  if (view === 'setup') {
    openUploadModal();
    state.appView = state.records.length || state.results.length ? 'dashboard' : 'setup';
    updateScanFeedUi();
    updateAppNav();
    saveSession();
    return;
  }

  if (view === 'scan') view = 'dashboard';

  state.appView = view;

  if (view === 'dashboard') {
    state.pinnedKey = null;
    state.pinnedLiveAddress = null;
    collapseSetup(true);
    updateScanFeedUi();
    renderResults({ force: true });
    updateSummaryStats();
    if (opts.scroll !== false && !state.running) summarySection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (view === 'property') {
    const r = state.results.find(x => recordKey(x) === state.selectedKey);
    if (r) {
      if (state.running) pinProperty(r);
      else showInspector(r, { scrollList: false });
      return;
    }
    state.appView = state.records.length || state.results.length ? 'dashboard' : 'setup';
  }

  updateAppNav();
  saveSession();
}

R.updateLiveScanDock = function updateLiveScanDock() { /* removed — tier stack in top-right */ }

R.updateScanFeedUi = function updateScanFeedUi() {
  updateScanRunningUi();
  updateAppNav();
}

R.openLightbox = function openLightbox(src, label = 'Property image') {
  if (!src) return;
  lightboxImg.src = src;
  lightboxLabel.textContent = label;
  imageLightbox.hidden = false;
  imageLightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}

R.closeLightbox = function closeLightbox() {
  imageLightbox.classList.remove('open');
  imageLightbox.hidden = true;
  lightboxImg.removeAttribute('src');
  if (!state.propertyModalOpen && !scoreEditModal?.classList.contains('open')) {
    document.body.style.overflow = '';
  }
}

R.normalizeCondition = function normalizeCondition(value) {
  const c = String(value || '').toLowerCase().trim();
  return CONDITION_LABELS[c] ? c : 'unknown';
}

R.getActionLabel = function getActionLabel(r) {
  const cat = resultCategory(r);
  if (cat === 'vacant_lot') return { text: 'Vacant lot — skip unless buying land', cls: 'neutral' };
  if (cat === 'blurred') return { text: 'Blocked image — skip', cls: 'neutral' };
  if (cat === 'unavailable') return { text: 'Confirm vacant land vs home', cls: 'moderate' };
  if (computeNeedsReview(r)) return { text: 'Review before calling', cls: 'needs-review' };
  const tier = resultLeadTier(r);
  if (tier === 'distressed') return { text: 'Distressed — work this lead', cls: 'distressed' };
  if (tier === 'well_maintained') return { text: '✨ Well Maintained — skip; code-list false positive', cls: 'well-maintained' };
  return { text: 'Distressed — work this lead', cls: 'distressed' };
}

R.getQuickHeadline = function getQuickHeadline(r) {
  const cat = resultCategory(r);
  if (cat === 'vacant_lot') return 'Vacant Lot — No House';
  if (cat === 'blurred') return '⛔ Blocked Image';
  if (cat === 'unavailable') return '⚠️ Vacant or Home?';
  return leadTierLabel(resultLeadTier(r));
}

R.buildOneLineSummary = function buildOneLineSummary(r) {
  const cat = resultCategory(r);
  if (cat === 'vacant_lot') return 'Empty lot — no structure on parcel.';
  if (cat === 'blurred') return 'Blocked image — cannot see or assess the home.';
  if (cat === 'unavailable') return 'Unclear if vacant land or home — pick category in Needs Review.';
  const inds = normalizeIndicators(r.indicators);
  if (inds.length) {
    const top = inds.slice(0, 2).map(k => INDICATOR_LABELS[k] || k.replace(/_/g, ' '));
    return top.join(' · ') + (inds.length > 2 ? ` +${inds.length - 2} more` : '');
  }
  return simplifyDisplayText(r.reason) || 'No major distress signs seen.';
}

R.simplifyDisplayText = function simplifyDisplayText(text) {
  if (!text) return '';
  let t = String(text)
    .replace(/CONFLICT:.*?(?=\.|$)/gi, '')
    .replace(/You (confirmed|corrected).*$/i, '')
    .trim();
  const sentence = t.split(/[.!?]/).map(s => s.trim()).find(s => s.length > 8) || t;
  return sentence.length > 90 ? sentence.slice(0, 87) + '…' : sentence;
}

R.formatSimpleIssuesList = function formatSimpleIssuesList(indicators, max = 6) {
  const list = normalizeIndicators(indicators);
  if (!list.length) return '<p class="simple-ok">✓ No major distress flags detected</p>';
  const items = list.slice(0, max).map(k => {
    const cls = HIGH_INDICATORS.has(k) ? ' class="issue-high"' : '';
    return `<li${cls}>${escapeHtml(INDICATOR_LABELS[k] || k.replace(/_/g, ' '))}</li>`;
  });
  const extra = list.length > max ? `<li>+${list.length - max} more</li>` : '';
  return `<ul class="simple-issue-list">${items.join('')}${extra}</ul>`;
}

R.formatReviewAnalysisHtml = function formatReviewAnalysisHtml(r, opts = {}) {
  const cat = resultCategory(r);
  const parts = [];
  const tierLabel = leadTierLabel(resultLeadTier(r));
  const rationale = r.tierRationale
    || (opts.skipRationaleBuild ? 'Loading details…' : buildTierRationale(r));
  parts.push(`<div class="tier-why-box">
    <div class="tier-why-lbl">Why ${escapeHtml(tierLabel)}</div>
    <p class="tier-why-text">${escapeHtml(rationale)}</p>
  </div>`);
  if (cat === 'property') {
    parts.push(`<div class="simple-section">
      <div class="simple-section-title">Red flags found</div>
      ${formatSimpleIssuesList(r.indicators, 6)}
    </div>`);
    if (r.reason) {
      const short = simplifyDisplayText(r.reason).slice(0, 280);
      parts.push(`<div class="simple-section">
        <div class="simple-section-title">Street View — quick take</div>
        <p style="font-size:0.82rem;color:var(--text-soft);margin:0;line-height:1.45;">${escapeHtml(short)}${r.reason.length > 280 ? '…' : ''}</p>
      </div>`);
    }
  }
  return parts.join('');
}

R.formatSimpleAnalysisHtml = function formatSimpleAnalysisHtml(r) {
  const cat = resultCategory(r);
  const action = getActionLabel(r);
  const parts = [];

  parts.push(`<div class="quick-read">
    <div class="quick-read-headline">${escapeHtml(getQuickHeadline(r))}</div>
    <span class="quick-read-action ${action.cls}">${escapeHtml(action.text)}</span>
  </div>`);

  parts.push(`<div class="tier-why-box">
    <div class="tier-why-lbl">Why ${escapeHtml(leadTierLabel(resultLeadTier(r)))}</div>
    <p class="tier-why-text">${escapeHtml(r.tierRationale || buildTierRationale(r))}</p>
  </div>`);

  if (cat === 'property') {
    parts.push(`<div class="simple-section">
      <div class="simple-section-title">Red flags found</div>
      ${formatSimpleIssuesList(r.indicators)}
    </div>`);
  }

  const sat = r.satelliteClassification;
  if (sat && r.usedSatellite) {
    const roof = CONDITION_LABELS[normalizeCondition(sat.roofCondition)] || 'Unknown';
    const yard = CONDITION_LABELS[normalizeCondition(sat.yardCondition)] || 'Unknown';
    const satLine = cat === 'vacant_lot'
      ? simplifyDisplayText(sat.reason) || 'Open land — no roof on subject lot.'
      : simplifyDisplayText(sat.reason) || 'Aerial check complete.';
    parts.push(`<div class="simple-section">
      <div class="simple-section-title">Satellite — D4D roof &amp; yard scan</div>
      <div class="simple-meta-row">
        <span class="simple-meta-pill">Roof: ${escapeHtml(roof)}</span>
        <span class="simple-meta-pill">Yard: ${escapeHtml(yard)}</span>
        ${sat.aerialDistressScore != null ? `<span class="simple-meta-pill">Aerial score: ${sat.aerialDistressScore}/10</span>` : ''}
      </div>
      <p style="font-size:0.82rem;color:var(--text-soft);margin:0.45rem 0 0;line-height:1.45;">${escapeHtml(satLine)}</p>
      ${sat.indicators?.length ? `<div style="margin-top:0.4rem;">${formatSimpleIssuesList(sat.indicators, 4)}</div>` : ''}
    </div>`);
  }

  if (r.reason && cat === 'property') {
    parts.push(`<div class="simple-section">
      <div class="simple-section-title">Street View — quick take</div>
      <p style="font-size:0.82rem;color:var(--text-soft);margin:0;line-height:1.45;">${escapeHtml(simplifyDisplayText(r.reason))}</p>
    </div>`);
  }

  if (computeNeedsReview(r)) {
    parts.push(`<div class="simple-section"><p style="font-size:0.8rem;color:var(--amber);margin:0;">⚠ Needs your review — confirm if this is a home or vacant lot.</p></div>`);
  } else if (r.confidence != null) {
    parts.push(`<div class="simple-meta-row" style="margin-top:0.5rem;"><span class="simple-meta-pill">AI confidence ${r.confidence}%</span></div>`);
  }

  return parts.join('');
}

R.getReviewQueue = function getReviewQueue() {
  return state.results.filter(r => computeNeedsReview(r));
}

R.REVIEW_UNDO_CLEAR_IF_ABSENT = [
  'manualScore', 'tierLocked', 'manualOverride', 'autoWellMaintained',
  'manualEditedAt', 'tierRationale', 'aiScore'
];

R.snapshotRecordForUndo = function snapshotRecordForUndo(r) {
  return {
    // Identity — needed to re-find / re-insert after lean merges wipe keys
    email: r.email,
    phone: r.phone,
    address: r.address,
    street: r.street,
    score: r.score,
    leadTier: r.leadTier,
    manualScore: r.manualScore,
    tierLocked: r.tierLocked,
    category: r.category,
    manualOverride: r.manualOverride,
    structureOnLot: r.structureOnLot,
    needsReview: r.needsReview,
    needsReviewLater: r.needsReviewLater,
    satelliteOnly: r.satelliteOnly,
    reviewResolved: r.reviewResolved,
    manuallyReviewed: r.manuallyReviewed,
    manuallyReviewedAt: r.manuallyReviewedAt,
    manuallyReviewedVia: r.manuallyReviewedVia,
    satelliteConflict: r.satelliteConflict,
    reason: r.reason,
    indicators: Array.isArray(r.indicators) ? [...r.indicators] : [],
    autoWellMaintained: r.autoWellMaintained
  };
}

R.applyReviewUndoSnapshot = function applyReviewUndoSnapshot(record, snapshot) {
  const snap = snapshot || {};
  const merged = { ...record, ...snap };
  for (const k of REVIEW_UNDO_CLEAR_IF_ABSENT) {
    if (!(k in snap)) delete merged[k];
  }
  // Undo must un-stamp Keep/Change — falsy snapshot values must clear, not leave prior true.
  if (!snap.manuallyReviewed) {
    delete merged.manuallyReviewed;
    delete merged.manuallyReviewedAt;
    delete merged.manuallyReviewedVia;
  }
  if (!snap.reviewResolved) delete merged.reviewResolved;
  if (!snap.needsReviewLater) merged.needsReviewLater = false;
  if (!snap.satelliteOnly) merged.satelliteOnly = false;
  if (!snap.indicators) merged.indicators = [];
  merged.tierRationale = snap.tierRationale || buildTierRationale(merged);
  return merged;
}

R.pushReviewUndo = function pushReviewUndo(key, snapshot, meta = {}) {
  state.reviewUndoStack.push({
    key,
    snapshot,
    action: meta.action || 'change',
    queueIndex: meta.queueIndex ?? state.reviewIndex,
    at: Date.now()
  });
  if (state.reviewUndoStack.length > 30) state.reviewUndoStack.shift();
  if (reviewUndoBtn) reviewUndoBtn.disabled = false;
}

R.cloneReviewUndoStack = function cloneReviewUndoStack(stack) {
  return (stack || []).map((u) => ({
    key: u.key,
    action: u.action || 'change',
    queueIndex: u.queueIndex ?? 0,
    at: u.at || 0,
    snapshot: { ...u.snapshot, indicators: Array.isArray(u.snapshot?.indicators) ? [...u.snapshot.indicators] : [] }
  }));
}

R.reviewFilterLabel = function reviewFilterLabel(filter = state.reviewFilter) {
  if (!filter || filter === 'all') return tierUiLabel('all');
  return tierUiLabel(filter);
}

R.matchesReviewFilter = function matchesReviewFilter(r, filter) {
  if (!r || !filter || filter === 'all') return !!r;
  if (r.satelliteOnly) return filter === 'satellite_only';
  if (filter === 'satellite_only') return false;
  if (filter === 'review') return computeNeedsReview(r);
  if (filter === 'vacant') {
    if (r.category === 'vacant_lot' || r.category === 'vacant' || r.category === 'land') return true;
    return resultCategory(r) === 'vacant_lot';
  }
  if (filter === 'blurred') return isBlurredImagery(r);
  if (!isClassifiedResultFast(r)) return false;
  const cat = r.category === 'property' ? 'property' : resultCategory(r);
  if (cat !== 'property') return false;
  const fastTier = fastPropertyLeadTier(r);
  if (filter === 'distressed' || filter === 'light') {
    if (fastTier === 'distressed') return true;
    if (fastTier === 'well_maintained') return false;
    return resultLeadTier(r) === 'distressed';
  }
  if (filter === 'well_maintained') {
    if (fastTier === 'well_maintained') return true;
    if (fastTier === 'distressed') return false;
    return resultLeadTier(r) === 'well_maintained';
  }
  return false;
}

R.getReviewFilterResults = function getReviewFilterResults(filter) {
  const list = [];
  for (const r of state.results) {
    if (!matchesReviewFilter(r, filter)) continue;
    list.push(r);
  }
  return sortResults(list);
}

R.getReviewQueueStats = function getReviewQueueStats(filter) {
  const snap = scanReviewFilterSnapshot(filter);
  return {
    total: snap.total,
    pending: snap.pending,
    reviewedInFilter: snap.reviewedInFilter
  };
}

R.getReviewedKeySet = function getReviewedKeySet(filter) {
  return new Set(state.reviewedKeysByFilter?.[filter] || []);
}

R.REVIEW_FILTER_BUCKETS = ['distressed', 'well_maintained', 'vacant', 'review', 'low_confidence', 'blurred', 'satellite_only'];

R.getAllReviewedKeySet = function getAllReviewedKeySet() {
  const all = new Set();
  const buckets = state.reviewedKeysByFilter || {};
  for (const f of REVIEW_FILTER_BUCKETS) {
    for (const key of buckets[f] || []) all.add(key);
  }
  return all;
}

/** Lead already handled in this review queue (or globally finalized). */
R.isExcludedFromAllReviewQueues = function isExcludedFromAllReviewQueues(r, key = r ? recordKey(r) : '', filter = null) {
  if (!r) return true;
  if (r.satelliteOnly && filter === 'satellite_only') {
    return getReviewedKeySet('satellite_only').has(key)
      || (key ? getAllReviewedKeySet().has(key) : false);
  }
  if (r.satelliteOnly) return true;
  if (r.needsReviewLater && filter === 'review') return false;
  if (r.reviewResolved) return true;
  if (r.manuallyReviewed) {
    const via = String(r.manuallyReviewedVia || '');
    // Soft vias are queue progress — never hide a lead from Distressed / WM / Vacant.
    if (via === 'review_session' || via === 'review_skip' || via === 'review_missing') return false;
    return true;
  }
  // Exit Review may land reviewedKeysByFilter before every result row is stamped.
  // Session Buckets KPIs must treat those keys as done so the strip can hit 0.
  if (key) {
    try {
      if (typeof getAllReviewedKeySet === 'function' && getAllReviewedKeySet().has(key)) return true;
      if (filter && typeof getReviewedKeySet === 'function' && getReviewedKeySet(filter).has(key)) return true;
    } catch (_) {}
  }
  return false;
}

R.mergeReviewedKeysByFilter = function mergeReviewedKeysByFilter(existing = {}, incoming = {}) {
  const merged = {};
  const names = new Set([
    ...REVIEW_FILTER_BUCKETS,
    ...Object.keys(existing || {}),
    ...Object.keys(incoming || {})
  ]);
  for (const bucket of names) {
    const a = Array.isArray(existing[bucket]) ? existing[bucket] : [];
    const b = Array.isArray(incoming[bucket]) ? incoming[bucket] : [];
    merged[bucket] = [...new Set([...a, ...b])];
  }
  return merged;
}

R.repairReviewResolvedRecords = function repairReviewResolvedRecords() {
  if (typeof finalizeReviewClassification !== 'function') return 0;
  let changed = 0;
  state.results = state.results.map((r) => {
    if (r.needsReviewLater) return r;
    // Only promote true human / manual classification signals — never AI locks or
    // ghost bucket keys alone (those falsely empties Distressed / WM review queues).
    const humanReviewed = !!(r.manuallyReviewed || r.manualOverride || r.manualScore);
    if (!humanReviewed && !r.reviewResolved) return r;
    if (r.reviewResolved && !computeNeedsReview(r)) return r;
    changed++;
    return finalizeReviewClassification(r);
  });
  if (changed && typeof notifyResultMutation === 'function') {
    notifyResultMutation({ clearServerTierCounts: true });
  }
  return changed;
}

R.backfillReviewedKeysFromResults = function backfillReviewedKeysFromResults() {
  if (!state.reviewedKeysByFilter) {
    state.reviewedKeysByFilter = { distressed: [], well_maintained: [], vacant: [], review: [], low_confidence: [], blurred: [], satellite_only: [] };
  }
  let changed = 0;
  for (const r of state.results) {
    if (!r.manuallyReviewed && !r.reviewResolved && !r.needsReviewLater) continue;
    const key = recordKey(r);
    for (const f of REVIEW_FILTER_BUCKETS) {
      if (!matchesReviewFilter(r, f)) continue;
      const bucket = state.reviewedKeysByFilter[f] || [];
      if (!bucket.includes(key)) {
        bucket.push(key);
        state.reviewedKeysByFilter[f] = bucket;
        changed++;
      }
    }
  }
  return changed;
}

R.countTotalReviewedProperties = function countTotalReviewedProperties() {
  const buckets = state.reviewedKeysByFilter || {};
  let n = 0;
  for (const k of Object.keys(buckets)) {
    const bucket = buckets[k];
    if (Array.isArray(bucket)) n += bucket.length;
  }
  return n;
}

R.maybeReviewCheckpoint = function maybeReviewCheckpoint() {
  const every = REVIEW_CHECKPOINT_EVERY_N || 100;
  const since = state.reviewActionsSinceCheckpoint || 0;
  if (since < every) return false;
  flushReviewCheckpoint();
  return true;
}

R.flushReviewCheckpoint = function flushReviewCheckpoint() {
  state.reviewActionsSinceCheckpoint = 0;
  state.lastReviewCheckpointAt = Date.now();
  state.totalReviewCheckpoints = (state.totalReviewCheckpoints || 0) + 1;
  if (typeof flushLearnedBrainSave === 'function') flushLearnedBrainSave();
  const total = countTotalReviewedProperties();
  if (typeof pushReviewMetadataToServer === 'function') {
    pushReviewMetadataToServer('review-milestone', { immediate: true });
  }
  if (window.DistressPersistence) {
    DistressPersistence.saveNow('review-milestone', { urgent: true });
  } else {
    saveSession('review-milestone');
  }
  log(`Review checkpoint — ${total.toLocaleString()} properties reviewed secured to disk`, 'success');
  updateReviewCheckpointUi();
}

R.updateReviewCheckpointUi = function updateReviewCheckpointUi() {
  if (!reviewCheckpointEl) return;
  const every = REVIEW_CHECKPOINT_EVERY_N || 100;
  const until = Math.max(0, every - (state.reviewActionsSinceCheckpoint || 0));
  reviewCheckpointEl.textContent = until === 0 && state.lastReviewCheckpointAt
    ? '💾 checkpoint saved'
    : `💾 checkpoint in ${until}`;
}

R.ensureReviewedKeyInFilterBucket = function ensureReviewedKeyInFilterBucket(filter, key) {
  if (!filter || filter === 'all' || !key) return;
  if (!state.reviewedKeysByFilter) {
    state.reviewedKeysByFilter = { distressed: [], well_maintained: [], vacant: [], review: [], low_confidence: [], blurred: [], satellite_only: [] };
  }
  const bucket = state.reviewedKeysByFilter[filter] || [];
  // O(1) membership via side Set — includes() on 1k+ keys was slowing every Keep.
  if (!state._reviewedKeySets) state._reviewedKeySets = {};
  let set = state._reviewedKeySets[filter];
  if (!set || set.size !== bucket.length) {
    set = new Set(bucket);
    state._reviewedKeySets[filter] = set;
  }
  if (set.has(key)) {
    state.reviewedKeysByFilter[filter] = bucket;
    return;
  }
  set.add(key);
  bucket.push(key);
  state.reviewedKeysByFilter[filter] = bucket;
}

R.markReviewedKey = function markReviewedKey(filter, key, via = 'review', opts = {}) {
  if (!filter || filter === 'all' || !key) return;
  // Soft vias only track queue progress / ghost buckets — they must NEVER stamp a lead
  // as manually reviewed or overwrite a real Keep/Change/Defer decision.
  const softVia = via === 'review_session' || via === 'review_skip' || via === 'review_missing';
  if (softVia) {
    sessionDirty = true;
    return;
  }
  ensureReviewedKeyInFilterBucket(filter, key);
  const idx = typeof ensureResultKeyIndex === 'function'
    ? ensureResultKeyIndex().get(key)
    : state.results.findIndex(r => recordKey(r) === key);
  const existing = idx != null && idx >= 0 ? state.results[idx] : null;
  const softExisting = existing?.manuallyReviewedVia === 'review_session'
    || existing?.manuallyReviewedVia === 'review_skip'
    || existing?.manuallyReviewedVia === 'review_missing';
  // Always re-stamp on real Keep/Change (and other operator decisions) so a prior
  // soft/defer stamp cannot block manuallyReviewedVia / needsReviewLater cleanup.
  const realDecision = via === 'review_keep'
    || via === 'review_change'
    || via === 'review_land'
    || via === 'category_change'
    || via === 'tier_edit'
    || via === 'review_satellite_only';
  if (!existing?.manuallyReviewed || softExisting || realDecision) {
    touchManuallyReviewedByKey(key, via);
    if (idx != null && idx >= 0 && realDecision) {
      const cur = state.results[idx];
      if (cur && (cur.needsReviewLater || via === 'review_keep' || via === 'review_change')) {
        state.results[idx] = {
          ...cur,
          needsReviewLater: via === 'review_defer' ? true : false,
          reviewResolved: via === 'review_keep' || via === 'review_change' || via === 'review_land' || via === 'category_change'
            ? true
            : !!cur.reviewResolved
        };
      }
    }
  }
  sessionDirty = true;

  // Incremental patch list for fast mid-review saves (avoids 16k scan hitch).
  const stampedNow = idx != null && idx >= 0 ? state.results[idx] : null;
  if (stampedNow && key) {
    if (!state._pendingReviewPatches) state._pendingReviewPatches = new Map();
    state._pendingReviewPatches.set(key, {
      email: stampedNow.email,
      phone: stampedNow.phone,
      address: stampedNow.address,
      manuallyReviewed: true,
      manuallyReviewedAt: stampedNow.manuallyReviewedAt || Date.now(),
      manuallyReviewedVia: via,
      reviewResolved: !!stampedNow.reviewResolved,
      needsReview: stampedNow.needsReview,
      needsReviewLater: !!stampedNow.needsReviewLater,
      satelliteOnly: !!stampedNow.satelliteOnly,
      landHomeConflict: stampedNow.landHomeConflict,
      satelliteConflict: stampedNow.satelliteConflict,
      manualOverride: stampedNow.manualOverride,
      manualScore: stampedNow.manualScore,
      tierLocked: stampedNow.tierLocked,
      category: stampedNow.category,
      leadTier: stampedNow.leadTier,
      score: stampedNow.score,
      structureOnLot: stampedNow.structureOnLot,
      confidence: stampedNow.confidence,
      imageryQuality: stampedNow.imageryQuality,
      reason: stampedNow.reason,
      analyzedAt: stampedNow.analyzedAt,
      manualEditedAt: stampedNow.manualEditedAt
    });
  }

  // During Review Keep/Change: paint the next lead first. Heavy KPI / Vault work is deferred.
  const deferHeavy = opts.deferHeavy !== false && !!state.reviewMode;
  if (deferHeavy) {
    if (typeof notifyResultMutation === 'function') {
      notifyResultMutation({ keepReviewSnapshot: true, clearServerTierCounts: false });
    }
    const stamped = stampedNow;
    if (stamped && typeof enqueueVaultPublish === 'function') {
      enqueueVaultPublish(stamped, via);
    } else if (stamped && typeof publishReviewedLeadToVault === 'function') {
      const runHeavy = () => {
        try { publishReviewedLeadToVault(stamped, via); } catch (err) {
          console.warn('[Vault] publish on review failed', err);
        }
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(runHeavy, { timeout: 2000 });
      else setTimeout(runHeavy, 50);
    }
    return;
  }

  if (typeof notifyResultMutation === 'function') {
    notifyResultMutation({ clearServerTierCounts: true });
  } else {
    invalidateReviewSnapshotCache?.();
  }
  const stamped = idx != null && idx >= 0 ? state.results[idx] : null;
  if (stamped && typeof publishReviewedLeadToVault === 'function') {
    try {
      publishReviewedLeadToVault(stamped, via);
    } catch (err) {
      console.warn('[Vault] publish on review failed', err);
    }
  }
  updateSummaryStats?.({ force: true, refreshVault: false });
}

/** Push a Keep/Change decision into The Vault catalog (admin). */
R._vaultPublishQueue = [];
R._vaultPublishBusy = false;
R._vaultPublishInFlight = 0;
R._VAULT_PUBLISH_CONCURRENCY = 2;
R._VAULT_PUBLISH_STORAGE_KEY = 'phuglee_vault_publish_pending_v1';
R._VAULT_PUBLISH_SOFT_VIAS = new Set(['review_session', 'review_skip', 'review_missing', 'review_defer', 'review_blurred']);

R._vaultPublishLeanFromResult = function vaultPublishLeanFromResult(result, via = 'review_keep') {
  if (!result) return null;
  const soft = R._VAULT_PUBLISH_SOFT_VIAS.has(String(via || ''));
  if (soft) return null;
  let tier = String(result.leadTier || '').toLowerCase().replace(/-/g, '_');
  const cat = String(result.category || '').toLowerCase().replace(/-/g, '_');
  if (!['distressed', 'well_maintained', 'vacant'].includes(tier)) {
    if (cat === 'vacant_lot' || cat === 'vacant' || cat === 'land') tier = 'vacant';
    else if (cat === 'blurred' || cat === 'unavailable') return null;
    else return null;
  }
  return {
    email: result.email,
    phone: result.phone,
    address: result.address,
    street: result.street,
    city: result.city,
    state: result.state,
    postal: result.postal,
    zip: result.zip,
    leadTier: tier === 'vacant' ? (result.leadTier || 'vacant') : (result.leadTier || tier),
    category: result.category,
    score: result.score,
    firstName: result.firstName,
    lastName: result.lastName,
    ownerName: result.ownerName,
    owner: result.owner,
    manuallyReviewed: true,
    manuallyReviewedVia: via || 'review_keep',
    manuallyReviewedAt: result.manuallyReviewedAt || Date.now(),
    reviewResolved: true,
    needsReviewLater: false,
    reason: result.reason,
    indicators: Array.isArray(result.indicators) ? result.indicators.slice(0, 24) : []
  };
};

R._vaultPublishKey = function vaultPublishKey(lean) {
  if (!lean) return '';
  const street = String(lean.street || lean.address || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const city = String(lean.city || '').toLowerCase().trim();
  const st = String(lean.state || '').toUpperCase().slice(0, 2);
  return `${street}|${city}|${st}`;
};

R._persistVaultPublishQueue = function persistVaultPublishQueue() {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload = (R._vaultPublishQueue || []).map((item) => ({
      lean: item.lean || item.result,
      via: item.via || 'review_keep',
      enqueuedAt: item.enqueuedAt || Date.now()
    })).filter((x) => x.lean);
    // Cap durable store only (never drop in-memory mid-burst).
    localStorage.setItem(R._VAULT_PUBLISH_STORAGE_KEY, JSON.stringify(payload.slice(-2500)));
  } catch (err) {
    console.warn('[Vault] persist queue failed', err?.message || err);
  }
};

R._restoreVaultPublishQueue = function restoreVaultPublishQueue() {
  if (typeof localStorage === 'undefined') return 0;
  let raw;
  try {
    raw = localStorage.getItem(R._VAULT_PUBLISH_STORAGE_KEY);
  } catch (_) {
    return 0;
  }
  if (!raw) return 0;
  let list;
  try {
    list = JSON.parse(raw);
  } catch (_) {
    return 0;
  }
  if (!Array.isArray(list) || !list.length) return 0;
  const seen = new Set((R._vaultPublishQueue || []).map((x) => R._vaultPublishKey(x.lean || x.result)));
  let added = 0;
  for (const item of list) {
    const lean = item?.lean || item?.result;
    if (!lean) continue;
    const k = R._vaultPublishKey(lean);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    R._vaultPublishQueue.push({
      lean,
      via: item.via || lean.manuallyReviewedVia || 'review_keep',
      enqueuedAt: item.enqueuedAt || Date.now()
    });
    added += 1;
  }
  return added;
};

R.enqueueVaultPublish = function enqueueVaultPublish(result, via = 'review_keep') {
  if (!result) return;
  const soft = R._VAULT_PUBLISH_SOFT_VIAS.has(String(via || ''));
  if (soft) return;
  const lean = R._vaultPublishLeanFromResult(result, via);
  if (!lean) return;
  const key = R._vaultPublishKey(lean);
  // Dedupe same address already waiting — keep newest decision.
  if (key && Array.isArray(R._vaultPublishQueue)) {
    R._vaultPublishQueue = R._vaultPublishQueue.filter((x) => R._vaultPublishKey(x.lean || x.result) !== key);
  }
  R._vaultPublishQueue.push({ lean, via, enqueuedAt: Date.now() });
  // NEVER drop Keep/Change publishes. Rapid review used to splice to 40 and silently
  // discard vault ship jobs — reviews stamped in session but never reached The Vault.
  R._persistVaultPublishQueue();
  drainVaultPublishQueue();
};

R.drainVaultPublishQueue = function drainVaultPublishQueue() {
  const max = R._VAULT_PUBLISH_CONCURRENCY || 2;
  if ((R._vaultPublishInFlight || 0) >= max) return;
  // Soft-yield to Street View while Review imagery is loading (do not hard-pause forever).
  if (state.reviewMode || state._reviewOpening) {
    const imgBusy = !!(R.reviewImages?.classList?.contains('loading'));
    const preloadBusy = (R._reviewPreloadInFlight || 0) > 0 || (R._reviewPreloadWait?.length || 0) > 0;
    if ((imgBusy || preloadBusy || state._reviewOpening) && (R._vaultPublishInFlight || 0) > 0) {
      setTimeout(() => drainVaultPublishQueue(), 320);
      return;
    }
  }
  while ((R._vaultPublishInFlight || 0) < max && R._vaultPublishQueue.length) {
    const next = R._vaultPublishQueue.shift();
    if (!next) break;
    R._vaultPublishInFlight = (R._vaultPublishInFlight || 0) + 1;
    R._vaultPublishBusy = true;
    const done = (ok) => {
      R._vaultPublishInFlight = Math.max(0, (R._vaultPublishInFlight || 1) - 1);
      R._vaultPublishBusy = (R._vaultPublishInFlight || 0) > 0;
      if (!ok && next) {
        // Re-queue failed publishes at the end (durable retry).
        next.retries = (next.retries || 0) + 1;
        if (next.retries <= 8) R._vaultPublishQueue.push(next);
      }
      R._persistVaultPublishQueue();
      let delay = 40;
      if (state.reviewMode) {
        const imgBusy = !!(R.reviewImages?.classList?.contains('loading'));
        delay = imgBusy ? 220 : 80;
      }
      setTimeout(() => drainVaultPublishQueue(), delay);
    };
    try {
      const p = publishReviewedLeadToVault(next.lean || next.result, next.via);
      if (p && typeof p.then === 'function') {
        p.then((out) => done(!!(out && out.ok !== false && !out.skipped && !out.error)))
          .catch(() => done(false));
      } else {
        done(true);
      }
    } catch (err) {
      console.warn('[Vault] enqueue publish failed', err);
      done(false);
    }
  }
};

R.resumeVaultPublishQueue = function resumeVaultPublishQueue() {
  const restored = R._restoreVaultPublishQueue() || 0;
  if (restored) console.info(`[Vault] restored ${restored} pending publish(es)`);
  drainVaultPublishQueue();
  return restored;
};

/** Re-enqueue human Keep/Change results that never reached Vault (session recovery). */
R.backfillVaultPublishFromReviewedResults = function backfillVaultPublishFromReviewedResults(opts = {}) {
  const soft = R._VAULT_PUBLISH_SOFT_VIAS;
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 5000;
  let enqueued = 0;
  for (const r of state.results || []) {
    if (enqueued >= limit) break;
    if (!r?.manuallyReviewed && !r?.reviewResolved) continue;
    const via = String(r.manuallyReviewedVia || 'review_keep');
    if (soft.has(via)) continue;
    if (r.needsReviewLater) continue;
    const lean = R._vaultPublishLeanFromResult(r, via);
    if (!lean) continue;
    R.enqueueVaultPublish(r, via);
    enqueued += 1;
  }
  return enqueued;
};

R.publishReviewedLeadToVault = function publishReviewedLeadToVault(result, via = 'review_keep') {
  if (!result) return Promise.resolve({ ok: false, skipped: true });
  // Accept a full Analyze result or a prebuilt lean payload from the durable queue.
  let lean = R._vaultPublishLeanFromResult(result, via || result.manuallyReviewedVia || 'review_keep');
  if (!lean && (result.street || result.address) && result.leadTier) {
    lean = {
      email: result.email,
      phone: result.phone,
      address: result.address,
      street: result.street,
      city: result.city,
      state: result.state,
      postal: result.postal,
      zip: result.zip,
      leadTier: result.leadTier,
      category: result.category,
      score: result.score,
      firstName: result.firstName,
      lastName: result.lastName,
      ownerName: result.ownerName,
      owner: result.owner,
      manuallyReviewed: true,
      manuallyReviewedVia: via || result.manuallyReviewedVia || 'review_keep',
      manuallyReviewedAt: result.manuallyReviewedAt || Date.now(),
      reviewResolved: true,
      needsReviewLater: false,
      reason: result.reason,
      indicators: Array.isArray(result.indicators) ? result.indicators.slice(0, 24) : []
    };
  }
  if (!lean) return Promise.resolve({ ok: false, skipped: true });
  const tier = String(lean.leadTier || '').toLowerCase().replace(/-/g, '_');
  const cat = String(lean.category || '').toLowerCase().replace(/-/g, '_');
  if (cat === 'blurred' || cat === 'unavailable') {
    return Promise.resolve({ ok: false, skipped: true });
  }
  const okTier = ['distressed', 'well_maintained', 'vacant'].includes(tier)
    || cat === 'vacant_lot' || cat === 'vacant' || cat === 'land';
  if (!okTier) return Promise.resolve({ ok: false, skipped: true });
  if (!['distressed', 'well_maintained', 'vacant'].includes(tier)
    && (cat === 'vacant_lot' || cat === 'vacant' || cat === 'land')) {
    lean.leadTier = 'vacant';
  }
  lean.manuallyReviewed = true;
  lean.manuallyReviewedVia = via || lean.manuallyReviewedVia || 'review_keep';
  lean.manuallyReviewedAt = lean.manuallyReviewedAt || Date.now();
  lean.reviewResolved = true;
  lean.needsReviewLater = false;

  const payload = JSON.stringify({
    result: lean,
    storageKey: (typeof getSessionUser === 'function' && getSessionUser()) || 'admin'
  });
  // Shell route — must stay at /api/leads/* (not /analyzer/api/leads/*).
  const url = '/api/leads/publish-from-analyzer';
  const headers = { 'Content-Type': 'application/json' };
  const token = typeof window !== 'undefined' && window.__PDA_AUTH_TOKEN__;
  if (token) headers['X-PDA-Token'] = token;
  try {
    const user = sessionStorage.getItem('phuglee_session') || 'admin';
    headers['X-Phuglee-User'] = user;
    const plan = sessionStorage.getItem('phuglee_plan') || 'max';
    headers['X-Phuglee-Plan'] = plan;
  } catch (_) {
    headers['X-Phuglee-User'] = 'admin';
    headers['X-Phuglee-Plan'] = 'max';
  }
  // Prefer apiFetch so shell headers apply; resolveModuleApiUrl keeps /api/leads unprefixed.
  const doFetch = (typeof apiFetch === 'function')
    ? (u, opts) => apiFetch(u, opts)
    : (u, opts) => fetch(u, { credentials: 'same-origin', ...opts });
  return doFetch(url, { method: 'POST', headers, body: payload })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json().catch(() => ({ ok: true }));
    })
    .then((body) => {
      invalidateVaultMetaCache?.();
      if (!state.reviewMode) {
        void refreshVaultSummaryRow?.({ force: true, instant: true });
        updateSummaryStats?.({ force: true, forceVault: true });
      }
      return { ok: true, body };
    })
    .catch((err) => {
      console.warn('[Vault] publish-from-analyzer failed', err?.message || err);
      const now = Date.now();
      if (!R._vaultPublishFailToastAt || now - R._vaultPublishFailToastAt > 15000) {
        R._vaultPublishFailToastAt = now;
        try {
          DistressPersistence?.showToast?.('Vault publish failed — will retry. Lead saved in Analyze.', 'error', 5000);
        } catch (_) {}
      }
      return { ok: false, error: err };
    });
};

R.unmarkReviewedKey = function unmarkReviewedKey(filter, key) {
  if (!key || !state.reviewedKeysByFilter || !filter || filter === 'all') return;
  state.reviewedKeysByFilter[filter] = (state.reviewedKeysByFilter[filter] || []).filter(k => k !== key);
  if (state._reviewedKeySets?.[filter]) state._reviewedKeySets[filter].delete(key);
}

/** Persist review position only — do not bulk-mark leads as reviewed when leaving a queue. */
R.commitReviewedThroughIndex = function commitReviewedThroughIndex(filter = state.reviewFilter) {
  if (!filter || filter === 'all') return;
  sessionDirty = true;
}

R.buildReviewQueue = function buildReviewQueue(filter, opts = {}) {
  const snap = scanReviewFilterSnapshot(filter);
  if (opts.includeReviewed) return snap.allKeys;
  return snap.pendingKeys;
}

R.isReviewedInFilter = function isReviewedInFilter(filter, key) {
  if (!filter || !key) return false;
  const r = findResultByKey(key);
  if (!r) return false;
  if (filter === 'review' && r.needsReviewLater) return false;
  if (r.reviewResolved) return true;
  // Soft vias are queue progress — same rule as isExcludedFromAllReviewQueues / isManuallyReviewed.
  return typeof isManuallyReviewed === 'function' ? isManuallyReviewed(r) : !!r.manuallyReviewed;
}

R.purgeGhostReviewedKeys = function purgeGhostReviewedKeys() {
  if (!state.reviewedKeysByFilter) return 0;
  const byKey = typeof ensureResultKeyIndex === 'function'
    ? ensureResultKeyIndex()
    : new Map(state.results.map((r, i) => [recordKey(r), i]));
  let changed = 0;
  for (const f of REVIEW_FILTER_BUCKETS) {
    const bucket = state.reviewedKeysByFilter[f] || [];
    const kept = [];
    for (const key of bucket) {
      const idx = byKey.get(key);
      const r = idx != null && idx >= 0 ? state.results[idx] : null;
      if (!r || r.manuallyReviewed || r.reviewResolved) {
        kept.push(key);
        continue;
      }
      changed++;
    }
    state.reviewedKeysByFilter[f] = kept;
  }
  if (changed && typeof notifyResultMutation === 'function') notifyResultMutation();
  return changed;
}

R.hasActiveReviewProgress = function hasActiveReviewProgress(filter = state.reviewFilter) {
  return state.reviewFilter === filter
    && state.reviewQueue.length > 0
    && state.reviewIndex < state.reviewQueue.length;
}

R.stashReviewProgress = function stashReviewProgress(filter = state.reviewFilter) {
  if (!filter || filter === 'all') return;
  if (!state.reviewQueue.length && !state.reviewStats.kept && !state.reviewStats.changed) return;
  if (!state.reviewProgressByFilter) state.reviewProgressByFilter = {};
  state.reviewProgressByFilter[filter] = {
    queue: [...state.reviewQueue],
    index: state.reviewIndex,
    stats: { ...state.reviewStats },
    undo: cloneReviewUndoStack(state.reviewUndoStack)
  };
}

R.sanitizeReviewQueue = function sanitizeReviewQueue(queue, filter = state.reviewFilter) {
  return (queue || []).filter((key) => {
    const r = findResultByKey(key);
    return r && matchesReviewFilter(r, filter) && !isExcludedFromAllReviewQueues(r, key, filter);
  });
}

/**
 * True when a mid-review stash/queue is far behind current pending leads
 * (classic bug: resume 2-item Distressed queue after a 5k scan left ~900 pending).
 */
R.isReviewQueueStaleVsPending = function isReviewQueueStaleVsPending(filter, queue) {
  const snap = typeof scanReviewFilterSnapshot === 'function'
    ? scanReviewFilterSnapshot(filter)
    : null;
  const pendingKeys = snap?.pendingKeys || [];
  const pending = pendingKeys.length;
  if (!pending) return false;
  const cleaned = sanitizeReviewQueue(queue || [], filter);
  if (!cleaned.length && pending > 0) return true;
  if (pending > cleaned.length + 2) return true;
  const qSet = new Set(cleaned);
  let missing = 0;
  for (const key of pendingKeys) {
    if (!qSet.has(key)) missing++;
    if (missing > 2) return true;
  }
  return false;
};

/** Drop stashed progress that cannot represent the current awaiting-review set. */
R.discardStaleReviewProgress = function discardStaleReviewProgress(filter) {
  if (!filter || filter === 'all') return false;
  const saved = state.reviewProgressByFilter?.[filter];
  if (!saved?.queue?.length) return false;
  if (!isReviewQueueStaleVsPending(filter, saved.queue)) return false;
  delete state.reviewProgressByFilter[filter];
  return true;
};

R.clearAllReviewProgressStashes = function clearAllReviewProgressStashes() {
  state.reviewProgressByFilter = {};
};

R.restoreReviewProgress = function restoreReviewProgress(filter) {
  discardStaleReviewProgress(filter);
  const saved = state.reviewProgressByFilter?.[filter];
  if (!saved || !saved.queue?.length || saved.index >= saved.queue.length) return false;
  let queue = sanitizeReviewQueue(saved.queue, filter);
  if (!queue.length) return false;

  // Append any new pending keys that arrived after the stash (small deltas only;
  // large gaps are discarded above so openReviewMode rebuilds the full queue).
  const snap = typeof scanReviewFilterSnapshot === 'function'
    ? scanReviewFilterSnapshot(filter)
    : null;
  const pendingKeys = snap?.pendingKeys || [];
  if (pendingKeys.length) {
    const qSet = new Set(queue);
    const extras = pendingKeys.filter((key) => !qSet.has(key));
    if (extras.length) queue = queue.concat(extras);
  }

  state.reviewFilter = filter;
  state.reviewQueue = queue;
  state.reviewIndex = Math.min(saved.index, queue.length - 1);
  state.reviewStats = { ...(saved.stats || {}) };
  state.reviewUndoStack = cloneReviewUndoStack(saved.undo);
  return true;
}

R.showReviewOverlay = function showReviewOverlay() {
  reviewModeOverlay.hidden = false;
  reviewModeOverlay.classList.add('open');
  document.body.classList.add('review-mode-active');
  document.body.style.overflow = 'hidden';
  updateReviewModeChrome();
  // Pull focus out of dashboard search/settings so 1–7 shortcuts work immediately.
  try {
    const ae = document.activeElement;
    if (ae && typeof ae.blur === 'function' && ae !== document.body) ae.blur();
  } catch (_) {}
  if (reviewModeInner) {
    if (!reviewModeInner.hasAttribute('tabindex')) reviewModeInner.setAttribute('tabindex', '-1');
    try { reviewModeInner.focus({ preventScroll: true }); } catch (_) {
      try { reviewModeInner.focus(); } catch (__) {}
    }
  }
}

R.hideReviewOverlay = function hideReviewOverlay() {
  reviewModeOverlay?.classList.remove('open');
  if (reviewModeOverlay) reviewModeOverlay.hidden = true;
  document.body.classList.remove('review-mode-active');
  if (!state.propertyModalOpen && !imageLightbox.classList.contains('open') && !scoreEditModal?.classList.contains('open')) {
    document.body.style.overflow = '';
  }
}


// DOM bindings (deferred to end of module — handlers defined above)
R.applyTierUiLabelsToChrome = function applyTierUiLabelsToChrome() {
  document.querySelectorAll('.review-leads-item[data-review-flow]').forEach((btn) => {
    const flow = btn.dataset.reviewFlow;
    if (flow) btn.textContent = tierUiLabel(flow);
  });
  // Filter bar bases (counts reapplied by updateFilterLabels when results exist)
  document.querySelectorAll('.filter-btn[data-filter]').forEach((btn) => {
    const f = btn.dataset.filter;
    if (!f) return;
    // Keep count suffix if already present
    const cur = String(btn.textContent || '');
    const m = cur.match(/\s*\((\d[\d,]*)\)\s*$/);
    const countPart = m ? ` (${m[1]})` : '';
    btn.textContent = tierUiLabel(f) + countPart;
  });
};
applyTierUiLabelsToChrome();

openUploadModalBtn?.addEventListener('click', openUploadModal);
openSettingsBtn?.addEventListener('click', openSettingsModal);
openBrainBtn?.addEventListener('click', openBrainModal);
settingsModalClose?.addEventListener('click', () => closeToolModal(settingsModal));
settingsModalBackdrop?.addEventListener('click', () => closeToolModal(settingsModal));
uploadModalClose?.addEventListener('click', () => closeToolModal(uploadModal));
uploadModalBackdrop?.addEventListener('click', () => closeToolModal(uploadModal));
brainModalClose?.addEventListener('click', () => closeToolModal(brainModal));
brainModalBackdrop?.addEventListener('click', () => closeToolModal(brainModal));
$('apiUsageOpenBtn')?.addEventListener('click', () => openApiUsageModal?.());
$('deskExportExcelBtn')?.addEventListener('click', () => {
  if (deskExportExcelBtn?.disabled || !state.results?.length || state.running) return;
  exportResults('xlsx', { scope: 'all', profile: 'full' });
});
$('deskExportDialReadyBtn')?.addEventListener('click', () => {
  if (deskExportDialReadyBtn?.disabled || !state.results?.length || state.running) return;
  void exportResults('xlsx', { scope: 'all', profile: 'dial_ready' });
});
$('apiUsageModalClose')?.addEventListener('click', () => closeToolModal($('apiUsageModal')));
$('apiUsageModalBackdrop')?.addEventListener('click', () => closeToolModal($('apiUsageModal')));

resetUploadBtn.addEventListener('click', async () => {
  if (state.running) {
    alert('Cannot reset while a scan is running. Hit Stop first.');
    return;
  }
  if (!state.records.length && !state.results.length && !state.fileName) return;

  const msg = state.results.length
    ? 'Clear the uploaded file, all results, and saved progress? You can upload a new spreadsheet after.'
    : 'Clear the uploaded file and start over?';
  const ok = window.DistressPersistence
    ? await DistressPersistence.confirmDestructive('Clear upload and results?', msg)
    : confirm(msg);
  if (!ok) return;

  clearSession();
  log('Upload reset — ready for a new file', 'success');
});

function closeFilterOverflowMenu() {
  const menu = $('filterOverflowMenu');
  const toggle = $('filterOverflowToggle');
  if (menu) menu.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

$('filterOverflowToggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = $('filterOverflowMenu');
  const toggle = $('filterOverflowToggle');
  if (!menu || !toggle) return;
  const open = menu.hidden;
  menu.hidden = !open;
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

document.querySelectorAll('.filter-segment-btn').forEach(btn => {
  btn.addEventListener('click', () => closeFilterOverflowMenu());
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#filterOverflowGroup')) closeFilterOverflowMenu();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => setFilter(btn.dataset.filter));
});

$('leadTypeFilter')?.addEventListener('change', (e) => {
  state.leadTypeFilter = e.target.value || 'all';
  resetDisplayLimit();
  const list = getFilteredResults();
  if (!list.some(r => recordKey(r) === state.selectedKey)) {
    closePropertyModal({ save: false });
  }
  renderResults({ force: true });
  updateAppNav();
  updateExportButtons();
  updateFilterLabels();
  scheduleSaveSession('lead-type-filter');
});

$('importLeadTypeSelect')?.addEventListener('change', (e) => {
  state.importLeadType = normalizeLeadType(e.target.value);
  if (typeof updateImportLandRouteHint === 'function') updateImportLandRouteHint();
});

bindDistressedSummaryClick($('sumDistressedKpiCard'));

$('sumWellMaintainedCard')?.addEventListener('click', (e) => {
  e.preventDefault();
  openBucketReviewFromKpi('well_maintained');
});
$('sumVacantCard')?.addEventListener('click', (e) => {
  e.preventDefault();
  openBucketReviewFromKpi('vacant');
});
$('sumReviewCard')?.addEventListener('click', (e) => {
  e.preventDefault();
  openBucketReviewFromKpi('review');
});
$('sumBlurredCard')?.addEventListener('click', (e) => {
  e.preventDefault();
  openBucketReviewFromKpi('blurred');
});
$('sumSatelliteOnlyCard')?.addEventListener('click', (e) => {
  e.preventDefault();
  openBucketReviewFromKpi('satellite_only');
});

// Vault deep links: the shell proxy rewrites href="/vault" → "/analyzer/vault" (404),
// so navigate via JS with a string the rewriter leaves alone. leadType lands on the right tab.
R.gotoVault = function gotoVault(leadType) {
  const base = '/' + 'vault';
  window.location.href = leadType ? `${base}?leadType=${encodeURIComponent(leadType)}` : base;
};

document.querySelectorAll('.summary-vault-link').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    gotoVault(a.dataset.vaultLeadType || '');
  });
});

// Map a review filter to its Vault catalog tab (null when the bucket has no Vault type).
R.reviewFilterToVaultLeadType = function reviewFilterToVaultLeadType(filter) {
  if (filter === 'distressed') return 'distressed';
  if (filter === 'well_maintained') return 'well_maintained';
  if (filter === 'vacant') return 'land';
  return '';
};

// Post-review CTA: send the operator into The Vault for the bucket just worked.
R.updateReviewVaultCta = function updateReviewVaultCta(filter, approvedCount) {
  const cta = $('reviewVaultCta');
  if (!cta) return;
  const leadType = reviewFilterToVaultLeadType(filter);
  cta.dataset.vaultLeadType = leadType;
  if (leadType) {
    const label = typeof reviewFilterLabel === 'function' ? reviewFilterLabel(filter) : 'these leads';
    cta.textContent = approvedCount > 0
      ? `${approvedCount.toLocaleString()} approved → Open ${label} in The Vault →`
      : `Open ${label} in The Vault →`;
  } else {
    cta.textContent = 'Open The Vault →';
  }
  cta.hidden = false;
};

$('reviewVaultCta')?.addEventListener('click', (e) => {
  e.preventDefault();
  gotoVault(e.currentTarget.dataset.vaultLeadType || '');
});

const sidebarOverflowGroup = $('sidebarOverflowGroup');
const sidebarOverflowToggle = $('sidebarOverflowToggle');
const sidebarOverflowMenu = $('sidebarOverflowMenu');

function closeSidebarOverflow() {
  sidebarOverflowGroup?.classList.remove('open');
  if (sidebarOverflowToggle) sidebarOverflowToggle.setAttribute('aria-expanded', 'false');
  if (sidebarOverflowMenu) sidebarOverflowMenu.hidden = true;
}

sidebarOverflowToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  sidebarReviewGroup?.classList.remove('open');
  sidebarSettingsGroup?.classList.remove('open');
  sidebarManageDataGroup?.classList.remove('open');
  if (sidebarReviewToggle) sidebarReviewToggle.setAttribute('aria-expanded', 'false');
  if (sidebarSettingsToggle) sidebarSettingsToggle.setAttribute('aria-expanded', 'false');
  if (sidebarManageDataToggle) sidebarManageDataToggle.setAttribute('aria-expanded', 'false');
  const open = sidebarOverflowGroup?.classList.toggle('open');
  if (sidebarOverflowToggle) sidebarOverflowToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (sidebarOverflowMenu) sidebarOverflowMenu.hidden = !open;
});

sidebarReviewToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeSidebarOverflow();
  const open = sidebarReviewGroup?.classList.toggle('open');
  if (sidebarReviewToggle) sidebarReviewToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});
sidebarReviewDistressedBtn?.addEventListener('click', () => {
  if (sidebarReviewDistressedBtn.disabled) return;
  if (state.reviewMode && state.reviewFilter === 'distressed') {
    showReviewOverlay();
    renderReviewLead();
    return;
  }
  openReviewMode('distressed');
});
sidebarReviewWellMaintainedBtn?.addEventListener('click', () => {
  if (sidebarReviewWellMaintainedBtn.disabled) return;
  if (state.reviewMode && state.reviewFilter === 'well_maintained') {
    showReviewOverlay();
    renderReviewLead();
    return;
  }
  openReviewMode('well_maintained');
});
sidebarReviewLandBtn?.addEventListener('click', () => {
  if (sidebarReviewLandBtn.disabled) return;
  if (state.reviewMode && state.reviewFilter === 'vacant') {
    showReviewOverlay();
    renderReviewLead();
    return;
  }
  openReviewMode('vacant');
});
sidebarReviewNeedsReviewBtn?.addEventListener('click', () => {
  if (sidebarReviewNeedsReviewBtn.disabled) return;
  if (state.reviewMode && state.reviewFilter === 'review') {
    showReviewOverlay();
    renderReviewLead();
    return;
  }
  openReviewMode('review');
});

R.toggleSidebarGroup = function toggleSidebarGroup(group, toggle) {
  if (!group) return false;
  const open = group.classList.toggle('open');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  return open;
}

sidebarSettingsToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  sidebarManageDataGroup?.classList.remove('open');
  if (sidebarManageDataToggle) sidebarManageDataToggle.setAttribute('aria-expanded', 'false');
  toggleSidebarGroup(sidebarSettingsGroup, sidebarSettingsToggle);
});
sidebarManageDataToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  sidebarSettingsGroup?.classList.remove('open');
  if (sidebarSettingsToggle) sidebarSettingsToggle.setAttribute('aria-expanded', 'false');
  toggleSidebarGroup(sidebarManageDataGroup, sidebarManageDataToggle);
});
sidebarExportExcelBtn?.addEventListener('click', () => {
  if (sidebarExportExcelBtn.disabled) return;
  exportResults('xlsx', { scope: 'all', profile: 'full' });
});
sidebarExportCsvBtn?.addEventListener('click', () => {
  if (sidebarExportCsvBtn.disabled) return;
  exportResults('csv', { scope: 'current' });
});
sidebarExportAllBtn?.addEventListener('click', () => {
  if (sidebarExportAllBtn.disabled) return;
  void exportResults('xlsx', { scope: 'all', profile: 'dial_ready' });
});
R.runSaveBackupCheckpoint = async function runSaveBackupCheckpoint(source = 'menu') {
  const btn = source === 'settings' ? sidebarSettingsSaveBackupBtn : sidebarSaveBackupBtn;
  if (btn?.disabled) return;
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';
  }
  try {
    if (window.DistressPersistence?.exportBackupNow) {
      await DistressPersistence.exportBackupNow();
    } else if (window.DistressPersistence?.saveBackupCheckpoint) {
      await DistressPersistence.saveBackupCheckpoint();
    } else {
      saveSession('manual');
      $('saveBackupNowBtn')?.click();
    }
  } catch (e) {
    console.warn('Backup checkpoint failed', e);
    DistressPersistence?.showToast?.('Backup failed — try again', 'error', 5000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel || 'Export backup now';
    }
  }
}

sidebarSettingsSaveBackupBtn?.addEventListener('click', () => runSaveBackupCheckpoint('settings'));
sidebarLoadBackupBtn?.addEventListener('click', () => $('loadBackupBtn')?.click());
sidebarSaveBackupBtn?.addEventListener('click', () => runSaveBackupCheckpoint('manage'));
document.addEventListener('click', (e) => {
  if (e.target.closest('.sidebar-nav-group')) return;
  sidebarSettingsGroup?.classList.remove('open');
  sidebarManageDataGroup?.classList.remove('open');
  closeSidebarOverflow();
  if (sidebarSettingsToggle) sidebarSettingsToggle.setAttribute('aria-expanded', 'false');
  if (sidebarManageDataToggle) sidebarManageDataToggle.setAttribute('aria-expanded', 'false');
});
R.focusReviewShortcuts = function focusReviewShortcuts() {
  if (!state.reviewMode || !reviewModeInner) return;
  if (!reviewModeInner.hasAttribute('tabindex')) reviewModeInner.setAttribute('tabindex', '-1');
  try { reviewModeInner.focus({ preventScroll: true }); } catch (_) {
    try { reviewModeInner.focus(); } catch (__) {}
  }
};

// Exit must always respond — never wait on network before closing overlay.
function wireReviewExitClick(btn) {
  if (!btn || btn.dataset.exitWired === '1') return;
  btn.dataset.exitWired = '1';
  btn.type = 'button';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const fn = (typeof closeReviewMode === 'function')
        ? closeReviewMode
        : (typeof R !== 'undefined' && typeof R.closeReviewMode === 'function' ? R.closeReviewMode : null);
      if (fn) {
        const p = fn();
        if (p && typeof p.catch === 'function') p.catch((err) => console.warn('[Review exit]', err));
      } else {
        // Last-resort UI close if binder missing
        state.reviewMode = false;
        hideReviewOverlay?.();
      }
    } catch (err) {
      console.warn('[Review exit] click failed', err);
      try {
        state.reviewMode = false;
        hideReviewOverlay?.();
      } catch (_) {}
    }
  });
}
wireReviewExitClick(reviewExitBtn);
wireReviewExitClick(reviewCompleteExitBtn);
// Also bind via document in case node refs were stale at boot
document.getElementById('reviewExitBtn') && wireReviewExitClick(document.getElementById('reviewExitBtn'));
document.getElementById('reviewCompleteExitBtn') && wireReviewExitClick(document.getElementById('reviewCompleteExitBtn'));
// Full Profile is optional chrome — never throw if the node/ref is missing (that used to
// abort the rest of session.js and kill Keep/keyboard wiring + reviewAdvancesSinceSave init).
(typeof reviewFullProfileBtn !== 'undefined' ? reviewFullProfileBtn : $('reviewFullProfileBtn'))
  ?.addEventListener('click', () => {
    // Open the current lead's full profile over the Review overlay. This never touches
    // reviewQueue/reviewIndex, so closing the profile (Esc / ×) returns to the same spot.
    if (!state.reviewMode) return;
    const r = typeof getReviewRecord === 'function' ? getReviewRecord() : null;
    if (!r || typeof showInspector !== 'function') return;
    showInspector(r, { scrollList: false, scrollFeed: false, animateGauge: false });
  });
reviewKeepBtn?.addEventListener('click', () => { reviewKeep(); focusReviewShortcuts(); });
reviewChangeBtn?.addEventListener('click', () => { void reviewApplyChange(); focusReviewShortcuts(); });
reviewDeferBtn?.addEventListener('click', () => { reviewDeferLater(); focusReviewShortcuts(); });
reviewLandBtn?.addEventListener('click', () => { reviewLandKeep(); focusReviewShortcuts(); });
reviewBlurredBtn?.addEventListener('click', () => { reviewApplyBlurred(); focusReviewShortcuts(); });
reviewSatelliteOnlyBtn?.addEventListener('click', () => { reviewApplySatelliteOnly(); focusReviewShortcuts(); });
reviewUndoBtn?.addEventListener('click', () => { reviewUndo(); focusReviewShortcuts(); });
reviewImages?.addEventListener('click', (e) => {
  const img = e.target.closest('img');
  if (!img?.src) return;
  const r = getReviewRecord();
  const view = img.id === 'reviewSatImg' ? 'Satellite' : 'Street View';
  openLightbox(img.src, r?.address ? `${view} — ${r.address}` : view);
});

prevPropBtn.addEventListener('click', () => navigateProperty(-1));
nextPropBtn.addEventListener('click', () => navigateProperty(1));
closePropertyBtn?.addEventListener('click', () => closePropertyModal());
propertyModalBackdrop?.addEventListener('click', () => closePropertyModal());
scoreEditClose?.addEventListener('click', () => closeScoreEditModal());
scoreEditCancel?.addEventListener('click', () => closeScoreEditModal());
scoreEditBackdrop?.addEventListener('click', () => closeScoreEditModal());
scoreEditSave?.addEventListener('click', () => {
  const r = state.results.find(x => recordKey(x) === state.scoreEditRecordKey);
  if (r && state.scoreEditSelectedTier) applyScoreCorrection(r, state.scoreEditSelectedTier);
});
bulkSelectToggleBtn?.addEventListener('click', () => setBulkSelectMode(!state.bulkSelectMode));
cardsGrid?.addEventListener('click', onCardsGridClick);
resultsBody?.addEventListener('click', onResultsBodyClick);
$('bulkSelectAllBtn')?.addEventListener('click', selectAllVisibleBulk);
$('bulkClearBtn')?.addEventListener('click', clearBulkSelection);
$('bulkDoneBtn')?.addEventListener('click', () => setBulkSelectMode(false));
$('bulkTierDistressedBtn')?.addEventListener('click', () => bulkApplyTier('distressed'));
$('bulkTierWellMaintainedBtn')?.addEventListener('click', () => bulkApplyTier('well_maintained'));
$('bulkCatVacantBtn')?.addEventListener('click', () => bulkApplyCategory('vacant_lot'));
$('bulkCatPropertyBtn')?.addEventListener('click', () => bulkApplyCategory('property'));
scanFeedImages?.addEventListener('click', (e) => {
  const img = e.target.closest('img');
  if (img?.src) {
    const addr = state.scanLiveSnapshot?.address || '';
    const view = img.id === 'scanFeedSatImg' ? 'Satellite' : (scanFeedWrap.classList.contains('satellite-target') ? 'Satellite' : 'Street View');
    openLightbox(img.src, addr ? `${view} — ${addr}` : view);
    return;
  }
  pinLiveScan();
});
previewImages?.addEventListener('click', (e) => {
  // Profile hero stays in the dossier — use Satellite button for lightbox zoom.
  e.preventDefault();
});
lightboxClose?.addEventListener('click', closeLightbox);
lightboxBackdrop?.addEventListener('click', closeLightbox);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && imageLightbox.classList.contains('open')) closeLightbox();
});

R.searchDebounceTimer = null;
resultSearch?.addEventListener('input', () => {
  state.searchQuery = resultSearch.value;
  resetDisplayLimit();
  resetVirtualScrollPosition();
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null;
    const list = getFilteredResults();
    if (!list.some(r => recordKey(r) === state.selectedKey)) {
      closePropertyModal({ save: false });
    }
    renderResults({ force: true });
    updateAppNav();
    updateExportButtons();
    scheduleSaveSession('search');
  }, 320);
});

resultsLoadMoreBtn?.addEventListener('click', async () => {
  state.displayLimit = (state.displayLimit || getDisplayLimitInitial()) + getDisplayLimitStep();
  // If deferred hydration hasn't finished, pull more results so Load more isn't empty
  if (sessionLoadState && !sessionLoadState.complete && typeof ensureSessionResultsLoaded === 'function') {
    const need = state.displayLimit + 40;
    if ((state.results?.length || 0) < need) {
      await ensureSessionResultsLoaded();
    }
  }
  // Attach any disk-cache hits from the imagery index for newly visible rows
  if (typeof hydrateImageryFromServerIndex === 'function') {
    try { await hydrateImageryFromServerIndex({ deferSave: true }); } catch (_) {}
  }
  renderResults({ force: true });
  // Kick near-viewport thumbs only (queued for live SV — no stampede)
  requestAnimationFrame(() => preloadAnalyzeCardThumbs?.());
});

document.addEventListener('keydown', (e) => {
  const tierPickOpen = !!(reviewTierPickOverlay
    && !reviewTierPickOverlay.hidden
    && reviewTierPickOverlay.classList.contains('open'));
  if (tierPickOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeReviewTierPicker(null);
    }
    return;
  }
  if (state.reviewMode) {
    // Full profile open over Review: Esc closes the profile back to the queue (does not
    // exit Review); review number shortcuts pause until the profile is closed.
    if (state.propertyModalOpen) {
      if (e.key === 'Escape' && !imageLightbox.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        closePropertyModal();
        return;
      }
      return;
    }
    // Number shortcuts must work even if focus was left on dashboard search/settings.
    if (e.key === 'Escape' && !imageLightbox.classList.contains('open')) {
      e.preventDefault();
      closeReviewMode();
      return;
    }
    if (imageLightbox.classList.contains('open')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Ignore key-repeat — holding 1 was firing Keep faster than imagery could keep up.
    if (e.repeat) return;

    const code = String(e.code || '');
    const digit = (
      /^Digit([1-7])$/.test(code) ? code.slice(5)
        : /^Numpad([1-7])$/.test(code) ? code.slice(6)
          : /^[1-7]$/.test(e.key) ? e.key
            : ''
    );
    if (!digit) return;

    e.preventDefault();
    e.stopPropagation();
    const kind = getReviewKind();
    // Distressed / Well Maintained: 1 Keep · 2 opposite · 3 Land · 4 Blocked · 5 Satellite · 6 Undo
    if (kind === 'tier') {
      if (digit === '1') { reviewKeep(); return; }
      if (digit === '2') { void reviewApplyChange(); return; }
      if (digit === '3') { reviewLandKeep(); return; }
      if (digit === '4') { reviewApplyBlurred(); return; }
      if (digit === '5') { reviewApplySatelliteOnly(); return; }
      if (digit === '6') { reviewUndo(); return; }
      return;
    }
    if (digit === '1') { reviewKeep(); return; }
    if (digit === '2') { void reviewApplyChange(); return; }
    if (digit === '3') {
      if (kind === 'needs_review') reviewLandKeep();
      else if (kind === 'land') reviewUndo();
      return;
    }
    if (digit === '4') {
      if (kind === 'needs_review') reviewDeferLater();
      return;
    }
    if (digit === '5') { reviewApplyBlurred(); return; }
    if (digit === '6') {
      if (kind === 'needs_review' || kind === 'satellite_only') reviewUndo();
      return;
    }
    if (digit === '7') { reviewApplySatelliteOnly(); return; }
    return;
  }
  if (e.target.matches?.('input, textarea, select')) {
    if (e.key === '/' && e.target !== resultSearch) {
      e.preventDefault();
      resultSearch?.focus();
    }
    return;
  }
  if (e.key === '/') {
    e.preventDefault();
    resultSearch?.focus();
    return;
  }
  if (e.key === 'Escape' && !imageLightbox.classList.contains('open')) {
    if ($('cmdPalette')?.classList.contains('open')) {
      closeCmdPalette?.();
      return;
    }
    if (openToolModalId) {
      closeAllToolModals();
      return;
    }
    if (scoreEditModal?.classList.contains('open')) {
      closeScoreEditModal();
      return;
    }
    if (state.propertyModalOpen) {
      closePropertyModal();
      return;
    }
    return;
  }
  if (!state.propertyModalOpen || !state.results.length) return;
  if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
    e.preventDefault();
    navigateProperty(1);
  } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    navigateProperty(-1);
  }
}, true);

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => setViewMode(btn.dataset.view));
});


R.reviewProgressSaveTimer = null;
R.reviewAdvancesSinceSave = 0;

  }
  PDA.session = {
    get buildSessionPayload() { return R.buildSessionPayload; },
    get buildSessionSummaryStub() { return R.buildSessionSummaryStub; },
    get performLocalPersist() { return R.performLocalPersist; },
    get loadSession() { return R.loadSession; },
    get fetchServerSessionBackup() { return R.fetchServerSessionBackup; },
    get fetchSessionSummary() { return R.fetchSessionSummary; },
    get fetchSessionResultsPage() { return R.fetchSessionResultsPage; },
    get applyPayloadWithUi() { return R.applyPayloadWithUi; },
    get sessionDataRank() { return R.sessionDataRank; },
    get pushIncrementalScanResult() { return R.pushIncrementalScanResult; },
    get saveSession() { return R.saveSession; },
    get scheduleSaveSession() { return R.scheduleSaveSession; },
    get flushSaveSession() { return R.flushSaveSession; },
    get clearSession() { return R.clearSession; },
    get primeSessionFromLocalStorage() { return R.primeSessionFromLocalStorage; },
    get clearBrowserSessionCache() { return R.clearBrowserSessionCache; },
    get setSessionRestoreBanner() { return R.setSessionRestoreBanner; },
    get updateSessionSaveStatus() { return R.updateSessionSaveStatus; },
    get sessionSaveEveryN() { return R.sessionSaveEveryN; },
    get scanSaveHeartbeatMs() { return R.scanSaveHeartbeatMs; }
  };
})(window);
