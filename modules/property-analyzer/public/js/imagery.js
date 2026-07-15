// imagery.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  if (typeof window !== 'undefined') window.PDA = PDA;
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {

R.brainSaveTimer = null;
R.reviewImagePreloadCache = new Map();
R.reviewImagePreloadOrder = [];
R.reviewChromeKey = '';
R.reviewRenderGen = 0;
R.reviewQueueStatsSnap = null;
R.resultKeyToIdx = null;
R.resultKeyToIdxLen = -1;
R.resultKeyToIdxSource = null;

const iu = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.imageryUrls) ? PDA.lib.imageryUrls : null;

R.reviewImageryDeps = function reviewImageryDeps() {
  return {
    hasImageryKey,
    getCachedImageryUrls,
    buildStreetViewThumbUrl,
    buildSatelliteThumbUrl,
    apiKey: getApiKeyForImagery(),
    streetViewSize: REVIEW_STREET_VIEW_SIZE,
    satelliteSize: CARD_SAT_THUMB_SIZE
  };
}

R.getReviewImageUrls = function getReviewImageUrls(address, result = null) {
  if (!address || !result) return { streetView: null, satellite: null, fromCache: false };
  resolveImageryForResult(result);
  if (iu) return iu.resolveReviewImageUrls(result, reviewImageryDeps());
  if (!hasImageryKey()) return { streetView: null, satellite: null, fromCache: false };
  const cached = getCachedImageryUrls(result);
  if (cached.streetView || cached.satellite) {
    const streetView = streetViewUnavailableForRecord(result) ? null : cached.streetView;
    return {
      streetView,
      satellite: streetView ? null : cached.satellite,
      fromCache: true
    };
  }
  const key = getApiKeyForImagery();
  const viewMeta = result.viewMeta || null;
  const streetView = streetViewUnavailableForRecord(result)
    ? null
    : buildStreetViewThumbUrl(address, key, REVIEW_STREET_VIEW_SIZE, viewMeta);
  const satellite = streetView ? null : buildSatelliteThumbUrl(address, key, CARD_SAT_THUMB_SIZE, viewMeta);
  return { streetView, satellite, fromCache: false };
}

R.invalidateResultKeyIndex = function invalidateResultKeyIndex() {
  resultKeyToIdx = null;
  resultKeyToIdxLen = -1;
  resultKeyToIdxSource = null;
}

R.ensureResultKeyIndex = function ensureResultKeyIndex() {
  const len = state.results.length;
  if (resultKeyToIdx && resultKeyToIdxSource === state.results && resultKeyToIdxLen === len) {
    return resultKeyToIdx;
  }
  resultKeyToIdx = new Map();
  for (let i = 0; i < len; i++) {
    resultKeyToIdx.set(recordKey(state.results[i]), i);
  }
  resultKeyToIdxLen = len;
  resultKeyToIdxSource = state.results;
  return resultKeyToIdx;
}

/** Merge lean review-queue rows into state.results without wiping the session. */
R.mergeReviewQueueResults = function mergeReviewQueueResults(incoming = []) {
  if (!Array.isArray(incoming) || !incoming.length) return 0;
  const idx = ensureResultKeyIndex();
  let added = 0;
  const identityKeys = ['email', 'phone', 'address', 'street', 'leadTier', 'category'];
  for (const r of incoming) {
    if (!r) continue;
    const key = recordKey(r);
    if (!key || key === '||') continue;
    const at = idx.get(key);
    if (at != null && at >= 0) {
      const prev = state.results[at] || {};
      const merged = { ...prev };
      for (const [k, v] of Object.entries(r)) {
        // Never let lean stubs wipe identity / tier with empty values (breaks Undo find-by-key).
        if (identityKeys.includes(k) && (v == null || v === '') && prev[k] != null && prev[k] !== '') {
          continue;
        }
        if (v === undefined) continue;
        merged[k] = v;
      }
      state.results[at] = merged;
    } else {
      idx.set(key, state.results.length);
      state.results.push(r);
      added++;
    }
  }
  invalidateResultKeyIndex();
  invalidateReviewSnapshotCache?.();
  return added;
};

/**
 * Fast path: server builds pending keys + first lean page so Review opens
 * without waiting for full ~16k client hydrate.
 */
R.fetchSessionReviewQueue = async function fetchSessionReviewQueue(filter, opts = {}) {
  const offset = Math.max(0, Number(opts.offset) || 0);
  const limit = Math.min(1000, Math.max(50, Number(opts.limit) || 300));
  const q = new URLSearchParams({
    filter: String(filter || ''),
    offset: String(offset),
    limit: String(limit)
  });
  const res = await apiFetch(`/api/session-review-queue?${q}`, { cache: 'no-store' });
  if (!res?.ok) {
    const err = await res?.json?.().catch(() => ({}));
    throw new Error(err?.error || `review-queue HTTP ${res?.status || 0}`);
  }
  return res.json();
};

R.prefetchRemainingReviewQueueResults = async function prefetchRemainingReviewQueueResults(filter, startOffset, pageSize = 300) {
  let offset = Math.max(0, Number(startOffset) || 0);
  const limit = Math.min(1000, Math.max(50, Number(pageSize) || 300));
  while (state.reviewMode && state.reviewFilter === filter) {
    let body;
    try {
      body = await fetchSessionReviewQueue(filter, { offset, limit });
    } catch (e) {
      console.warn('[review] prefetch remaining failed', e);
      break;
    }
    const rows = body?.results || [];
    if (rows.length) mergeReviewQueueResults(rows);
    if (!body?.hasMoreResults || !rows.length) break;
    offset += rows.length;
    await new Promise((r) => setTimeout(r, 0));
  }
  // Keep warming imagery as more rows land
  if (state.reviewMode && state.reviewFilter === filter) warmReviewImagery?.();
};

R.preloadReviewImageUrl = function preloadReviewImageUrl(url) {
  url = resolveImageryPublicUrl(url);
  if (!url || reviewImagePreloadCache.has(url)) return;
  const max = REVIEW_PRELOAD_CACHE_MAX || 128;
  if (reviewImagePreloadCache.size >= max && reviewImagePreloadOrder.length) {
    const oldest = reviewImagePreloadOrder.shift();
    reviewImagePreloadCache.delete(oldest);
  }
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  reviewImagePreloadCache.set(url, img);
  reviewImagePreloadOrder.push(url);
}

R.isReviewImageReady = function isReviewImageReady(url) {
  if (!url) return false;
  const cached = reviewImagePreloadCache.get(url);
  return !!(cached?.complete && cached.naturalWidth);
}

R.setReviewImgSrc = function setReviewImgSrc(img, url) {
  if (!img) return;
  url = resolveImageryPublicUrl(url);
  if (!url) {
    img.style.display = 'none';
    img.removeAttribute('src');
    return;
  }
  img.style.display = 'block';
  if (img.getAttribute('src') === url && img.complete && img.naturalWidth) return;
  if (isCachedImageryUrl(url) || isReviewImageReady(url)) {
    img.classList.remove('img-fade');
    img.src = url;
    return;
  }
  setImgSrc(img, url);
}

R.prefetchReviewImageUrlsForRecord = function prefetchReviewImageUrlsForRecord(r) {
  if (!r) return;
  const urls = getReviewImageUrls(r.address, r);
  if (urls.streetView) preloadReviewImageUrl(urls.streetView);
  else if (urls.satellite) preloadReviewImageUrl(urls.satellite);
}

R.prefetchReviewQueueImages = function prefetchReviewQueueImages(fromIndex = state.reviewIndex, count = REVIEW_PREFETCH_AHEAD) {
  const ahead = Math.max(0, Number(count) || REVIEW_PREFETCH_AHEAD);
  for (let i = 0; i <= ahead; i++) {
    const key = state.reviewQueue[fromIndex + i];
    if (!key) break;
    prefetchReviewImageUrlsForRecord(findResultByKey(key));
  }
}

R.prefetchUpcomingReviewImages = function prefetchUpcomingReviewImages(fromIndex = state.reviewIndex) {
  prefetchReviewQueueImages(fromIndex, REVIEW_PREFETCH_AHEAD);
}

R.scheduleLearnedBrainSave = function scheduleLearnedBrainSave() {
  if (brainSaveTimer) return;
  brainSaveTimer = setTimeout(() => {
    brainSaveTimer = null;
    saveLearnedBrain({ silent: true });
  }, 2200);
}

R.flushLearnedBrainSave = function flushLearnedBrainSave() {
  if (brainSaveTimer) {
    clearTimeout(brainSaveTimer);
    brainSaveTimer = null;
  }
  saveLearnedBrain();
}

R.persistReviewProgress = function persistReviewProgress(opts = {}) {
  if (hasActiveReviewProgress()) stashReviewProgress(state.reviewFilter);
  reviewAdvancesSinceSave++;
  if (reviewProgressSaveTimer) {
    clearTimeout(reviewProgressSaveTimer);
    reviewProgressSaveTimer = null;
  }
  const reason = opts.reason || 'review-progress';
  const debounceMs = REVIEW_PROGRESS_DEBOUNCE_MS || 1500;
  const shouldFlushNow = !opts.defer && reviewAdvancesSinceSave >= REVIEW_SAVE_EVERY_N;
  if (!shouldFlushNow) {
    reviewProgressSaveTimer = setTimeout(() => {
      reviewProgressSaveTimer = null;
      reviewAdvancesSinceSave = 0;
      scheduleSaveSession(reason);
      if (typeof pushReviewMetadataToServer === 'function') {
        pushReviewMetadataToServer(reason);
      }
    }, debounceMs);
    return;
  }
  reviewAdvancesSinceSave = 0;
  scheduleSaveSession(reason);
  if (typeof pushReviewMetadataToServer === 'function') {
    pushReviewMetadataToServer(reason);
  }
}

R.flushReviewProgress = async function flushReviewProgress() {
  if (reviewProgressSaveTimer) {
    clearTimeout(reviewProgressSaveTimer);
    reviewProgressSaveTimer = null;
  }
  reviewAdvancesSinceSave = 0;
  // Always push Keep/Change stamps + reviewedKeys immediately (works mid-hydrate).
  let metaResult = { ok: false };
  if (typeof pushReviewMetadataToServer === 'function') {
    try {
      metaResult = await pushReviewMetadataToServer('review-exit', { immediate: true });
    } catch (e) {
      console.warn('[Review exit] metadata save failed', e);
      metaResult = { ok: false, error: e };
    }
  }
  // Full session save when hydrated; otherwise metadata patch already covered stamps.
  if (typeof isSessionReadyForServerSave === 'function' && isSessionReadyForServerSave()) {
    saveSession('review-exit');
  } else {
    pendingServerSave = true;
    sessionDirty = true;
    updateSessionSaveStatus?.();
  }
  return metaResult;
}

R.getReviewRecord = function getReviewRecord() {
  const key = state.reviewQueue[state.reviewIndex];
  if (!key) return null;
  return findResultByKey(key);
}

R.setReviewImages = function setReviewImages({ streetView = null, satellite = null, fromCache = false } = {}) {
  if (!reviewImages) return;
  const dual = !!(streetView && satellite);
  reviewImages.classList.toggle('dual', dual);
  if (reviewSatWrap) reviewSatWrap.hidden = !dual;

  const primaryUrl = streetView || satellite;
  const alreadyReady = !!(primaryUrl && (
    fromCache
    || isCachedImageryUrl(primaryUrl)
    || (typeof isReviewImageReady === 'function' && isReviewImageReady(primaryUrl))
  ));
  const remoteLoad = !!(primaryUrl && !alreadyReady);
  reviewImages.classList.toggle('loading', remoteLoad);

  const clearReviewLoading = () => reviewImages?.classList.remove('loading');
  const wireReviewLoad = (img) => {
    if (!img || !remoteLoad) return;
    const prevOnload = img.onload;
    const prevOnerror = img.onerror;
    img.onload = (e) => { prevOnload?.call(img, e); clearReviewLoading(); };
    img.onerror = (e) => { prevOnerror?.call(img, e); clearReviewLoading(); };
  };

  if (dual) {
    setReviewImgSrc(reviewSatImg, satellite);
    setReviewImgSrc(reviewSvImg, streetView);
    wireReviewLoad(reviewSvImg);
    if (reviewPlaceholder) reviewPlaceholder.style.display = 'none';
    if (reviewSvWrap) reviewSvWrap.classList.remove('satellite-target');
    if (reviewPaneLabel) reviewPaneLabel.textContent = 'Street View';
  } else if (streetView) {
    setReviewImgSrc(reviewSvImg, streetView);
    wireReviewLoad(reviewSvImg);
    if (reviewSatImg) reviewSatImg.style.display = 'none';
    if (reviewPlaceholder) reviewPlaceholder.style.display = 'none';
    if (reviewSvWrap) reviewSvWrap.classList.remove('satellite-target');
    if (reviewPaneLabel) reviewPaneLabel.textContent = 'Street View';
  } else if (satellite) {
    setReviewImgSrc(reviewSvImg, satellite);
    wireReviewLoad(reviewSvImg);
    if (reviewSatImg) reviewSatImg.style.display = 'none';
    if (reviewPlaceholder) reviewPlaceholder.style.display = 'none';
    if (reviewSvWrap) reviewSvWrap.classList.add('satellite-target');
    if (reviewPaneLabel) reviewPaneLabel.textContent = 'Satellite';
  } else {
    clearReviewLoading();
    if (reviewSvImg) {
      reviewSvImg.style.display = 'none';
      reviewSvImg.removeAttribute('src');
    }
    if (reviewSatImg) {
      reviewSatImg.style.display = 'none';
      reviewSatImg.removeAttribute('src');
    }
    if (reviewPlaceholder) reviewPlaceholder.style.display = 'flex';
    if (reviewSvWrap) reviewSvWrap.classList.remove('satellite-target');
  }
}

R.getReviewKind = function getReviewKind(filter = state.reviewFilter) {
  if (filter === 'vacant') return 'land';
  if (filter === 'review') return 'needs_review';
  if (filter === 'satellite_only') return 'satellite_only';
  return 'tier';
}

R.getReviewChangeTier = function getReviewChangeTier() {
  return state.reviewFilter === 'well_maintained' ? 'distressed' : 'well_maintained';
}

R.updateReviewEntryButtons = function updateReviewEntryButtons() {
  const distressedOn = state.reviewMode && state.reviewFilter === 'distressed';
  const wellOn = state.reviewMode && state.reviewFilter === 'well_maintained';
  const landOn = state.reviewMode && state.reviewFilter === 'vacant';
  const needsOn = state.reviewMode && state.reviewFilter === 'review';
  sidebarReviewDistressedBtn?.classList.toggle('active', distressedOn);
  sidebarReviewWellMaintainedBtn?.classList.toggle('active', wellOn);
  sidebarReviewLandBtn?.classList.toggle('active', landOn);
  sidebarReviewNeedsReviewBtn?.classList.toggle('active', needsOn);
  if (state.reviewMode) sidebarReviewGroup?.classList.add('open');
}

R.updateReviewModeChrome = function updateReviewModeChrome() {
  const kind = getReviewKind();
  const distressed = state.reviewFilter === 'distressed';
  const well = state.reviewFilter === 'well_maintained';
  const land = kind === 'land';
  const needsReview = kind === 'needs_review';
  const satelliteOnly = kind === 'satellite_only';
  reviewModeInner?.classList.toggle('review-kind-distressed', distressed);
  reviewModeInner?.classList.toggle('review-kind-well-maintained', well);
  reviewModeInner?.classList.toggle('review-kind-land', land);
  reviewModeInner?.classList.toggle('review-kind-needs-review', needsReview);
  reviewModeInner?.classList.toggle('review-kind-satellite-only', satelliteOnly);

  const labelTier = (key) => {
    if (typeof tierUiLabel === 'function') return tierUiLabel(key);
    if (typeof R.tierUiLabel === 'function') return R.tierUiLabel(key);
    return String(key || '');
  };

  if (reviewModeBadge) {
    if (satelliteOnly) reviewModeBadge.textContent = labelTier('satellite_only');
    else if (land) reviewModeBadge.textContent = labelTier('vacant');
    else if (needsReview) reviewModeBadge.textContent = labelTier('review');
    else if (distressed) reviewModeBadge.textContent = labelTier('distressed');
    else reviewModeBadge.textContent = labelTier('well_maintained');
  }

  const tierMode = kind === 'tier';
  if (reviewKeepBtn) {
    reviewKeepBtn.classList.remove('keep', 'change-tier', 'to-distressed', 'to-well-maintained', 'home');
    if (satelliteOnly) {
      reviewKeepBtn.classList.add('keep');
      reviewKeepBtn.innerHTML = `Keep ${labelTier('satellite_only')} <kbd>1</kbd>`;
      reviewKeepBtn.title = 'Keep parked for satellite-only re-scan (1)';
    } else if (land) {
      reviewKeepBtn.classList.add('keep');
      reviewKeepBtn.innerHTML = `Keep ${labelTier('vacant')} <kbd>1</kbd>`;
      reviewKeepBtn.title = 'Confirm vacant lot / land (1)';
    } else if (needsReview) {
      reviewKeepBtn.classList.add('change-tier', 'to-distressed');
      reviewKeepBtn.innerHTML = `${labelTier('distressed')} <kbd>1</kbd>`;
      reviewKeepBtn.title = 'Mark as distressed home (1)';
    } else {
      reviewKeepBtn.classList.add('keep');
      reviewKeepBtn.innerHTML = `Keep <kbd>1</kbd>`;
      reviewKeepBtn.title = 'AI got it right — advance (1)';
    }
  }

  if (reviewChangeBtn) {
    reviewChangeBtn.hidden = false;
    reviewChangeBtn.classList.remove('change-tier', 'home', 'to-well-maintained', 'to-distressed');
    if (satelliteOnly) {
      reviewChangeBtn.classList.add('home');
      reviewChangeBtn.innerHTML = `Home <kbd>2</kbd>`;
      reviewChangeBtn.title = 'Clear Satellite Only — mark as home (2)';
    } else if (tierMode) {
      const changeTier = getReviewChangeTier();
      const changeLabel = labelTier(changeTier);
      reviewChangeBtn.classList.add('change-tier');
      reviewChangeBtn.classList.toggle('to-well-maintained', changeTier === 'well_maintained');
      reviewChangeBtn.classList.toggle('to-distressed', changeTier === 'distressed');
      reviewChangeBtn.innerHTML = `${changeLabel} <kbd>2</kbd>`;
      reviewChangeBtn.title = `Move to ${changeLabel} (2)`;
    } else if (needsReview) {
      reviewChangeBtn.classList.add('change-tier', 'to-well-maintained');
      reviewChangeBtn.innerHTML = `${labelTier('well_maintained')} <kbd>2</kbd>`;
      reviewChangeBtn.title = 'Mark as well maintained home (2)';
    } else {
      reviewChangeBtn.classList.add('home');
      reviewChangeBtn.innerHTML = `Home <kbd>2</kbd>`;
      reviewChangeBtn.title = 'Mark as home — pick distressed or well maintained (2)';
    }
  }

  if (reviewLandBtn) {
    reviewLandBtn.hidden = !needsReview;
    if (needsReview) {
      reviewLandBtn.innerHTML = `${labelTier('vacant')} <kbd>3</kbd>`;
      reviewLandBtn.title = 'Mark as vacant lot / land (3)';
    }
  }

  if (reviewDeferBtn) {
    reviewDeferBtn.hidden = !(tierMode || needsReview);
    if (tierMode) {
      reviewDeferBtn.innerHTML = `Later <kbd>4</kbd>`;
      reviewDeferBtn.title = "Can't decide now — send to Needs Review queue (4)";
    } else if (needsReview) {
      reviewDeferBtn.innerHTML = `Later <kbd>4</kbd>`;
      reviewDeferBtn.title = 'Decide later — keep in Needs Review queue (4)';
    }
  }

  if (reviewBlurredBtn) {
    reviewBlurredBtn.hidden = false;
    reviewBlurredBtn.innerHTML = `${labelTier('blurred')} <kbd>5</kbd>`;
    reviewBlurredBtn.title = 'Cannot see or assess the home — move to Blocked Image list only (5)';
  }

  if (typeof reviewSatelliteOnlyBtn !== 'undefined' && reviewSatelliteOnlyBtn) {
    reviewSatelliteOnlyBtn.hidden = false;
    reviewSatelliteOnlyBtn.classList.toggle('is-current', satelliteOnly);
    reviewSatelliteOnlyBtn.innerHTML = `${labelTier('satellite_only')} <kbd>7</kbd>`;
    reviewSatelliteOnlyBtn.title = satelliteOnly
      ? 'Already in Satellite Only — use Keep to confirm (7)'
      : 'Park for satellite-only re-scan later (7)';
  }

  if (reviewUndoBtn) {
    if (tierMode || needsReview || satelliteOnly) {
      reviewUndoBtn.innerHTML = `Undo <kbd>6</kbd>`;
      reviewUndoBtn.title = 'Undo last change (6)';
    } else if (land) {
      reviewUndoBtn.innerHTML = `Undo <kbd>3</kbd>`;
      reviewUndoBtn.title = 'Undo last change (3)';
    } else {
      reviewUndoBtn.innerHTML = 'Undo';
      reviewUndoBtn.title = 'Undo last change';
    }
  }

  if (reviewShortcutChips) {
    if (land) {
      reviewShortcutChips.innerHTML = `
        <span class="review-shortcut-chip chip-keep"><kbd>1</kbd> Keep ${labelTier('vacant')}</span>
        <span class="review-shortcut-chip chip-well-maintained"><kbd>2</kbd> Home</span>
        <span class="review-shortcut-chip"><kbd>3</kbd> Undo</span>
        <span class="review-shortcut-chip"><kbd>5</kbd> ${labelTier('blurred')}</span>
        <span class="review-shortcut-chip"><kbd>7</kbd> ${labelTier('satellite_only')}</span>
        <span class="review-shortcut-chip"><kbd>Esc</kbd> Exit</span>`;
    } else if (needsReview) {
      reviewShortcutChips.innerHTML = `
        <span class="review-shortcut-chip chip-distressed"><kbd>1</kbd> ${labelTier('distressed')}</span>
        <span class="review-shortcut-chip chip-well-maintained"><kbd>2</kbd> ${labelTier('well_maintained')}</span>
        <span class="review-shortcut-chip chip-vacant"><kbd>3</kbd> ${labelTier('vacant')}</span>
        <span class="review-shortcut-chip chip-defer"><kbd>4</kbd> Later</span>
        <span class="review-shortcut-chip"><kbd>5</kbd> ${labelTier('blurred')}</span>
        <span class="review-shortcut-chip"><kbd>7</kbd> ${labelTier('satellite_only')}</span>
        <span class="review-shortcut-chip"><kbd>6</kbd> Undo</span>
        <span class="review-shortcut-chip"><kbd>Esc</kbd> Exit</span>`;
    } else if (satelliteOnly) {
      reviewShortcutChips.innerHTML = `
        <span class="review-shortcut-chip chip-keep"><kbd>1</kbd> Keep ${labelTier('satellite_only')}</span>
        <span class="review-shortcut-chip"><kbd>2</kbd> Home</span>
        <span class="review-shortcut-chip"><kbd>5</kbd> ${labelTier('blurred')}</span>
        <span class="review-shortcut-chip"><kbd>6</kbd> Undo</span>
        <span class="review-shortcut-chip"><kbd>Esc</kbd> Exit</span>`;
    } else {
      const changeTier = getReviewChangeTier();
      const changeLabel = labelTier(changeTier);
      const changeChipClass = changeTier === 'well_maintained' ? 'chip-well-maintained' : 'chip-distressed';
      reviewShortcutChips.innerHTML = `
        <span class="review-shortcut-chip chip-keep"><kbd>1</kbd> Keep</span>
        <span class="review-shortcut-chip ${changeChipClass}"><kbd>2</kbd> ${escapeHtml(changeLabel)}</span>
        <span class="review-shortcut-chip chip-defer"><kbd>4</kbd> Later</span>
        <span class="review-shortcut-chip"><kbd>5</kbd> ${labelTier('blurred')}</span>
        <span class="review-shortcut-chip"><kbd>7</kbd> ${labelTier('satellite_only')}</span>
        <span class="review-shortcut-chip"><kbd>6</kbd> Undo</span>
        <span class="review-shortcut-chip"><kbd>Esc</kbd> Exit</span>`;
    }
  }
  updateReviewEntryButtons();
}

R.closeReviewTierPicker = function closeReviewTierPicker(tier = null) {
  reviewTierPickOverlay?.classList.remove('open');
  if (reviewTierPickOverlay) reviewTierPickOverlay.hidden = true;
  if (reviewTierPickResolver) {
    reviewTierPickResolver(tier);
    reviewTierPickResolver = null;
  }
}

R.showReviewTierPicker = function showReviewTierPicker() {
  return new Promise((resolve) => {
    reviewTierPickResolver = resolve;
    if (reviewTierPickOverlay) {
      reviewTierPickOverlay.hidden = false;
      reviewTierPickOverlay.classList.add('open');
    }
  });
}

reviewTierPickOverlay?.addEventListener('click', (e) => {
  if (e.target === reviewTierPickOverlay) closeReviewTierPicker(null);
});
reviewTierPickCancel?.addEventListener('click', () => closeReviewTierPicker(null));
reviewTierPickOverlay?.querySelectorAll('[data-review-tier]').forEach((btn) => {
  btn.addEventListener('click', () => closeReviewTierPicker(btn.dataset.reviewTier));
});

R.showReviewComplete = function showReviewComplete() {
  state.reviewIndex = state.reviewQueue.length;
  commitReviewedThroughIndex(state.reviewFilter);
  if (typeof stashReviewProgress === 'function') stashReviewProgress(state.reviewFilter);
  flushLearnedBrainSave();
  flushReviewProgress();
  if (typeof notifyResultMutation === 'function') notifyResultMutation({ clearServerTierCounts: true });
  else invalidateTierCountsCache({ clearServer: true });
  updateSummaryStats({ force: true });
  reviewBody?.setAttribute('hidden', '');
  reviewShortcutsBar?.setAttribute('hidden', '');
  reviewActionBar?.setAttribute('hidden', '');
  reviewCompletePanel?.classList.add('visible');
  const { kept, changed, deferred, blurred } = state.reviewStats;
  if (reviewCompleteText) {
    const extras = [];
    if (deferred) extras.push(`${deferred} sent to Needs Review`);
    if (blurred) extras.push(`${blurred} marked blocked image`);
    const extraNote = extras.length ? `, ${extras.join(', ')}` : '';
    reviewCompleteText.textContent =
      `${state.reviewQueue.length} leads reviewed — ${kept} kept, ${changed} changed${extraNote}. Training signals saved for your next scan batch.`;
  }
  if (reviewProgress) reviewProgress.textContent = 'Done';
}

R.reviewProgressLabel = function reviewProgressLabel(pos, total) {
  const snap = reviewQueueStatsSnap;
  if (snap && snap.total > total) {
    const left = Math.max(0, snap.pendingAtStart - (pos - 1));
    return `${pos} / ${total} queued — ${snap.total.toLocaleString()} total — ${left.toLocaleString()} left`;
  }
  return `${pos} / ${total}`;
}

R.renderReviewLeadDetails = function renderReviewLeadDetails(r, renderId, opts = {}) {
  if (!r || renderId !== reviewRenderGen || !state.reviewMode) return;
  const cat = resultCategory(r);
  if (reviewStatsEl) {
    const d = state.reviewStats.deferred || 0;
    const b = state.reviewStats.blurred || 0;
    const parts = [`${state.reviewStats.kept} kept`, `${state.reviewStats.changed} changed`];
    if (d) parts.push(`${d} deferred`);
    if (b) parts.push(`${b} blocked`);
    reviewStatsEl.textContent = parts.join(' — ');
  }
  if (typeof updateReviewCheckpointUi === 'function') updateReviewCheckpointUi();
  if (reviewMetaBadges) {
    reviewMetaBadges.innerHTML = `
      <span class="tier-badge ${tierBadgeClassForRecord(r)}">${tierBadgeLabelForRecord(r)}</span>
      <span class="category-badge ${categoryBadgeClass(cat)}">${categoryLabel(cat)}</span>
      ${r.manualScore ? '<span class="score-corrected-badge">You adjusted</span>' : ''}
      ${r.manualOverride ? '<span class="category-corrected-badge">Category changed</span>' : ''}
      ${r.needsReviewLater ? '<span class="category-corrected-badge needs-review-badge">Needs Review</span>' : ''}
      ${r.satelliteOnly ? '<span class="category-corrected-badge satellite-only-badge">Satellite Only</span>' : ''}
      ${manuallyReviewedBadgeHtml(r)}`;
  }
  if (reviewMetaAnalysis) {
    if (opts.deferHeavy && !r.tierRationale && typeof requestIdleCallback === 'function') {
      reviewMetaAnalysis.innerHTML = formatReviewAnalysisHtml(r, { skipRationaleBuild: true });
      const addr = recordKey(r);
      requestIdleCallback(() => {
        if (renderId !== reviewRenderGen || !state.reviewMode) return;
        const live = findResultByKey(addr);
        if (live && reviewMetaAnalysis) reviewMetaAnalysis.innerHTML = formatReviewAnalysisHtml(live);
      }, { timeout: 120 });
    } else {
      reviewMetaAnalysis.innerHTML = formatReviewAnalysisHtml(r);
    }
  }
  const chromeKey = `${state.reviewFilter}:${getReviewKind()}`;
  if (chromeKey !== reviewChromeKey) {
    updateReviewModeChrome();
    reviewChromeKey = chromeKey;
  } else if (reviewUndoBtn) {
    reviewUndoBtn.disabled = !state.reviewUndoStack.length;
  }
}

R.renderReviewLead = function renderReviewLead() {
  if (state.reviewIndex >= state.reviewQueue.length) {
    showReviewComplete();
    return;
  }
  reviewBody?.removeAttribute('hidden');
  reviewShortcutsBar?.removeAttribute('hidden');
  reviewActionBar?.removeAttribute('hidden');
  reviewCompletePanel?.classList.remove('visible');

  // Undo must land on the previous lead — never skip past it.
  const forceKey = state._reviewUndoForceKey;
  if (forceKey) {
    const forceIdx = state.reviewQueue.indexOf(forceKey);
    if (forceIdx >= 0) state.reviewIndex = forceIdx;
    state._reviewUndoForceKey = null;
  } else {
    let skipped = 0;
    const skipBatchMax = 40;
    while (state.reviewIndex < state.reviewQueue.length && skipped < skipBatchMax) {
      const key = state.reviewQueue[state.reviewIndex];
      const r = key ? findResultByKey(key) : null;
      const stillPending = r
        && matchesReviewFilter(r, state.reviewFilter)
        && !isExcludedFromAllReviewQueues(r, key, state.reviewFilter)
        && !isReviewedInFilter(state.reviewFilter, key);
      if (stillPending) break;
      // Advance past stale queue entries without stamping them reviewed.
      state.reviewIndex++;
      skipped++;
    }
    if (skipped) {
      if (state.reviewIndex >= state.reviewQueue.length) {
        showReviewComplete();
        return;
      }
      if (skipped >= skipBatchMax) {
        requestAnimationFrame(() => renderReviewLead());
        return;
      }
      if (skipped > 1) persistReviewProgress({ defer: true });
    }
  }

  const r = getReviewRecord();
  if (!r) {
    showReviewComplete();
    return;
  }

  const renderId = ++reviewRenderGen;
  const urls = getReviewImageUrls(r.address, r);
  const primary = urls.streetView || urls.satellite;
  const prefetched = !!(primary && typeof isReviewImageReady === 'function' && isReviewImageReady(primary));
  if (reviewMetaName) reviewMetaName.innerHTML = propertyTitleHtml(r);
  if (reviewMetaStreet) reviewMetaStreet.textContent = propertyStreetLine(r);
  setReviewImages({ ...urls, fromCache: !!(urls.fromCache || prefetched) });
  // Prefetch ahead off the critical path so Keep stays snappy.
  const prefetchFrom = state.reviewIndex + 1;
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => prefetchReviewQueueImages(prefetchFrom, REVIEW_PREFETCH_AHEAD), { timeout: 800 });
  } else {
    setTimeout(() => prefetchReviewQueueImages(prefetchFrom, REVIEW_PREFETCH_AHEAD), 0);
  }

  const pos = state.reviewIndex + 1;
  const total = state.reviewQueue.length;
  if (reviewProgress) reviewProgress.textContent = reviewProgressLabel(pos, total);
  if (reviewFilterTag) reviewFilterTag.textContent = reviewFilterLabel();

  requestAnimationFrame(() => renderReviewLeadDetails(r, renderId, { deferHeavy: true }));
}

R.flushDeferredCorrectionReviews = function flushDeferredCorrectionReviews() {
  const pending = R._deferredCorrectionReviews || [];
  R._deferredCorrectionReviews = [];
  if (!pending.length) return;
  R._flushingReviewCorrections = true;
  try {
    for (const item of pending) {
      if (!item?.event || item.event.superseded) continue;
      queueCorrectionReview(item.event, item.opts);
    }
  } finally {
    R._flushingReviewCorrections = false;
  }
}

R.deferReviewAdvanceSideEffects = function deferReviewAdvanceSideEffects(key, via, opts = {}) {
  const run = () => {
    if (!state.reviewMode) return;
    if (key && typeof commitReviewTrainingForKey === 'function') {
      commitReviewTrainingForKey(key);
      const stack = state.reviewUndoStack;
      if (stack.length && stack[stack.length - 1]?.key === key) {
        stack[stack.length - 1].trainingCommitted = true;
      }
    }
    state.reviewActionsSinceCheckpoint = (state.reviewActionsSinceCheckpoint || 0) + 1;
    maybeReviewCheckpoint();
    const saveReason = via && String(via).startsWith('review_') ? via : 'review-progress';
    persistReviewProgress({ reason: opts.reason || saveReason, defer: opts.deferSave });
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

R.warmReviewImagery = function warmReviewImagery() {
  if (!state.reviewQueue?.length) return;
  const run = () => {
    try {
      if (USE_PROXY && typeof fetchImageryIndexMap === 'function' && !imageryIndexMapCache) {
        fetchImageryIndexMap().catch(() => {});
      }
      prefetchReviewQueueImages(state.reviewIndex, REVIEW_PREFETCH_AHEAD);
    } catch (e) {
      console.warn('[Review imagery warm]', e);
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 0);
  }
}

R.reviewAdvance = function reviewAdvance(via = 'review_keep', opts = {}) {
  const key = state.reviewQueue[state.reviewIndex];
  const r = key ? findResultByKey(key) : null;
  if (via === 'review_keep' && r && key) {
    pushReviewUndo(key, snapshotRecordForUndo(r), { action: 'keep', queueIndex: state.reviewIndex });
  }
  if (via !== 'review_defer' && key) {
    const idx = typeof ensureResultKeyIndex === 'function'
      ? ensureResultKeyIndex().get(key)
      : state.results.findIndex(x => recordKey(x) === key);
    if (idx != null && idx >= 0) {
      state.results[idx] = finalizeReviewClassification(state.results[idx]);
      if (typeof notifyResultMutation === 'function') {
        notifyResultMutation({ keepReviewSnapshot: true, clearServerTierCounts: false });
      }
    }
  }
  // Stamp reviewed + paint next lead before any Vault/KPI/training work.
  markReviewedKey(state.reviewFilter, key, via, { deferHeavy: true });
  state.reviewIndex++;
  renderReviewLead();
  deferReviewAdvanceSideEffects(key, via, opts);
}

R.reviewRecordAffirmation = function reviewRecordAffirmation(r) {
  if (!r || resultCategory(r) !== 'property') return false;
  const tier = resultLeadTier(r);
  if (tier !== 'distressed' && tier !== 'well_maintained') return false;
  captureAffirmationEvent(r, tier, { source: 'review_mode', autoApprove: true, deferTraining: true });
  return true;
}

R.reviewDeferLater = function reviewDeferLater() {
  if (state.reviewIndex >= state.reviewQueue.length) return;
  const r = getReviewRecord();
  if (!r) {
    reviewAdvance('review_defer');
    return;
  }
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) {
    reviewAdvance('review_defer');
    return;
  }
  if (r.needsReviewLater) {
    log(`⏳ Already in Needs Review — ${propertyStreetLine(r)}`, 'warn');
    reviewAdvance('review_defer');
    return;
  }
  pushReviewUndo(recordKey(r), snapshotRecordForUndo(state.results[idx]), {
    action: 'defer',
    queueIndex: state.reviewIndex
  });
  const baseReason = String(state.results[idx].reason || '')
    .replace(/ Flagged for Needs Review — decide later\./g, '')
    .trim();
  const updated = markRecordManuallyReviewed({
    ...state.results[idx],
    needsReviewLater: true,
    reason: baseReason
      ? `${baseReason} Flagged for Needs Review — decide later.`
      : 'Flagged for Needs Review — decide later.'
  }, 'review_defer');
  updated.tierRationale = buildTierRationale(updated);
  state.results[idx] = updated;
  state.reviewStats.deferred = (state.reviewStats.deferred || 0) + 1;

  log(`⏳ Deferred — ${propertyStreetLine(r)} sent to Needs Review`, 'warn');
  reviewAdvance('review_defer');
}

R.reviewApplySatelliteOnly = function reviewApplySatelliteOnly() {
  if (state.reviewIndex >= state.reviewQueue.length) return;
  const r = getReviewRecord();
  if (!r) {
    reviewAdvance('review_satellite_only');
    return;
  }
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) {
    reviewAdvance('review_satellite_only');
    return;
  }
  if (r.satelliteOnly && state.reviewFilter === 'satellite_only') {
    state.reviewStats.kept++;
    log(`✓ Kept Satellite Only — ${propertyStreetLine(r)}`, 'success');
    reviewAdvance('review_keep');
    return;
  }
  if (r.satelliteOnly) {
    log(`🛰️ Already Satellite Only — ${propertyStreetLine(r)}`, 'warn');
    reviewAdvance('review_satellite_only');
    return;
  }
  pushReviewUndo(recordKey(r), snapshotRecordForUndo(state.results[idx]), {
    action: 'satellite_only',
    queueIndex: state.reviewIndex
  });
  const baseReason = String(state.results[idx].reason || '')
    .replace(/ Flagged for Needs Review — decide later\./g, '')
    .replace(/ Flagged Satellite Only — re-scan later\./g, '')
    .trim();
  const updated = markRecordManuallyReviewed({
    ...state.results[idx],
    satelliteOnly: true,
    needsReview: false,
    needsReviewLater: false,
    reviewResolved: false,
    reason: baseReason
      ? `${baseReason} Flagged Satellite Only — re-scan later.`
      : 'Flagged Satellite Only — re-scan later.'
  }, 'review_satellite_only');
  updated.tierRationale = buildTierRationale(updated);
  state.results[idx] = updated;
  state.reviewStats.changed = (state.reviewStats.changed || 0) + 1;
  state.reviewStats.satelliteOnly = (state.reviewStats.satelliteOnly || 0) + 1;
  if (typeof notifyResultMutation === 'function') {
    notifyResultMutation({ clearServerTierCounts: true });
  } else {
    invalidateTierCountsCache({ clearServer: true });
  }
  log(`🛰️ Satellite Only — ${propertyStreetLine(r)} parked for later re-scan`, 'warn');
  reviewAdvance('review_satellite_only');
}

R.reviewLandKeep = function reviewLandKeep() {
  if (state.reviewIndex >= state.reviewQueue.length) return;
  const r = getReviewRecord();
  if (!r) {
    reviewAdvance('review_keep');
    return;
  }
  const cat = resultCategory(r);
  if (cat !== 'vacant_lot') {
    const updated = reviewApplyCategoryChange(r, 'vacant_lot');
    if (updated) {
      const landIdx = state.results.findIndex(x => recordKey(x) === recordKey(r));
      if (landIdx >= 0) {
        state.results[landIdx] = finalizeReviewClassification(state.results[landIdx]);
        if (typeof notifyResultMutation === 'function') {
          notifyResultMutation({ clearServerTierCounts: true });
        }
      }
      state.reviewStats.changed++;
      scheduleLearnedBrainSave();
      log(`→ Vacant Lot/Land — ${propertyStreetLine(r)}`, 'success');
      reviewAdvance('review_change');
      return;
    }
  }
  state.reviewStats.kept++;
  scheduleLearnedBrainSave();
  log(`✓ Kept as land — ${propertyStreetLine(r)}`, 'success');
  reviewAdvance('review_keep');
}

R.finalizeReviewClassification = function finalizeReviewClassification(record) {
  if (!record) return record;
  return {
    ...record,
    needsReview: false,
    needsReviewLater: false,
    satelliteOnly: false,
    reviewResolved: true,
    landHomeConflict: false,
    satelliteConflict: false
  };
}

R.reviewApplyManualTier = function reviewApplyManualTier(tier) {
  if (state.reviewIndex >= state.reviewQueue.length) return;
  const r = getReviewRecord();
  if (!r) {
    markReviewedKey(state.reviewFilter, state.reviewQueue[state.reviewIndex], 'review_missing');
    state.reviewIndex++;
    persistReviewProgress({ reason: 'review_missing' });
    renderReviewLead();
    return;
  }
  const cat = resultCategory(r);
  const beforeTier = resultLeadTier(r);
  if (cat === 'property' && beforeTier === tier) {
    reviewRecordAffirmation(r);
    state.reviewStats.kept++;
    scheduleLearnedBrainSave();
    log(`? ${leadTierLabel(tier)} — ${propertyStreetLine(r)}`, 'success');
    reviewAdvance('review_keep');
    return;
  }
  const updated = reviewApplyPropertyWithTier(r, tier);
  if (!updated) {
    log(`Could not mark ${propertyStreetLine(r)} as ${leadTierLabel(tier)}`, 'warn');
    return;
  }
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx >= 0) {
    state.results[idx] = finalizeReviewClassification(state.results[idx]);
    if (typeof notifyResultMutation === 'function') notifyResultMutation({ clearServerTierCounts: true });
    else invalidateTierCountsCache({ clearServer: true });
  }
  state.reviewStats.changed++;
  scheduleLearnedBrainSave();
  log(`? ${leadTierLabel(tier)} — ${propertyStreetLine(r)}`, 'success');
  reviewAdvance('review_change');
}

R.reviewKeep = function reviewKeep() {
  if (state.reviewIndex >= state.reviewQueue.length) return;
  const kind = getReviewKind();
  if (kind === 'land') {
    reviewLandKeep();
    return;
  }
  if (kind === 'needs_review') {
    reviewApplyManualTier('distressed');
    return;
  }
  if (kind === 'satellite_only') {
    const r = getReviewRecord();
    if (r?.satelliteOnly) {
      state.reviewStats.kept++;
      log(`✓ Kept Satellite Only — ${propertyStreetLine(r)}`, 'success');
      reviewAdvance('review_keep');
      return;
    }
    reviewApplySatelliteOnly();
    return;
  }
  const r = getReviewRecord();
  const trained = reviewRecordAffirmation(r);
  state.reviewStats.kept++;
  if (trained) {
    scheduleLearnedBrainSave();
    log(`✓ Kept ${leadTierLabel(resultLeadTier(r))} — brain training signal queued`, 'success');
  }
  reviewAdvance('review_keep');
}

R.reviewApplyHome = async function reviewApplyHome() {
  if (state.reviewIndex >= state.reviewQueue.length) return;
  const r = getReviewRecord();
  if (!r) {
    markReviewedKey(state.reviewFilter, state.reviewQueue[state.reviewIndex], 'review_missing');
    state.reviewIndex++;
    persistReviewProgress({ reason: 'review_missing' });
    renderReviewLead();
    return;
  }
  const tier = await showReviewTierPicker();
  if (!tier) return;
  const updated = reviewApplyPropertyWithTier(r, tier);
  if (updated) {
    state.reviewStats.changed++;
    scheduleLearnedBrainSave();
  
    log(`→ Home / ${leadTierLabel(tier)} — ${propertyStreetLine(r)}`, 'success');
    reviewAdvance('review_change');
    return;
  }
  log(`Could not mark ${propertyStreetLine(r)} as home`, 'warn');
}

R.reviewApplyBlurred = function reviewApplyBlurred() {
  if (state.reviewIndex >= state.reviewQueue.length) return;
  const r = getReviewRecord();
  if (!r) {
    reviewAdvance('review_blurred');
    return;
  }
  const cat = resultCategory(r);
  if (cat === 'blurred' || isBlurredImagery(r)) {
    state.reviewStats.kept++;
    log(`? Already in Blocked Image list — ${propertyStreetLine(r)}`, 'success');
    reviewAdvance('review_blurred');
    return;
  }
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) {
    reviewAdvance('review_blurred');
    return;
  }
  const prev = state.results[idx];
  pushReviewUndo(recordKey(prev), snapshotRecordForUndo(prev), {
    action: 'blurred',
    queueIndex: state.reviewIndex
  });
  recordCategoryCorrection({
    fromCategory: resultCategory(prev),
    toCategory: 'blurred',
    aiScore: prev.aiScore ?? prev.score,
    address: prev.address
  });
  let updated = finalizeBlurredLead({ ...prev });
  updated = markRecordManuallyReviewed(updated, 'review_blurred');
  stampManualEdit(updated);
  state.results[idx] = updated;
  invalidateTierCountsCache();
  invalidateFilteredResultsCache();
  state.reviewStats.changed++;
  state.reviewStats.blurred = (state.reviewStats.blurred || 0) + 1;

  scheduleLearnedBrainSave();
  log(`? Blocked Image — ${propertyStreetLine(r)} moved to Blocked Image list (removed from Needs Review)`, 'warn');
  reviewAdvance('review_blurred');
}

R.reviewApplyCategoryChange = function reviewApplyCategoryChange(r, category, opts = {}) {
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) return null;
  const prev = state.results[idx];
  const current = resultCategory(prev);
  if (current === category) return prev;
  pushReviewUndo(recordKey(prev), snapshotRecordForUndo(prev), {
    action: opts.undoAction || 'change',
    queueIndex: state.reviewIndex
  });
  recordCategoryCorrection({
    fromCategory: current,
    toCategory: category,
    aiScore: prev.aiScore ?? prev.score,
    address: prev.address
  });
  const updated = applyCategoryFields({ ...prev }, category);
  state.results[idx] = updated;
  queueCategoryCorrectionReview(prev, current, category, { autoApprove: true });
  return updated;
}

R.reviewApplyTierOnRecord = function reviewApplyTierOnRecord(r, tier) {
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) return null;
  const prev = state.results[idx];
  if (resultCategory(prev) !== 'property') return null;
  const beforeTier = resultLeadTier(prev);
  if (beforeTier === tier) return prev;
  pushReviewUndo(recordKey(prev), snapshotRecordForUndo(prev), {
    action: 'change',
    queueIndex: state.reviewIndex
  });
  const updated = mutateTierOnRecord(prev, tier, { source: 'review_mode', autoApprove: true, deferTraining: true });
  if (!updated) return null;
  const baseReason = (updated.reason || '').replace(/ You bulk-set distress level to [^.]+\./g, '');
  updated.reason = `${baseReason} You set distress level to ${leadTierLabel(tier)}.`;
  updated.tierRationale = buildTierRationale(updated);
  state.results[idx] = updated;
  return state.results[idx];
}

R.reviewApplyPropertyWithTier = function reviewApplyPropertyWithTier(r, tier) {
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) return null;
  const prev = state.results[idx];
  const cat = resultCategory(prev);
  const oldTier = resultLeadTier(prev);
  if (cat === 'property' && oldTier === tier) return prev;

  pushReviewUndo(recordKey(prev), snapshotRecordForUndo(prev), {
    action: 'change',
    queueIndex: state.reviewIndex
  });
  let working = { ...prev };
  if (cat !== 'property') {
    recordCategoryCorrection({
      fromCategory: cat,
      toCategory: 'property',
      aiScore: prev.aiScore ?? prev.score,
      address: prev.address
    });
    queueCategoryCorrectionReview(prev, cat, 'property', { autoApprove: true });
    working = applyCategoryFields(working, 'property');
  }
  if (resultLeadTier(working) !== tier) {
    const tiered = mutateTierOnRecord(working, tier, { source: 'review_mode', autoApprove: true, deferTraining: true });
    if (tiered) {
      const baseReason = (tiered.reason || '')
        .replace(/ Flagged Satellite Only — re-scan later\./g, '')
        .replace(/ You bulk-set distress level to [^.]+\./g, '');
      tiered.reason = `${baseReason} You set distress level to ${leadTierLabel(tier)}.`.trim();
      tiered.tierRationale = buildTierRationale(tiered);
      working = tiered;
    }
  }
  working.satelliteOnly = false;
  working.needsReviewLater = false;
  state.results[idx] = working;
  return working;
}

R.reviewApplyChange = async function reviewApplyChange() {
  if (state.reviewIndex >= state.reviewQueue.length) return;
  const kind = getReviewKind();
  if (kind === 'needs_review') {
    reviewApplyManualTier('well_maintained');
    return;
  }
  if (kind === 'land' || kind === 'satellite_only') {
    await reviewApplyHome();
    return;
  }
  const key = state.reviewQueue[state.reviewIndex];
  const r = getReviewRecord();
  if (!r) {
    markReviewedKey(state.reviewFilter, key, 'review_missing');
    state.reviewIndex++;
    persistReviewProgress({ reason: 'review_missing' });
    renderReviewLead();
    return;
  }

  const cat = resultCategory(r);
  const beforeTier = resultLeadTier(r);
  const targetTier = getReviewChangeTier();

  if (cat === 'property' && beforeTier === targetTier) {
    reviewRecordAffirmation(r);
    state.reviewStats.kept++;
    scheduleLearnedBrainSave();
    log(`✓ Already ${leadTierLabel(beforeTier)} — brain training signal queued`, 'success');
    reviewAdvance('review_keep');
    return;
  }

  let updated = null;
  if (cat !== 'property') {
    updated = reviewApplyPropertyWithTier(r, targetTier);
  } else {
    updated = reviewApplyTierOnRecord(r, targetTier);
  }

  const afterTier = updated ? resultLeadTier(updated) : beforeTier;
  const didChange = !!updated && afterTier === targetTier && (afterTier !== beforeTier || cat !== 'property');

  if (didChange) {
    state.reviewStats.changed++;
    scheduleLearnedBrainSave();
  
    log(`→ ${leadTierLabel(afterTier)} — brain training signal queued for future scans`, 'success');
    reviewAdvance('review_change');
    return;
  }

  log(`Could not move ${propertyStreetLine(r)} to ${leadTierLabel(targetTier)} — kept current tier`, 'warn');
  state.reviewStats.kept++;
  reviewAdvance('review_keep');
}

R.reviewUndo = function reviewUndo() {
  const item = state.reviewUndoStack.pop();
  if (!item?.key) {
    if (reviewUndoBtn) reviewUndoBtn.disabled = !state.reviewUndoStack.length;
    return;
  }
  let idx = state.results.findIndex(r => recordKey(r) === item.key);
  // Fallback: address match if lean merge changed email/phone and broke the key.
  if (idx < 0 && item.snapshot?.address) {
    idx = state.results.findIndex((r) => r && r.address === item.snapshot.address);
  }
  const address = idx >= 0 ? state.results[idx]?.address : (item.snapshot?.address || null);
  if (idx >= 0) {
    state.results[idx] = applyReviewUndoSnapshot(state.results[idx], item.snapshot);
    // Ensure the restored row still resolves under the queue key Undo was keyed on.
    const restoredKey = recordKey(state.results[idx]);
    if (restoredKey !== item.key && item.snapshot) {
      if (item.snapshot.email != null) state.results[idx].email = item.snapshot.email;
      if (item.snapshot.phone != null) state.results[idx].phone = item.snapshot.phone;
      if (item.snapshot.address != null) state.results[idx].address = item.snapshot.address;
    }
  } else if (item.snapshot) {
    state.results.push(applyReviewUndoSnapshot({
      email: item.snapshot.email || '',
      phone: item.snapshot.phone || '',
      address: item.snapshot.address || ''
    }, item.snapshot));
  }
  invalidateResultKeyIndex?.();
  if (typeof cancelReviewTrainingForKey === 'function') cancelReviewTrainingForKey(item.key);
  if (item.trainingCommitted && typeof rollbackReviewTrainingForKey === 'function') {
    rollbackReviewTrainingForKey(item.key, address);
  }
  unmarkReviewedKey(state.reviewFilter, item.key);
  const forceIdx = state.reviewQueue.indexOf(item.key);
  const targetIndex = forceIdx >= 0
    ? forceIdx
    : (Number.isFinite(item.queueIndex) ? item.queueIndex : Math.max(0, state.reviewIndex - 1));
  state.reviewIndex = Math.max(0, Math.min(targetIndex, Math.max(0, state.reviewQueue.length - 1)));
  state._reviewUndoForceKey = item.key;

  const action = item.action || (item.snapshot?.needsReviewLater ? 'defer' : 'change');
  if (action === 'defer') {
    state.reviewStats.deferred = Math.max(0, (state.reviewStats.deferred || 0) - 1);
  } else if (action === 'blurred') {
    state.reviewStats.blurred = Math.max(0, (state.reviewStats.blurred || 0) - 1);
    state.reviewStats.changed = Math.max(0, (state.reviewStats.changed || 0) - 1);
  } else if (action === 'satellite_only') {
    state.reviewStats.satelliteOnly = Math.max(0, (state.reviewStats.satelliteOnly || 0) - 1);
    state.reviewStats.changed = Math.max(0, (state.reviewStats.changed || 0) - 1);
  } else if (action === 'change') {
    state.reviewStats.changed = Math.max(0, (state.reviewStats.changed || 0) - 1);
  } else if (action === 'keep') {
    state.reviewStats.kept = Math.max(0, (state.reviewStats.kept || 0) - 1);
  }

  if (typeof notifyResultMutation === 'function') {
    notifyResultMutation({ keepReviewSnapshot: true, clearServerTierCounts: true });
  } else {
    invalidateTierCountsCache();
  }
  if (reviewUndoBtn) reviewUndoBtn.disabled = !state.reviewUndoStack.length;

  persistReviewProgress({ reason: 'review-undo' });
  renderReviewLead();
}

R.openReviewMode = async function openReviewMode(filter, opts = {}) {
  if (!REVIEW_MODE_FILTERS.includes(filter)) {
    alert('Choose a review mode from Review Leads in the sidebar.');
    return;
  }

  // Fast path: server queue — do NOT wait for full 16k hydrate (that made Review feel stuck).
  let serverQueue = null;
  if (USE_PROXY && typeof fetchSessionReviewQueue === 'function' && !opts.localOnly) {
    try {
      setSessionRestoreBanner?.(`Loading ${reviewFilterLabel(filter)} review…`);
      serverQueue = await fetchSessionReviewQueue(filter, { offset: 0, limit: 300 });
      setSessionRestoreBanner?.('');
    } catch (e) {
      console.warn('[review] session-review-queue failed, falling back to local hydrate', e);
      setSessionRestoreBanner?.('');
      serverQueue = null;
    }
  }

  if (!serverQueue?.ok) {
    // Fallback: full hydrate (slower) then build from in-memory snapshot
    if (typeof ensureSessionResultsLoaded === 'function') {
      try {
        const loadedOk = await ensureSessionResultsLoaded();
        const target = Math.max(
          Number(sessionLoadState?.total) || 0,
          Number(sessionLoadState?.serverCanonical) || 0,
          Number(state._tierCountsFromServer?.all) || 0,
          Number(state.processed) || 0
        );
        if (!loadedOk || (target > 0 && state.results.length < Math.floor(target * 0.95))) {
          alert(
            `Still loading scanned leads (${state.results.length.toLocaleString()} of ${target.toLocaleString()}). ` +
            `Wait for the load to finish, then open Review Leads again — otherwise the queue looks empty.`
          );
          return;
        }
      } catch (e) {
        console.warn('[review] ensureSessionResultsLoaded failed', e);
      }
    }
  } else if (Array.isArray(serverQueue.results) && serverQueue.results.length) {
    mergeReviewQueueResults(serverQueue.results);
  }

  if (!state.results.length && !(serverQueue?.pendingKeys || []).length) {
    alert('No analyzed leads yet — run a scan or restore your saved session first.');
    return;
  }
  closePropertyModal({ save: false });
  closeScoreEditModal();
  setBulkSelectMode(false);

  if (state.appView !== 'dashboard') setAppView('dashboard');

  // Poison stashes (2 Distressed / near-done WM) hid thousands of unreviewed leads.
  // Always drop stashes that don't cover current pending; prefer a full rebuild.
  if (typeof clearAllReviewProgressStashes === 'function' && opts.restart) {
    clearAllReviewProgressStashes();
  } else if (typeof discardStaleReviewProgress === 'function') {
    discardStaleReviewProgress(filter);
  }

  // Same review already open with a fresh-enough queue — just show overlay.
  if (!opts.restart && state.reviewMode && state.reviewFilter === filter) {
    const staleOpen = typeof isReviewQueueStaleVsPending === 'function'
      && isReviewQueueStaleVsPending(filter, state.reviewQueue);
    if (!staleOpen && state.reviewQueue.length && state.reviewIndex < state.reviewQueue.length) {
      showReviewOverlay();
      renderReviewLead();
      warmReviewImagery();
      return;
    }
    state.reviewMode = false;
    state.reviewQueue = [];
    state.reviewIndex = 0;
  }

  // Resume in-memory mid-session only when the queue still matches pending.
  if (!opts.restart && !state.reviewMode && hasActiveReviewProgress(filter)) {
    const staleActive = typeof isReviewQueueStaleVsPending === 'function'
      && isReviewQueueStaleVsPending(filter, state.reviewQueue);
    if (!staleActive) {
      state.reviewMode = true;
      showReviewOverlay();
      renderReviewLead();
      warmReviewImagery();
      log(`Resumed ${reviewFilterLabel(filter)} review — lead ${state.reviewIndex + 1} of ${state.reviewQueue.length}`, 'success');
      return;
    }
    state.reviewQueue = [];
    state.reviewIndex = 0;
  }

  // Do NOT resume disk/server stashes when they are smaller than current pending.
  if (!opts.restart && !opts.forceRebuild && !serverQueue?.ok && restoreReviewProgress(filter)) {
    const restoredStale = typeof isReviewQueueStaleVsPending === 'function'
      && isReviewQueueStaleVsPending(filter, state.reviewQueue);
    if (!restoredStale) {
      state.reviewMode = true;
      showReviewOverlay();
      renderReviewLead();
      warmReviewImagery();
      log(`Resumed ${reviewFilterLabel(filter)} review — lead ${state.reviewIndex + 1} of ${state.reviewQueue.length}`, 'success');
      return;
    }
    if (state.reviewProgressByFilter) delete state.reviewProgressByFilter[filter];
    state.reviewQueue = [];
    state.reviewIndex = 0;
  }

  if (!opts.restart && state.reviewMode && state.reviewFilter !== filter && hasActiveReviewProgress()) {
    commitReviewedThroughIndex(state.reviewFilter);
    stashReviewProgress(state.reviewFilter);
  }

  invalidateReviewSnapshotCache?.();
  let queue;
  let totalInFilter;
  let alreadyReviewed;
  let pending;
  if (serverQueue?.ok) {
    queue = Array.isArray(serverQueue.pendingKeys) ? serverQueue.pendingKeys.slice() : [];
    totalInFilter = Number(serverQueue.totalInFilter) || 0;
    alreadyReviewed = Number(serverQueue.reviewedInFilter) || 0;
    pending = Number(serverQueue.pending) || queue.length;
  } else {
    const snap = scanReviewFilterSnapshot(filter);
    queue = snap.pendingKeys;
    totalInFilter = snap.total;
    alreadyReviewed = snap.reviewedInFilter;
    pending = snap.pending;
  }
  if (!queue.length) {
    if (alreadyReviewed > 0) {
      alert(`All ${totalInFilter.toLocaleString()} ${reviewFilterLabel(filter)} leads have been checked in this review queue (${alreadyReviewed.toLocaleString()} saved). New leads will appear after your next scan.`);
    } else {
      alert(`No ${reviewFilterLabel(filter)} leads to review yet.`);
    }
    return;
  }

  state.reviewFilter = filter;
  state.reviewQueue = queue;
  state.reviewIndex = 0;
  state.reviewUndoStack = [];
  state.reviewStats = { kept: 0, changed: 0, deferred: 0, blurred: 0, satelliteOnly: 0 };
  reviewChromeKey = '';
  reviewQueueStatsSnap = {
    total: totalInFilter,
    pendingAtStart: pending
  };
  if (typeof resetReviewTrainingBuffer === 'function') resetReviewTrainingBuffer();
  state.reviewMode = true;
  // Drop the old stash so Exit/reload cannot resurrect a 2-item queue.
  if (state.reviewProgressByFilter) delete state.reviewProgressByFilter[filter];

  showReviewOverlay();
  renderReviewLead();
  warmReviewImagery();
  persistReviewProgress({ defer: true });
  const skipped = alreadyReviewed
    ? ` (${alreadyReviewed.toLocaleString()} already checked in this queue — skipped)`
    : '';
  log(`${reviewFilterLabel(filter)} review — ${queue.length.toLocaleString()} to review of ${totalInFilter.toLocaleString()} total${skipped}`, 'success');

  // Pull remaining pending rows in the background so later Keep/Change stays instant.
  if (serverQueue?.hasMoreResults) {
    void prefetchRemainingReviewQueueResults(filter, (serverQueue.results || []).length, 300);
  }
  // Keep full session hydrate going in the background without blocking Review.
  if (typeof ensureSessionResultsLoaded === 'function' && sessionLoadState && !sessionLoadState.complete) {
    void ensureSessionResultsLoaded().catch(() => {});
  }
}

R.closeReviewMode = async function closeReviewMode() {
  closeReviewTierPicker(null);
  const filter = state.reviewFilter;
  const reviewedNow = state.reviewStats.kept + state.reviewStats.changed + (state.reviewStats.deferred || 0) + (state.reviewStats.blurred || 0);
  commitReviewedThroughIndex(filter);
  // Drop resume stash so re-open rebuilds from pending — reviewed stamps keep those leads out.
  if (state.reviewProgressByFilter && filter && filter !== 'all') {
    delete state.reviewProgressByFilter[filter];
  }
  flushLearnedBrainSave();
  const saveResult = await flushReviewProgress();
  state.reviewMode = false;
  flushDeferredCorrectionReviews();
  state.reviewQueue = [];
  state.reviewIndex = 0;
  state.reviewUndoStack = [];
  state._reviewUndoForceKey = null;
  state.reviewStats = { kept: 0, changed: 0, deferred: 0, blurred: 0, satelliteOnly: 0 };
  reviewChromeKey = '';
  reviewQueueStatsSnap = null;
  if (typeof resetReviewTrainingBuffer === 'function') resetReviewTrainingBuffer();
  hideReviewOverlay();
  updateReviewEntryButtons();
  delete state._tierCountsFromServer;
  if (typeof notifyResultMutation === 'function') notifyResultMutation({ clearServerTierCounts: true });
  else invalidateTierCountsCache({ clearServer: true });
  updateSummaryStats({ force: true });
  updateFilterLabels();
  renderResults({ force: true });
  if (reviewedNow > 0 && filter && filter !== 'all') {
    const remaining = buildReviewQueue(filter).length;
    const savedOk = saveResult?.ok !== false;
    log(
      savedOk
        ? `${reviewedNow.toLocaleString()} ${reviewFilterLabel(filter)} lead${reviewedNow === 1 ? '' : 's'} saved as reviewed — ${remaining.toLocaleString()} left for next session`
        : `Reviewed ${reviewedNow.toLocaleString()} locally — server save pending (will retry). ${remaining.toLocaleString()} left in this queue.`,
      savedOk ? 'success' : 'warn'
    );
  }
}

R.applyCategoryFields = function applyCategoryFields(updated, category) {
  updated.manualOverride = category;
  updated.category = category;
  updated.structureOnLot = category === 'property';
  updated.needsReview = false;
  updated.needsReviewLater = false;
  updated.satelliteOnly = false;
  updated.reviewResolved = true;
  stampManualEdit(updated);
  updated = markRecordManuallyReviewed(updated, 'category_change');
  updated.satelliteConflict = false;
  updated.landHomeConflict = false;
  const baseReason = (updated.reason || '')
    .replace(/ Flagged Satellite Only — re-scan later\./g, '')
    .replace(/ You (changed category|confirmed).*$/i, '')
    .trim();

  if (category === 'vacant_lot') {
    updated.score = 0;
    updated.indicators = [];
    updated.leadTier = 'vacant';
    updated.reason = `${baseReason} You changed category to vacant lot / land.`;
  } else if (category === 'property') {
    if (!updated.score || updated.score === 0) {
      updated.score = 2;
      if (updated.aiScore == null) updated.aiScore = 0;
    }
    updated.leadTier = computeLeadTier(updated.score, 'property');
    updated.reason = `${baseReason} You changed category to home / property — distress score ${updated.score}/10.`;
  } else if (category === 'unavailable') {
    updated.score = 0;
    updated.indicators = [];
    updated.leadTier = 'unavailable';
    updated.reason = `${baseReason} You changed category to unavailable.`;
  } else if (category === 'blurred') {
    updated = finalizeBlurredLead(updated);
    updated = markRecordManuallyReviewed(updated, 'category_change');
    stampManualEdit(updated);
    return attachTierRationale(updated);
  }
  return attachTierRationale(updated);
}

R.changeCategory = function changeCategory(r, category) {
  const current = resultCategory(r);
  if (current === category) return;

  const label = categoryLabel(category);
  const fromLabel = categoryLabel(current);
  const name = contactName(r);
  const wasInReview = computeNeedsReview(r);
  const ok = confirm(
    `Change category?\n\n${propertyLocationTitle(r)} — ${name}\n${r.address}\n\n` +
    `${fromLabel} → ${label}\n\n` +
    (wasInReview ? `This will remove it from Needs Review and save your change.` : `This will update filters, scores, and your export.`)
  );
  if (!ok) return;

  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) return;
  const prev = state.results[idx];
  recordCategoryCorrection({
    fromCategory: resultCategory(prev),
    toCategory: category,
    aiScore: prev.aiScore ?? prev.score,
    address: prev.address
  });
  const updated = applyCategoryFields({ ...prev }, category);
  state.results[idx] = updated;
  saveSession();
  scheduleSaveSession();
  renderResults();
  log(`Category changed: ${name} — ${fromLabel} → ${label}`, 'success');

  if (wasInReview) {
    const remaining = getReviewQueue();
    if (remaining.length) {
      const flash = document.createElement('div');
      flash.className = 'review-confirm-flash';
      flash.textContent = `✓ Changed to ${label}. Loading next review (${remaining.length} left)…`;
      inspectorBody.prepend(flash);
      setTimeout(() => {
        const next = state.filter === 'review'
          ? getFilteredResults().find(x => computeNeedsReview(x)) || remaining[0]
          : remaining[0];
        showInspector(next, { scrollList: true });
      }, 650);
      return;
    }
    if (state.filter === 'review') setFilter('all');
  }
  showInspector(updated, { scrollList: true });
}

R.markResultSatelliteOnly = function markResultSatelliteOnly(r) {
  if (!r || r.satelliteOnly) return;
  const name = contactName(r);
  const ok = confirm(
    `Mark Satellite Only?\n\n${propertyLocationTitle(r)} — ${name}\n${r.address}\n\n` +
    `Parks this lead for a later satellite re-scan. It leaves Distressed / Well Maintained / Needs Review until you clear it.`
  );
  if (!ok) return;
  const idx = state.results.findIndex(x => recordKey(x) === recordKey(r));
  if (idx < 0) return;
  const prev = state.results[idx];
  const baseReason = String(prev.reason || '')
    .replace(/ Flagged for Needs Review — decide later\./g, '')
    .replace(/ Flagged Satellite Only — re-scan later\./g, '')
    .trim();
  const updated = markRecordManuallyReviewed({
    ...prev,
    satelliteOnly: true,
    needsReview: false,
    needsReviewLater: false,
    reviewResolved: false,
    reason: baseReason
      ? `${baseReason} Flagged Satellite Only — re-scan later.`
      : 'Flagged Satellite Only — re-scan later.'
  }, 'profile_satellite_only');
  updated.tierRationale = buildTierRationale(updated);
  state.results[idx] = updated;
  if (typeof notifyResultMutation === 'function') notifyResultMutation({ clearServerTierCounts: true });
  else invalidateTierCountsCache({ clearServer: true });
  saveSession();
  scheduleSaveSession();
  renderResults();
  updateFilterLabels?.();
  log(`🛰️ Satellite Only — ${name}`, 'warn');
  showInspector(updated, { scrollList: true });
}

R.isBulkSelected = function isBulkSelected(key) {
  return bulkSelectedKeys.has(key);
}

R.toggleBulkKey = function toggleBulkKey(key) {
  if (bulkSelectedKeys.has(key)) bulkSelectedKeys.delete(key);
  else bulkSelectedKeys.add(key);
  updateBulkEditUi();
  syncBulkSelectionDom();
}

R.clearBulkSelection = function clearBulkSelection() {
  bulkSelectedKeys.clear();
  updateBulkEditUi();
  syncBulkSelectionDom();
}

R.selectAllVisibleBulk = function selectAllVisibleBulk() {
  for (const r of getFilteredResults()) bulkSelectedKeys.add(recordKey(r));
  updateBulkEditUi();
  syncBulkSelectionDom();
}

R.setBulkSelectMode = function setBulkSelectMode(on) {
  state.bulkSelectMode = !!on;
  document.body.classList.toggle('bulk-select-mode', state.bulkSelectMode);
  bulkSelectToggleBtn?.classList.toggle('active', state.bulkSelectMode);
  if (!state.bulkSelectMode) clearBulkSelection();
  else updateBulkEditUi();
  renderResults({ force: !state.running });
}

R.updateBulkEditUi = function updateBulkEditUi() {
  const n = bulkSelectedKeys.size;
  const mode = state.bulkSelectMode;
  bulkEditBar?.classList.toggle('visible', mode);
  if (bulkEditCount) {
    bulkEditCount.textContent = n
      ? `${n.toLocaleString()} selected`
      : (mode ? 'Click leads to select' : '0 selected');
  }
  const hasSel = n > 0;
  $('bulkTierDistressedBtn') && ($('bulkTierDistressedBtn').disabled = !hasSel);
  $('bulkTierWellMaintainedBtn') && ($('bulkTierWellMaintainedBtn').disabled = !hasSel);
  $('bulkCatVacantBtn') && ($('bulkCatVacantBtn').disabled = !hasSel);
  $('bulkCatPropertyBtn') && ($('bulkCatPropertyBtn').disabled = !hasSel);
  if (bulkEditHint) {
    bulkEditHint.textContent = state.running
      ? 'Scan running — edits save immediately'
      : 'Select leads, then mark tier or category';
  }
}

R.syncBulkSelectionDom = function syncBulkSelectionDom() {
  document.querySelectorAll('.prop-card[data-key], tr[data-key]').forEach(el => {
    const key = el.dataset.key;
    const on = isBulkSelected(key);
    el.classList.toggle('bulk-selected', on);
    const cb = el.querySelector('.bulk-row-check');
    if (cb) cb.checked = on;
  });
}

R.wireBulkCheckbox = function wireBulkCheckbox(el, key) {
  const cb = el.querySelector('.bulk-row-check');
  if (!cb) return;
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', (e) => {
    e.stopPropagation();
    if (cb.checked) bulkSelectedKeys.add(key);
    else bulkSelectedKeys.delete(key);
    updateBulkEditUi();
    el.classList.toggle('bulk-selected', cb.checked);
  });
}

R.findResultByKey = function findResultByKey(key) {
  if (!key) return null;
  const idx = ensureResultKeyIndex().get(key);
  return idx != null ? state.results[idx] : null;
}

R.onCardsGridClick = function onCardsGridClick(e) {
  const card = e.target.closest('.prop-card[data-key]');
  if (!card) return;
  const key = card.dataset.key;
  const r = findResultByKey(key);
  if (!r) return;
  if (e.target.closest('input.bulk-row-check, label.bulk-check-wrap')) return;

  if (state.bulkSelectMode) {
    toggleBulkKey(key);
    return;
  }

  if (e.target.closest('.card-score-float, .card-score-pill')) {
    showResultInPreview(r);
    return;
  }

  const quickMoveBtn = e.target.closest('.card-quick-tier-move');
  if (quickMoveBtn) {
    e.preventDefault();
    e.stopPropagation();
    const targetTier = quickMoveBtn.dataset.moveTier;
    if (targetTier && quickApplyTierFromCard(r, targetTier)) {
      log(`→ ${leadTierLabel(targetTier)} — ${propertyStreetLine(r)}`, 'success');
    }
    return;
  }

  showResultInPreview(r);
}

R.onResultsBodyClick = function onResultsBodyClick(e) {
  const row = e.target.closest('tr[data-key]');
  if (!row) return;
  const key = row.dataset.key;
  const r = findResultByKey(key);
  if (!r) return;
  if (e.target.closest('input.bulk-row-check')) return;

  if (state.bulkSelectMode) {
    toggleBulkKey(key);
    return;
  }

  if (e.target.closest('.score-badge')) {
    if (canEditScore(r)) openScoreEditModal(r);
    return;
  }

  showResultInPreview(r);
}

R.mutateTierOnRecord = function mutateTierOnRecord(r, tier, opts = {}) {
  if (resultCategory(r) !== 'property') return null;
  if (!PROPERTY_TIERS.includes(tier)) return null;
  const parsed = scoreForTier(tier);
  const oldTier = resultLeadTier(r);
  if (oldTier === tier) return null;
  const updated = { ...r };
  if (updated.aiScore == null) updated.aiScore = updated.score;
  if (opts.deferTraining) {
    captureCorrectionEvent(r, oldTier, tier, opts);
  } else {
    recordScoreCorrection({
      aiScore: updated.aiScore,
      userScore: parsed,
      indicators: updated.indicators,
      address: updated.address
    });
    recordTierCorrection({
      aiTier: oldTier,
      userTier: tier,
      aiScore: updated.aiScore,
      userScore: parsed,
      indicators: updated.indicators,
      satellite: updated.satelliteClassification,
      address: updated.address
    });
    captureCorrectionEvent(r, oldTier, tier, opts);
  }
  updated.score = parsed;
  updated.manualScore = true;
  updated.tierLocked = true;
  updated.leadTier = tier;
  updated.autoWellMaintained = tier === 'well_maintained';
  if (tier !== 'well_maintained') delete updated.autoWellMaintained;
  if (tier === 'well_maintained') updated.score = clampScoreForTier(updated.score, tier);
  updated.needsReview = false;
  delete updated.needsReviewLater;
  updated.reviewResolved = true;
  updated.landHomeConflict = false;
  updated.satelliteConflict = false;
  stampManualEdit(updated);
  const baseReason = (updated.reason || '')
    .replace(/ You corrected distress score from \d+ to \d+\./g, '')
    .replace(/ You set distress level to [^.]+\./g, '')
    .replace(/ You bulk-set distress level to [^.]+\./g, '')
    .replace(/ Flagged for Needs Review — decide later\./g, '')
    .trim();
  updated.reason = `${baseReason} You bulk-set distress level to ${leadTierLabel(tier)}.`;
  invalidateTierCountsCache();
  const via = opts.source || 'tier_edit';
  return markRecordManuallyReviewed(attachTierRationale(updated, { skipReconcile: true }), via);
}

R.bulkApplyTier = function bulkApplyTier(tier) {
  const keys = [...bulkSelectedKeys];
  if (!keys.length) return;
  const indices = [];
  let skip = 0;
  for (const key of keys) {
    const idx = state.results.findIndex(r => recordKey(r) === key);
    if (idx < 0) continue;
    const r = state.results[idx];
    if (resultCategory(r) !== 'property') { skip++; continue; }
    if (resultLeadTier(r) === tier) { skip++; continue; }
    indices.push(idx);
  }
  if (!indices.length) {
    alert(skip
      ? 'None of the selected leads are homes that can change distress level (vacant/unavailable already, or already at that level).'
      : 'No matching properties in selection.');
    return;
  }
  const label = leadTierLabel(tier);
  const sample = indices.slice(0, 3).map(i => propertyStreetLine(state.results[i])).join('\n· ');
  const more = indices.length > 3 ? `\n…and ${indices.length - 3} more` : '';
  if (!confirm(
    `Set distress level on ${indices.length.toLocaleString()} propert${indices.length === 1 ? 'y' : 'ies'}?\n\n` +
    `→ ${label}\n\n${sample}${more}${skip ? `\n\n(${skip} skipped — not homes or already ${label})` : ''}`
  )) return;

  const batchId = 'bulk-' + Date.now();
  let changed = 0;
  let sampleRecord = null;
  const fromTier = indices.length ? resultLeadTier(state.results[indices[0]]) : null;
  for (const idx of indices) {
    const updated = mutateTierOnRecord(state.results[idx], tier, { batchId, deferReview: true });
    if (updated) {
      state.results[idx] = updated;
      changed++;
      if (!sampleRecord) sampleRecord = state.results[idx];
    }
  }
  if (changed >= 2 && sampleRecord && fromTier) {
    const sampleEvent = correctionEvents.filter(e => e.batchId === batchId).slice(-1)[0]
      || correctionEvents[correctionEvents.length - 1];
    reviewBulkCorrectionBatch(batchId, fromTier, tier, changed, sampleEvent);
  } else if (changed === 1 && sampleRecord) {
    const ev = correctionEvents[correctionEvents.length - 1];
    if (ev) queueCorrectionReview(ev, {});
  }
  saveSession();
  scheduleSaveSession();
  updateSummaryStats();
  renderResults({ force: !state.running });
  log(`Bulk update: ${changed.toLocaleString()} → ${label} — training signal saved`, 'success');
  if (state.selectedKey && bulkSelectedKeys.has(state.selectedKey)) {
    const sel = state.results.find(r => recordKey(r) === state.selectedKey);
    if (sel && state.propertyModalOpen) showInspector(sel, { scrollList: false, scrollFeed: false });
  }
}

R.bulkApplyCategory = function bulkApplyCategory(category) {
  const keys = [...bulkSelectedKeys];
  if (!keys.length) return;
  const indices = [];
  let skip = 0;
  for (const key of keys) {
    const idx = state.results.findIndex(r => recordKey(r) === key);
    if (idx < 0) continue;
    if (resultCategory(state.results[idx]) === category) { skip++; continue; }
    indices.push(idx);
  }
  if (!indices.length) {
    alert('All selected leads are already in that category.');
    return;
  }
  const label = categoryLabel(category);
  const sample = indices.slice(0, 3).map(i => propertyStreetLine(state.results[i])).join('\n· ');
  const more = indices.length > 3 ? `\n…and ${indices.length - 3} more` : '';
  if (!confirm(
    `Change category on ${indices.length.toLocaleString()} propert${indices.length === 1 ? 'y' : 'ies'}?\n\n` +
    `→ ${label}\n\n${sample}${more}${skip ? `\n\n(${skip} already ${label})` : ''}`
  )) return;

  let changed = 0;
  for (const idx of indices) {
    const prev = state.results[idx];
    recordCategoryCorrection({
      fromCategory: resultCategory(prev),
      toCategory: category,
      aiScore: prev.aiScore ?? prev.score,
      address: prev.address
    });
    state.results[idx] = applyCategoryFields({ ...prev }, category);
    changed++;
  }
  saveSession();
  scheduleSaveSession();
  updateSummaryStats();
  renderResults({ force: !state.running });
  log(`Bulk category: ${changed.toLocaleString()} → ${label}`, 'success');
}

R.formatAccuracyHtml = function formatAccuracyHtml(r) {
  const flags = r.qualityFlags || [];
  const needs = computeNeedsReview(r);
  const conf = r.confidence;
  let html = '<div class="accuracy-flags">';
  if (needs) {
    html += '<span class="accuracy-flag">Needs review</span>';
  } else if (conf != null) {
    html += `<span class="accuracy-flag ok">AI confidence ${conf}%</span>`;
  }
  for (const f of flags) {
    html += `<span class="accuracy-flag">${escapeHtml(QUALITY_FLAG_LABELS[f] || f)}</span>`;
  }
  html += '</div>';
  if (conf != null) {
    const cls = conf >= 75 && !needs ? 'high' : 'low';
    html += `<div class="confidence-row ${cls}">Confidence: ${conf}%${needs ? ' — verify before calling' : ''}</div>`;
  }
  return html;
}

R.loadCorrections = function loadCorrections() {
  try {
    const raw = localStorage.getItem(CORRECTIONS_KEY);
    scoreCorrections = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(scoreCorrections)) scoreCorrections = [];
  } catch (_) {
    scoreCorrections = [];
  }
  try {
    const rawCat = localStorage.getItem(CATEGORY_CORRECTIONS_KEY);
    categoryCorrections = rawCat ? JSON.parse(rawCat) : [];
    if (!Array.isArray(categoryCorrections)) categoryCorrections = [];
  } catch (_) {
    categoryCorrections = [];
  }
  try {
    const rawTier = localStorage.getItem(TIER_CORRECTIONS_KEY);
    tierCorrections = rawTier ? JSON.parse(rawTier) : [];
    if (!Array.isArray(tierCorrections)) tierCorrections = [];
  } catch (_) {
    tierCorrections = [];
  }
}

R.saveCorrections = function saveCorrections(opts = {}) {
  try {
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(scoreCorrections.slice(-BRAIN_CAPS.scoreCorrections)));
    localStorage.setItem(CATEGORY_CORRECTIONS_KEY, JSON.stringify(categoryCorrections.slice(-BRAIN_CAPS.categoryCorrections)));
    localStorage.setItem(TIER_CORRECTIONS_KEY, JSON.stringify(tierCorrections.slice(-BRAIN_CAPS.tierCorrections)));
  } catch (_) { /* storage full */ }
  if (!opts.silent && !state.reviewMode) requestServerSave('corrections');
}

R.recordTierAffirmation = function recordTierAffirmation({ aiTier, confirmedTier, aiScore, userScore, indicators, satellite, address }) {
  const ai = normalizeLeadTier(aiTier);
  const confirmed = normalizeLeadTier(confirmedTier);
  if (!confirmed || confirmed === 'vacant' || confirmed === 'unavailable') return;
  const sat = satellite || {};
  tierCorrections.push({
    aiTier: ai || confirmed,
    userTier: confirmed,
    affirmed: true,
    aiScore,
    userScore,
    indicators: normalizeIndicators(indicators).slice(0, 6),
    roof: sat.roofCondition || null,
    yard: sat.yardCondition || null,
    address: (address || '').slice(0, 80),
    at: Date.now()
  });
  if (tierCorrections.length > 80) tierCorrections = tierCorrections.slice(-80);
  saveCorrections();
}

R.recordTierCorrection = function recordTierCorrection({ aiTier, userTier, aiScore, userScore, indicators, satellite, address }) {
  const from = normalizeLeadTier(aiTier);
  const to = normalizeLeadTier(userTier);
  if (!from || !to || from === to) return;
  const sat = satellite || {};
  tierCorrections.push({
    aiTier: from,
    userTier: to,
    aiScore,
    userScore,
    indicators: normalizeIndicators(indicators).slice(0, 6),
    roof: sat.roofCondition || null,
    yard: sat.yardCondition || null,
    address: (address || '').slice(0, 80),
    at: Date.now()
  });
  if (tierCorrections.length > 80) tierCorrections = tierCorrections.slice(-80);
  saveCorrections();
}

R.seedTierCorrectionsFromResults = function seedTierCorrectionsFromResults(results) {
  if (tierCorrections.length || !results?.length) return;
  for (const r of results) {
    if (!r.manualScore) continue;
    const userTier = normalizeLeadTier(r.leadTier);
    const aiScore = r.aiScore;
    if (aiScore == null) continue;
    const aiTier = aiScore <= WELL_MAINTAINED_MAX_SCORE ? 'well_maintained' : 'distressed';
    if (aiTier === userTier) continue;
    recordTierCorrection({
      aiTier,
      userTier,
      aiScore,
      userScore: r.score,
      indicators: r.indicators,
      satellite: r.satelliteClassification,
      address: r.address
    });
  }
}

R.recordScoreCorrection = function recordScoreCorrection({ aiScore, userScore, indicators, address }) {
  if (aiScore == null || userScore == null || aiScore === userScore) return;
  scoreCorrections.push({
    aiScore,
    userScore,
    delta: userScore - aiScore,
    indicators: normalizeIndicators(indicators).slice(0, 5),
    address: (address || '').slice(0, 80),
    at: Date.now()
  });
  if (scoreCorrections.length > 50) scoreCorrections = scoreCorrections.slice(-50);
  saveCorrections();
}

R.seedCategoryCorrectionsFromResults = function seedCategoryCorrectionsFromResults(results) {
  if (categoryCorrections.length || !results?.length) return;
  for (const r of results) {
    if (!r.manualOverride) continue;
    const fromCat = r.manualOverride === 'vacant_lot' ? 'property' : r.category;
    if (fromCat === r.manualOverride) continue;
    categoryCorrections.push({
      fromCategory: fromCat,
      toCategory: r.manualOverride,
      aiScore: r.aiScore ?? r.score,
      address: (r.address || '').slice(0, 80),
      at: r.savedAt || Date.now()
    });
  }
  if (categoryCorrections.length) saveCorrections();
}

R.recordCategoryCorrection = function recordCategoryCorrection({ fromCategory, toCategory, aiScore, address }) {
  if (!fromCategory || !toCategory || fromCategory === toCategory) return;
  categoryCorrections.push({
    fromCategory,
    toCategory,
    aiScore,
    address: (address || '').slice(0, 80),
    at: Date.now()
  });
  if (categoryCorrections.length > 30) categoryCorrections = categoryCorrections.slice(-30);
  saveCorrections();
}

R.HARD_NEVER_LEARN_INDICATORS = new Set([
  'boarded_windows', 'boarded_doors', 'structural_damage', 'fire_or_water_damage'
]);

R.loadLearnedBrain = function loadLearnedBrain() {
  try {
    const raw = localStorage.getItem(LEARNED_RULES_KEY);
    learnedRules = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(learnedRules)) learnedRules = [];
  } catch (_) {
    learnedRules = [];
  }
  try {
    const rawEv = localStorage.getItem(CORRECTION_EVENTS_KEY);
    correctionEvents = rawEv ? JSON.parse(rawEv) : [];
    if (!Array.isArray(correctionEvents)) correctionEvents = [];
  } catch (_) {
    correctionEvents = [];
  }
  renderLearnedRulesPanel();
}

R.saveLearnedBrain = function saveLearnedBrain(opts = {}) {
  try {
    localStorage.setItem(LEARNED_RULES_KEY, JSON.stringify(learnedRules.slice(-BRAIN_CAPS.learnedRules)));
    localStorage.setItem(CORRECTION_EVENTS_KEY, JSON.stringify(correctionEvents.slice(-BRAIN_CAPS.correctionEvents)));
  } catch (_) { /* storage full */ }
  if (!opts.silent) {
    renderLearnedRulesPanel();
    requestServerSave('learned-brain');
  }
}

R.nextLearnedRuleId = function nextLearnedRuleId() {
  return 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

R.nextCorrectionEventId = function nextCorrectionEventId() {
  return 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

R.inferCorrectionMeaning = function inferCorrectionMeaning(fromTier, toTier) {
  const from = normalizeLeadTier(fromTier);
  const to = normalizeLeadTier(toTier);
  const meanings = {
    'distressed→well_maintained':
      'Moved to Well Maintained — home is manicured/good condition, not distress. AI likely over-scored grass wording or cosmetic cues.',
    'well_maintained→distressed':
      'Moved to Distressed — visible wear or neglect (grass-cut through heavy). AI missed or under-scored distress signals.'
  };
  const key = `${from}→${to}`;
  if (meanings[key]) return meanings[key];
  return `Moved ${leadTierLabel(from)} → ${leadTierLabel(to)} — user's tier pick is ground truth for how this property should be classified.`;
}

R.inferAffirmationMeaning = function inferAffirmationMeaning(tier) {
  const t = normalizeLeadTier(tier);
  if (t === 'well_maintained') {
    return 'Confirmed Well Maintained — AI tier correct; manicured/code-list home, not distress. Reinforce skip targets with matching signals.';
  }
  if (t === 'distressed') {
    return 'Confirmed Distressed — AI tier correct; visible wear/neglect present. Reinforce work leads with matching signals.';
  }
  return `Confirmed ${leadTierLabel(t)} — user verified AI tier during review.`;
}


  }
  PDA.imagery = {
    get buildStreetViewThumbUrl() { return R.buildStreetViewThumbUrl; },
    get buildSatelliteThumbUrl() { return R.buildSatelliteThumbUrl; },
    get getCachedImageryUrls() { return R.getCachedImageryUrls; },
    get hydrateImageryFromServerIndex() { return R.hydrateImageryFromServerIndex; },
    get cachePropertyImageryBackground() { return R.cachePropertyImageryBackground; },
    get fetchImageryIndexMap() { return R.fetchImageryIndexMap; },
    get refreshAllCardThumbs() { return R.refreshAllCardThumbs; },
    get resetThumbLoadQueue() { return R.resetThumbLoadQueue; },
    get runImageryMigrationIfNeeded() { return R.runImageryMigrationIfNeeded; },
    get hasImageryKey() { return R.hasImageryKey; },
    get getApiKeyForImagery() { return R.getApiKeyForImagery; }
  };
})(window);
