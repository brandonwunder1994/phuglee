// render.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  if (typeof window !== 'undefined') window.PDA = PDA;
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {

R.wireCardThumb = function wireCardThumb(card, result) {
  const img = card.querySelector('.card-thumb img');
  const fallbackEl = card.querySelector('.card-thumb-fallback');
  const labelEl = card.querySelector('.card-thumb-source');
  if (!img) return;
  const { primary, fallback, label, needsCache } = getCardThumbUrls(result);
  if (!primary) {
    img.style.display = 'none';
    img.removeAttribute('src');
    fallbackEl?.classList.add('visible');
    if (labelEl) {
      labelEl.textContent = '';
      labelEl.style.display = 'none';
    }
    if (!hasImageryKey()) {
      fallbackEl.textContent = 'No photo — check API key in settings';
    } else if (needsCache) {
      fallbackEl.textContent = 'Loading preview…';
      scheduleImageryCacheForCard(result, card);
    } else {
      fallbackEl.textContent = 'No photo available';
    }
    return;
  }
  img.style.display = 'block';
  img.classList.remove('loaded');
  fallbackEl?.classList.remove('visible');
  fallbackEl.textContent = 'No photo — open property for imagery';
  if (labelEl) {
    labelEl.textContent = label || '';
    labelEl.style.display = label ? '' : 'none';
  }
  const cachedEl = card.querySelector('[data-cached-label]');
  if (cachedEl) {
    cachedEl.textContent = label && /cached/i.test(label) ? 'CACHED' : '';
  }
  if (fallback) img.dataset.fallback = fallback;
  else delete img.dataset.fallback;
  const liveUrls = hasImageryKey() && result?.address
    ? getPropertyImageUrls(result.address, result, { thumb: true })
    : null;
  const livePrimary = liveUrls?.streetView || liveUrls?.satellite || '';
  if (livePrimary && livePrimary !== primary && livePrimary !== fallback) {
    img.dataset.liveFallback = livePrimary;
  } else {
    delete img.dataset.liveFallback;
  }
  img.onload = () => {
    img.classList.add('loaded');
    fallbackEl?.classList.remove('visible');
  };
  img.onerror = () => {
    const liveAlt = img.dataset.liveFallback;
    if (liveAlt && img.src !== liveAlt) {
      delete img.dataset.liveFallback;
      img.src = liveAlt;
      if (labelEl) labelEl.textContent = '';
      return;
    }
    if (hasImageryKey() && result?.address && isCachedThumbUrl(img.src)) {
      const proxyUrl = buildStreetViewThumbUrl(result.address, getApiKeyForImagery(), CARD_THUMB_SIZE, result.viewMeta || null);
      if (proxyUrl && img.src !== proxyUrl) {
        img.src = proxyUrl;
        if (labelEl) labelEl.textContent = '';
        return;
      }
    }
    const alt = img.dataset.fallback;
    if (alt && img.src !== alt) {
      delete img.dataset.fallback;
      img.src = alt;
      if (labelEl) labelEl.textContent = 'Satellite';
      return;
    }
    img.style.display = 'none';
    fallbackEl?.classList.add('visible');
    if (labelEl) labelEl.textContent = '';
    if (fallbackEl) {
      const uncached = result && !getCachedImageryUrls(result).streetView && !getCachedImageryUrls(result).satellite;
      fallbackEl.textContent = uncached && hasImageryKey()
        ? 'Photo not cached yet — run migrate-imagery or rescan'
        : hasImageryKey()
          ? 'Photo unavailable — satellite fallback failed'
          : 'No photo — paste Street View API key in settings';
    }
  };
  if (img.getAttribute('src') === primary && img.complete && img.naturalWidth) {
    img.classList.add('loaded');
    img.dataset.thumbSrc = primary;
    img.dataset.thumbLoaded = '1';
    return;
  }
  scheduleThumbImageLoad(img, primary, card);
}

R.setPreviewImages = function setPreviewImages({ streetView = null, satellite = null } = {}, target = 'property') {
  const imagesEl = target === 'scan' ? scanFeedImages : previewImages;
  const satWrap = target === 'scan' ? scanFeedSatWrap : previewSatWrap;
  const satImg = target === 'scan' ? scanFeedSatImg : previewSatImg;
  const mainImg = target === 'scan' ? scanFeedImg : previewImg;
  const placeholder = target === 'scan' ? scanFeedPlaceholder : previewPlaceholder;
  const wrap = target === 'scan' ? scanFeedWrap : previewWrap;
  const paneLabel = target === 'scan' ? scanFeedPaneLabel : previewPaneLabel;
  const mainReticle = target === 'scan' ? scanFeedMainReticle : previewMainReticle;
  if (!imagesEl) return;

  const dual = !!(streetView && satellite);
  imagesEl.classList.toggle('dual', dual);
  if (satWrap) satWrap.hidden = !dual;

  const setPreviewImg = typeof setReviewImgSrc === 'function' ? setReviewImgSrc : setImgSrc;
  if (dual) {
    setPreviewImg(satImg, satellite);
    setPreviewImg(mainImg, streetView);
    placeholder.style.display = 'none';
    wrap.classList.remove('satellite-target');
    paneLabel.textContent = 'Street View';
    mainReticle.style.display = 'none';
  } else if (streetView) {
    setPreviewImg(mainImg, streetView);
    if (satImg) satImg.style.display = 'none';
    placeholder.style.display = 'none';
    wrap.classList.remove('satellite-target');
    paneLabel.textContent = 'Street View';
    mainReticle.style.display = 'none';
  } else if (satellite) {
    setPreviewImg(mainImg, satellite);
    if (satImg) satImg.style.display = 'none';
    placeholder.style.display = 'none';
    wrap.classList.add('satellite-target');
    paneLabel.textContent = 'Satellite';
    mainReticle.style.display = 'block';
  } else {
    mainImg.style.display = 'none';
    if (satImg) satImg.style.display = 'none';
    placeholder.style.display = 'block';
    mainImg.removeAttribute('src');
    if (satImg) satImg.removeAttribute('src');
    wrap.classList.remove('satellite-target');
    mainReticle.style.display = 'none';
  }
}

R.updateScanPinUi = function updateScanPinUi() {
  updateAppNav();
}

R.pinProperty = function pinProperty(r) {
  if (!r) return;
  state.pinnedKey = recordKey(r);
  state.pinnedLiveAddress = null;
  updateScanPinUi();
  showInspector(r, { scrollFeed: false, scrollList: false });
}

R.pinLiveScan = function pinLiveScan() {
  if (!state.running || state.pinnedKey) return;
  state.pinnedKey = '__live__';
  state.pinnedLiveAddress = state.scanLiveSnapshot?.address || null;
  updateScanPinUi();
  if (scanFeedStatus) scanFeedStatus.textContent = 'Paused — viewing live feed';
}

R.backToScan = function backToScan() {
  closePropertyModal({ save: false });
  state.pinnedKey = null;
  state.pinnedLiveAddress = null;
  state.appView = 'dashboard';
  updateScanPinUi();
  updateScanFeedUi();
  renderResults();
  updateAppNav();
  saveSession();
}

R.syncResultSelectionDom = function syncResultSelectionDom(prevKey, nextKey) {
  if (prevKey && prevKey !== nextKey) {
    cardsGrid?.querySelector(`.prop-card[data-key="${CSS.escape(prevKey)}"]`)?.classList.remove('selected');
    resultsBody?.querySelector(`tr[data-key="${CSS.escape(prevKey)}"]`)?.classList.remove('row-selected');
  }
  if (nextKey) {
    cardsGrid?.querySelector(`.prop-card[data-key="${CSS.escape(nextKey)}"]`)?.classList.add('selected');
    resultsBody?.querySelector(`tr[data-key="${CSS.escape(nextKey)}"]`)?.classList.add('row-selected');
  }
}

R.prefetchInspectorNeighbors = function prefetchInspectorNeighbors(list, idx) {
  if (!list?.length || idx < 0) return;
  const prefetchRecord = (r) => {
    if (!r?.address) return;
    const urls = getPropertyImageUrls(r.address, r);
    const url = urls.preferSatellite ? (urls.satellite || urls.streetView) : (urls.streetView || urls.satellite);
    if (url && typeof preloadReviewImageUrl === 'function') preloadReviewImageUrl(url);
  };
  if (idx > 0) prefetchRecord(list[idx - 1]);
  if (idx < list.length - 1) prefetchRecord(list[idx + 1]);
}

R.showInspector = function showInspector(r, opts = {}) {
  if (!r) {
    closePropertyModal({ save: false });
    return;
  }
  const prevSelectedKey = state.selectedKey;
  const list = getFilteredResults();
  const idx = list.findIndex(x => recordKey(x) === recordKey(r));
  const cat = resultCategory(r);
  const tier = resultLeadTier(r);
  const score = resultScore(r);

  state.selectedKey = recordKey(r);
  if (state.scoreEditKey && state.scoreEditKey !== recordKey(r)) state.scoreEditKey = null;
  if (previewHeaderTitle) previewHeaderTitle.textContent = propertyLocationTitle(r);
  const urls = getPropertyImageUrls(r.address, r);
  const { satellite, streetView, preferSatellite } = urls;
  if (preferSatellite) {
    setPreviewImages({ streetView: null, satellite: satellite || streetView }, 'property');
  } else {
    setPreviewImages({ streetView, satellite }, 'property');
  }
  if (!urls.fromCache && USE_PROXY && r.address) {
    cachePropertyImageryBackground(r, {
      includeSatellite: preferSatellite || r.usedSatellite || r.skippedStreetView
    });
  }
  updateGauge(cat === 'property' ? score : null, opts.animateGauge !== false, 'property', {
    category: cat,
    leadTier: tier
  });
  liveDot.classList.add('idle');
  previewWrap.classList.remove('scanning');
  recBadge.classList.add('idle');

  inspectorBody.className = 'inspector-body inspector-body-calm';
  inspectorBody.innerHTML = `
    <div class="inspector-address-primary">${escapeHtml(propertyStreetLine(r))}</div>
    <div class="inspector-name-secondary">${propertyTitleHtml(r)}</div>
    ${leadUploadedHtml(r, 'detail')}
    <div class="inspector-badges">
      <span class="tier-badge ${tierBadgeClassForRecord(r)}">${tierBadgeLabelForRecord(r)}</span>
      <span class="category-badge ${categoryBadgeClass(cat)}">${categoryLabel(cat)}</span>
      ${leadTypeBadgeHtml(r)}
      ${r.usedSatellite && urls.streetView ? '<span class="category-badge property">Satellite + Street View</span>' : ''}
      ${r.skippedStreetView ? '<span class="category-badge vacant">No Street View at address</span>' : ''}
      ${r.manualScore ? '<span class="score-corrected-badge">Level adjusted by you</span>' : ''}
      ${r.manualOverride ? '<span class="category-corrected-badge">Category changed by you</span>' : ''}
      ${manuallyReviewedBadgeHtml(r)}
      ${exportedBadgeHtml(r)}
    </div>
    ${cat === 'property' ? (state.scoreEditKey === recordKey(r) ? `
    <div class="score-adjust-panel">
      <div class="score-adjust-title">Set distress level</div>
      ${r.aiScore != null && r.aiScore !== r.score ? `<div class="score-ai-note">AI picked <strong>${leadTierLabel(tierFromScore(r.aiScore, 'property'))}</strong> — current <strong>${leadTierLabel(tier)}</strong></div>` : r.aiScore != null ? `<div class="score-ai-note">AI picked <strong>${leadTierLabel(tierFromScore(r.aiScore, 'property'))}</strong></div>` : ''}
      <div class="tier-picker" id="inspectorTierPicker">${buildTierPickerHtml(tier, 'inspectorPick')}</div>
      <div class="score-adjust-actions">
        <button type="button" class="score-save-btn" id="saveScoreBtn">Save Level</button>
        <button type="button" class="score-cancel-btn" id="cancelScoreBtn">Cancel</button>
      </div>
      <div class="score-adjust-hint">${scoreCorrections.length ? `${scoreCorrections.length} past level picks saved — future scans calibrate from these.` : 'Your level picks save locally and help calibrate future scans.'}</div>
    </div>` : `
    <div class="score-display-row">
      <div class="score-display-current">
        <span class="score-display-label">Distress level</span>
        <span class="score-display-val score-display-tier">${escapeHtml(leadTierLabel(tier))}</span>
        ${r.aiScore != null && r.aiScore !== r.score ? `<span class="score-ai-note" style="margin:0;">AI: ${escapeHtml(leadTierLabel(tierFromScore(r.aiScore, 'property')))}</span>` : ''}
      </div>
      <button type="button" class="score-change-btn" id="changeScoreBtn">Change Level</button>
    </div>`) : ''}
    ${formatSimpleAnalysisHtml(r)}
    <div class="inspector-actions">
      <a class="google-search-btn" href="${escapeHtml(getGoogleSearchUrl(r.address))}" target="_blank" rel="noopener noreferrer">Search Google Listings</a>
    </div>
    ${computeNeedsReview(r) ? `<div class="review-queue-panel" style="margin-bottom:0.5rem;">
      <div class="review-queue-title">Needs your review</div>
      <p class="review-queue-hint">Use Change category below to fix this classification.</p>
    </div>` : ''}
    ${formatCategoryChangeHtml(r)}
    <div class="inspector-contacts">
      <div class="contact-chip">
        <span class="lbl">Contact</span>
        <span class="val">${escapeHtml(contactName(r))}</span>
      </div>
      <div class="contact-chip">
        <span class="lbl">Phone</span>
        <span class="val">${escapeHtml(r.phone || '—')}</span>
        ${r.phone ? '<button type="button" class="copy-btn copy-phone">Copy</button>' : ''}
      </div>
      <div class="contact-chip">
        <span class="lbl">Email</span>
        <span class="val">${escapeHtml(r.email || '—')}</span>
        ${r.email ? '<button type="button" class="copy-btn copy-email">Copy</button>' : ''}
      </div>
    </div>
    <div class="inspector-hint">↑↓ or J/K between leads · Esc to close</div>
  `;
  const phoneBtn = inspectorBody.querySelector('.copy-phone');
  const emailBtn = inspectorBody.querySelector('.copy-email');
  if (phoneBtn) phoneBtn.addEventListener('click', (e) => { e.stopPropagation(); copyText(r.phone, phoneBtn); });
  if (emailBtn) emailBtn.addEventListener('click', (e) => { e.stopPropagation(); copyText(r.email, emailBtn); });
  inspectorBody.querySelectorAll('[data-change-cat]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!btn.disabled) changeCategory(r, btn.dataset.changeCat);
    });
  });
  inspectorBody.querySelector('.google-search-btn')?.addEventListener('click', (e) => e.stopPropagation());

  const changeScoreBtn = inspectorBody.querySelector('#changeScoreBtn');
  changeScoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.scoreEditKey = recordKey(r);
    showInspector(r, { scrollList: false, scrollFeed: false });
  });

  let inspectorSelectedTier = tier;
  const inspectorTierPicker = inspectorBody.querySelector('#inspectorTierPicker');
  wireTierPicker(inspectorTierPicker, (t) => { inspectorSelectedTier = t; });
  const saveScoreBtn = inspectorBody.querySelector('#saveScoreBtn');
  const cancelScoreBtn = inspectorBody.querySelector('#cancelScoreBtn');
  saveScoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    applyScoreCorrection(r, inspectorSelectedTier);
  });
  cancelScoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.scoreEditKey = null;
    showInspector(r, { scrollList: false, scrollFeed: false });
  });

  const pos = idx >= 0 ? idx + 1 : '?';
  inspectorPos.textContent = list.length ? `${pos} / ${list.length}` : '—';
  prevPropBtn.disabled = idx <= 0;
  nextPropBtn.disabled = idx < 0 || idx >= list.length - 1;

  const navOnly = opts.navOnly === true;
  if (navOnly) syncResultSelectionDom(prevSelectedKey, state.selectedKey);
  else renderResults();
  if (opts.scrollList === true) scrollToSelectedCard();
  openPropertyModal();
  prefetchInspectorNeighbors(list, idx);
  if (!navOnly) scheduleSaveSession('inspector-open');
}

R.navigateProperty = function navigateProperty(delta) {
  const list = getFilteredResults();
  if (!list.length) return;
  let idx = getSelectedIndex(list);
  if (idx < 0) idx = delta > 0 ? -1 : list.length;
  const next = idx + delta;
  if (next >= 0 && next < list.length) {
    if (state.running && state.pinnedKey) pinProperty(list[next]);
    else showInspector(list[next], { scrollList: true, navOnly: true, animateGauge: false });
  }
}

R.scrollToSelectedCard = function scrollToSelectedCard() {
  if (!state.selectedKey) return;
  requestAnimationFrame(() => {
    const card = cardsGrid.querySelector(`[data-key="${CSS.escape(state.selectedKey)}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const row = resultsBody.querySelector(`[data-key="${CSS.escape(state.selectedKey)}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

R.collapseSetup = function collapseSetup(collapsed) {
  state.setupCollapsed = collapsed;
}

R.openFilePicker = function openFilePicker() {
  if (state.running) {
    alert('Stop the scan before uploading a new file.');
    return;
  }
  if (!fileInput) {
    alert('Upload control failed to load. Refresh the page (Ctrl+F5).');
    return;
  }
  openUploadModal();
  fileInput.click();
}

R.updateUploadCollapsedBar = function updateUploadCollapsedBar() {
  uploadCollapsedBar?.classList.toggle('visible', state.setupCollapsed);
}

R.enterReviewMode = function enterReviewMode() {
  if (!state.results.length) return;
  progressSection.classList.add('review-minimal');
  summarySection.classList.add('visible');
  const reviewQueue = getReviewQueue();
  if (reviewQueue.length) {
    state.filter = 'review';
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === 'review');
    });
    log(`${reviewQueue.length} need review — filter set to Needs Review`, 'success');
  }
  if (state.appView === 'scan' || state.appView === 'setup') {
    setAppView('dashboard');
  } else {
    renderResults();
    updateAppNav();
    saveSession();
  }
}

R.updateExportSidebarHint = function updateExportSidebarHint() {
  let hint = 'Run a scan to export';
  if (state.results.length) {
    if (state.running) {
      hint = 'Wait until scan finishes';
    } else {
      const total = state.results.length;
      const list = getFilteredResults();
      hint = `Excel exports all ${total.toLocaleString()} leads · CSV uses current list (${list.length.toLocaleString()})`;
    }
  }
  if (sidebarExportHint) sidebarExportHint.textContent = hint;
}

R.updateExportButtons = function updateExportButtons() {
  const hasResults = state.results.length > 0;
  const canExportFiltered = hasResults && !state.running && getFilteredResults().length > 0;
  const canExportAll = hasResults && !state.running;
  if (exportBtn) exportBtn.disabled = !canExportAll;
  for (const btn of EXPORT_MENU_BTNS) {
    if (!btn) continue;
    if (btn === sidebarExportAllBtn || btn === sidebarExportExcelBtn) btn.disabled = !canExportAll;
    else btn.disabled = !canExportFiltered;
  }
  if (bulkSelectToggleBtn) bulkSelectToggleBtn.disabled = !hasResults;
  for (const btn of REVIEW_ENTRY_BTNS) {
    if (btn) btn.disabled = !hasResults;
  }
  updateExportSidebarHint();
}

R.exportFilterSlug = function exportFilterSlug() {
  const f = state.filter || 'all';
  if (state.searchQuery.trim()) return 'search';
  return String(f).replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'all';
}

R.buildDialReadyExportDeps = function buildDialReadyExportDeps(origin = '') {
  const schema = (typeof PDA !== 'undefined' && PDA.lib?.exportSchema) || null;
  if (!schema) return null;
  return {
    resolveImageryForResult: typeof resolveImageryForResult === 'function' ? resolveImageryForResult : (r) => r,
    getCachedImageryUrls: typeof getCachedImageryUrls === 'function' ? getCachedImageryUrls : () => ({ streetView: null }),
    leadTypeLabel,
    resultLeadType,
    resultLeadTier,
    resultCategory,
    origin: origin || (typeof window !== 'undefined' ? window.location.origin : ''),
    schema
  };
}

R.buildDialReadyExportRows = function buildDialReadyExportRows(records = null, opts = {}) {
  const deps = R.buildDialReadyExportDeps(opts.origin);
  if (!deps?.schema) return [];
  const source = records || state.results;
  return deps.schema.buildDialReadyRows(source, deps);
}

R.buildExportRows = function buildExportRows(records = null, opts = {}) {
  const profile = opts.profile || 'full';
  if (profile === 'dial_ready') {
    return R.buildDialReadyExportRows(records, opts);
  }
  const source = records || state.results;
  return [...source]
    .sort((a, b) => b.score - a.score)
    .map(r => {
      const cat = resultCategory(r);
      const tier = resultLeadTier(r);
      const inds = normalizeIndicators(r.indicators).map(k => INDICATOR_LABELS[k] || k);
      const flags = (r.qualityFlags || []).map(f => QUALITY_FLAG_LABELS[f] || f);
      return {
        'First Name': r.firstName,
        'Last Name': r.lastName,
        Phone: r.phone,
        Email: r.email,
        'Street Address': r.street,
        City: r.city,
        State: r.state,
        'Postal Code': r.postal,
        'Lead Type': leadTypeLabel(resultLeadType(r)),
        'Lead Tier': leadTierLabel(tier),
        Category: categoryLabel(cat),
        'Category Changed By You': r.manualOverride ? 'Yes' : 'No',
        'Distress Score': cat === 'property' ? resultScore(r) : 0,
        'AI Original Score': r.aiScore != null ? r.aiScore : (cat === 'property' ? r.score : ''),
        'Score Adjusted By You': r.manualScore ? 'Yes' : 'No',
        'Manually Reviewed': isManuallyReviewed(r) ? 'Yes' : 'No',
        'AI Confidence': r.confidence != null ? r.confidence : '',
        'Needs Review': computeNeedsReview(r) ? 'Yes' : 'No',
        'Needs Review Later': r.needsReviewLater ? 'Yes' : 'No',
        'Satellite Check': r.satelliteClassification?.category
          ? categoryLabel(normalizeCategory(r.satelliteClassification.category))
          : (r.usedSatellite ? 'Yes' : 'No'),
        'Satellite Roof': r.satelliteClassification?.roofCondition
          ? (CONDITION_LABELS[r.satelliteClassification.roofCondition] || r.satelliteClassification.roofCondition)
          : '',
        'Satellite Yard': r.satelliteClassification?.yardCondition
          ? (CONDITION_LABELS[r.satelliteClassification.yardCondition] || r.satelliteClassification.yardCondition)
          : '',
        'Aerial Distress Score': r.satelliteClassification?.aerialDistressScore ?? '',
        'Street View Skipped': r.skippedStreetView ? 'Yes' : 'No',
        'Quality Flags': flags.join(', '),
        'D4D Indicators': inds.join(', '),
        'Why This Tier': r.tierRationale || buildTierRationale(r),
        Reason: r.reason,
        Tags: leadTags(r).join(', '),
        'Exported At': formatExportedAt(r)
      };
    });
}

R.prepareDialReadyExport = async function prepareDialReadyExport(records) {
  if (typeof fetchImageryIndexMap === 'function') {
    try { await fetchImageryIndexMap(); } catch (_) { /* use cache */ }
  }
  if (typeof hydrateImageryFromServerIndex === 'function') {
    try { await hydrateImageryFromServerIndex(); } catch (_) { /* proceed */ }
  }
  for (const r of records) {
    if (typeof resolveImageryForResult === 'function') resolveImageryForResult(r);
  }
}

R.exportResults = async function exportResults(format = 'xlsx', opts = {}) {
  const useAll = opts.scope === 'all';
  const profile = opts.profile || (useAll ? 'dial_ready' : 'full');
  const records = useAll ? state.results : getFilteredResults();
  if (!state.results.length) {
    alert('No results to export yet — run a scan first.');
    return;
  }
  if (!records.length) {
    alert('No leads in the current list to export — try a different filter or clear search.');
    return;
  }
  if (typeof XLSX === 'undefined') {
    alert('Spreadsheet library failed to load. Check your internet connection and refresh the page.');
    return;
  }
  if (profile === 'dial_ready') {
    await R.prepareDialReadyExport(records);
  }
  const exportedAt = new Date().toISOString();
  const exportKeys = new Set(records.map((r) => recordKey(r)));
  markLeadsExported(records, exportedAt);
  const exportRecords = state.results.filter((r) => exportKeys.has(recordKey(r)));
  const exportData = buildExportRows(exportRecords, {
    profile,
    origin: typeof window !== 'undefined' ? window.location.origin : ''
  });
  const date = exportedAt.slice(0, 10);
  const slug = profile === 'dial_ready' ? 'database' : (useAll ? 'all' : exportFilterSlug());
  const baseName = `property-distress-${slug}-${date}`;

  if (format === 'csv') {
    const ws = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${baseName}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  } else {
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = profile === 'dial_ready'
      ? [
        { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 8 }, { wch: 10 },
        { wch: 48 }, { wch: 48 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
        { wch: 22 }, { wch: 16 }, { wch: 28 }
      ]
      : [
        { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 28 },
        { wch: 30 }, { wch: 16 }, { wch: 8 }, { wch: 10 },
        { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 8 },
        { wch: 40 }, { wch: 50 }
      ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, profile === 'dial_ready' ? 'Lead Database' : 'Distress Results');
    XLSX.writeFile(wb, `${baseName}.xlsx`);
  }
  const listLabel = profile === 'dial_ready'
    ? 'full database'
    : (useAll ? 'all leads' : (state.searchQuery.trim() ? `search (${exportData.length})` : (FILTER_LABELS[state.filter] || state.filter).toLowerCase()));
  log(`Exported ${exportData.length} ${listLabel} to ${format.toUpperCase()} · tagged as exported`, 'success');
  showUiToast?.(`Exported ${exportData.length.toLocaleString()} leads (${format.toUpperCase()})`);
  saveSession('export');
  if (state.selectedKey) {
    const selected = state.results.find((r) => recordKey(r) === state.selectedKey);
    if (selected) showInspector(selected, { scrollList: false, scrollFeed: false, animateGauge: false });
  }
  renderResults({ force: true });
}

R.thumbUrl = function thumbUrl(address, result) {
  const urls = getCardThumbUrls(result || { address });
  return urls.primary || urls.fallback || '';
}

R.showResultInPreview = function showResultInPreview(r) {
  state.selectedKey = recordKey(r);
  if (state.running) pinProperty(r);
  else showInspector(r, { scrollList: true });
}

R.preservePageScroll = function preservePageScroll(fn) {
  if (!shouldLockScroll()) {
    fn();
    return;
  }
  const y = window.scrollY;
  const x = window.scrollX;
  fn();
  requestAnimationFrame(() => {
    if (!userIsScrolling() && (window.scrollY !== y || window.scrollX !== x)) {
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    }
  });
}

R.log = function log(msg, type = '') {
  const write = () => {
    const entry = document.createElement('div');
    entry.className = 'log-entry' + (type ? ` log-${type}` : '');
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logPanel.appendChild(entry);
    while (logPanel.children.length > 100) logPanel.firstChild.remove();
    logPanel.scrollTop = logPanel.scrollHeight;
  };
  if (state.running) preservePageScroll(write);
  else write();
}

R.findColumn = function findColumn(headers, names) {
  const normalized = headers.map(h => ({ original: h, lower: h.trim().toLowerCase() }));
  for (const name of names) {
    const match = normalized.find(h => h.lower === name);
    if (match) return match.original;
  }
  return null;
}

R.buildFullAddress = function buildFullAddress(street, city, stateName, postal) {
  if (!street) return '';
  const cityState = [city, stateName].filter(Boolean).join(', ');
  const parts = [street];
  if (cityState) parts.push(cityState);
  if (postal) parts[parts.length - 1] = `${parts[parts.length - 1]} ${postal}`.trim();
  return parts.join(', ');
}

R.parseSpreadsheet = function parseSpreadsheet(file, leadType = DEFAULT_LEAD_TYPE) {
  const importLeadType = normalizeLeadType(leadType);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rows.length) {
          reject(new Error('Spreadsheet is empty'));
          return;
        }

        const headers = Object.keys(rows[0]);
        const cols = {
          firstName: findColumn(headers, ['first name', 'firstname', 'first']),
          lastName: findColumn(headers, ['last name', 'lastname', 'last']),
          phone: findColumn(headers, ['phone', 'phone number', 'telephone', 'mobile', 'cell']),
          email: findColumn(headers, ['email', 'email address', 'e-mail']),
          street: findColumn(headers, ['street address', 'street', 'address']),
          city: findColumn(headers, ['city']),
          state: findColumn(headers, ['state']),
          postal: findColumn(headers, ['postal code', 'zip code', 'zip', 'postal'])
        };

        const missing = [];
        if (!cols.firstName) missing.push('First Name');
        if (!cols.lastName) missing.push('Last Name');
        if (!cols.phone) missing.push('Phone');
        if (!cols.email) missing.push('Email');
        if (!cols.street) missing.push('Street Address');
        if (!cols.city) missing.push('City');
        if (!cols.state) missing.push('State');
        if (!cols.postal) missing.push('Postal Code');

        if (missing.length) {
          reject(new Error(`Missing columns: ${missing.join(', ')}`));
          return;
        }

        const records = rows.map(r => {
          const street = String(r[cols.street] || '').trim();
          const city = String(r[cols.city] || '').trim();
          const stateName = String(r[cols.state] || '').trim();
          const postal = String(r[cols.postal] || '').trim();
          return {
            firstName: String(r[cols.firstName] || '').trim(),
            lastName: String(r[cols.lastName] || '').trim(),
            phone: String(r[cols.phone] || '').trim(),
            email: String(r[cols.email] || '').trim(),
            street,
            city,
            state: stateName,
            postal,
            address: buildFullAddress(street, city, stateName, postal),
            leadType: importLeadType
          };
        }).filter(r => r.address.length > 0);

        if (!records.length) {
          reject(new Error('No valid rows found in the spreadsheet'));
          return;
        }

        resolve(records);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

R.fileDropDepth = 0;

R.isSpreadsheetFile = function isSpreadsheetFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  if (/\.(xlsx|xls|xlsm|csv)$/i.test(name)) return true;
  const type = (file.type || '').toLowerCase();
  return /spreadsheet|excel|csv|sheet|ms-excel|officedocument/.test(type);
}

R.fileFromDataTransfer = function fileFromDataTransfer(dt) {
  if (!dt) return null;
  const files = dt.files ? [...dt.files] : [];
  return files.find(isSpreadsheetFile) || files[0] || null;
}

R.hasFileDrag = function hasFileDrag(dt) {
  if (!dt) return false;
  if (dt.files?.length) return true;
  if (!dt.types?.length) return false;
  const types = [...dt.types];
  return types.includes('Files')
    || types.includes('application/x-moz-file')
    || types.some(t => /excel|spreadsheet|csv|sheet|ms-excel|officedocument/i.test(String(t)));
}

R.setFileDropActive = function setFileDropActive(active) {
  fileDrop?.classList.toggle('dragover', active);
  if (!active) fileDropDepth = 0;
}

R.preventFileDropDefaults = function preventFileDropDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

R.acceptDroppedFile = async function acceptDroppedFile(file, source = 'drop') {
  if (!file) {
    log('No file detected — try Browse for Excel File', 'error');
    return;
  }
  if (!isSpreadsheetFile(file)) {
    alert(`Unsupported file: ${file.name || 'unknown'}\n\nUse .xlsx, .xls, or .csv`);
    return;
  }
  openUploadModal();
  await handleFile(file);
  if (source === 'drop') log(`Loaded via drag & drop: ${file.name}`, 'success');
}

if (!fileInput || !fileDrop) {
  console.error('Upload controls missing from page');
  showFatalError('Upload controls failed to initialize. Hard refresh the page (Ctrl+F5) or restart launch-analyzer.bat.');
} else {
  fileInput.addEventListener('click', (e) => {
    if (state.running) {
      e.preventDefault();
      alert('Stop the scan before uploading a new file.');
    }
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    fileInput.value = '';
    if (!file) return;
    await acceptDroppedFile(file, 'browse');
  });

  fileDrop.addEventListener('dragenter', (e) => {
    preventFileDropDefaults(e);
    if (state.running) return;
    fileDropDepth++;
    setFileDropActive(true);
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  fileDrop.addEventListener('dragover', (e) => {
    preventFileDropDefaults(e);
    if (state.running) return;
    setFileDropActive(true);
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  fileDrop.addEventListener('dragleave', (e) => {
    preventFileDropDefaults(e);
    fileDropDepth = Math.max(0, fileDropDepth - 1);
    if (fileDropDepth === 0) setFileDropActive(false);
  });

  fileDrop.addEventListener('drop', async (e) => {
    preventFileDropDefaults(e);
    setFileDropActive(false);
    if (state.running) {
      log('Stop the scan before uploading a new file', 'error');
      return;
    }
    await acceptDroppedFile(fileFromDataTransfer(e.dataTransfer), 'drop');
  });

}

browseFileLabel?.addEventListener('click', (e) => {
  if (state.running) {
    e.preventDefault();
    alert('Stop the scan before uploading a new file.');
  }
});
uploadCollapsedBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  openFilePicker();
});
document.addEventListener('dragenter', (e) => {
  if (!hasFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  openUploadModal();
});

document.addEventListener('dragover', (e) => {
  if (!hasFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('drop', async (e) => {
  if (!hasFileDrag(e.dataTransfer)) return;
  preventFileDropDefaults(e);
  setFileDropActive(false);
  if (state.running) {
    log('Stop the scan before uploading a new file', 'error');
    return;
  }
  await acceptDroppedFile(fileFromDataTransfer(e.dataTransfer), 'drop');
});

R.handleFile = async function handleFile(file) {
  if (!isSpreadsheetFile(file)) {
    alert(`Unsupported file type: ${file.name}\n\nPlease use an Excel file (.xlsx, .xls) or .csv`);
    return;
  }
  try {
    const leadType = normalizeLeadType($('importLeadTypeSelect')?.value || state.importLeadType);
    state.importLeadType = leadType;
    const records = await parseSpreadsheet(file, leadType);
    abortSessionBackgroundLoad();
    sessionLoadState = {
      complete: false,
      loading: false,
      loaded: 0,
      total: 0,
      serverCanonical: 0
    };
    delete state._tierCountsFromServer;
    state.records = records;
    state.results = [];
    state.processed = 0;
    state.succeeded = 0;
    state.skipped = 0;
    state.failStreetView = 0;
    state.failGemini = 0;
    state.fileName = file.name;
    state.selectedKey = null;
    $('failStats').classList.remove('visible');
    fileInfo.textContent = `✓ ${file.name} — ${records.length.toLocaleString()} rows · ${leadTypeLabel(leadType)}`;
    fileInfo.classList.add('visible');
    heroCount.textContent = records.length.toLocaleString();
    cardsGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">▶</div>Ready — hit Start Analysis</div>';
    resultsBody.innerHTML = '<tr><td colspan="13" class="empty-state">Ready — hit Start Analysis</td></tr>';
    $('resultCount').textContent = '';
    updateExportButtons();
    summarySection.classList.remove('visible');
    updateGauge(null);
    saveSession('file-upload');
    flushSaveSession({ sync: true, force: true, reason: 'file-upload' });
    log(`Loaded ${records.length} rows from ${file.name}`, 'success');
    state.appView = 'dashboard';
    collapseSetup(true);
    updateCommandBar();
    closeToolModal(uploadModal);
    updateStartButton();
  } catch (err) {
    fileInfo.textContent = '';
    fileInfo.classList.remove('visible');
    heroCount.textContent = '—';
    state.records = [];
    log(err.message, 'error');
    alert(err.message);
    updateStartButton();
  }
}

R.scoreClass = function scoreClass(score, category) {
  if (category === 'vacant_lot') return 'score-vacant';
  if (category === 'unavailable') return 'score-moderate';
  if (score >= DISTRESSED_MIN_SCORE) return 'score-distressed';
  return 'score-low';
}

R.scoreDisplay = function scoreDisplay(score, category) {
  if (category === 'vacant_lot') return '🏜️';
  if (category === 'unavailable') return '—';
  return tierEmoji(tierFromScore(score, category));
}

R.renderVirtualCards = function renderVirtualCards() {
  if (!virtualScroll.initialized) initVirtualScroll();
  if (!cardsVirtualWindow) return;
  if (state.viewMode !== 'cards' || state.running) return;
  const sorted = getFilteredResults();
  const total = sorted.length;
  if (!total) {
    cardsVirtualWindow.replaceChildren();
    cardsVirtualWindow.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">◎</div>Results appear here — newest uploads at the top</div>';
    updateVirtualSpacerHeight(0);
    return;
  }

  const scrollTop = cardsGrid?.scrollTop ?? virtualScroll.scrollTop;
  virtualScroll.scrollTop = scrollTop;
  const viewH = cardsGrid?.clientHeight || virtualScroll.containerHeight;
  const metrics = getVirtualScrollMetrics();
  const range = metrics.slice(total, scrollTop, viewH);
  const slice = sorted.slice(range.startIndex, range.endIndex);

  updateVirtualSpacerHeight(total);
  cardsVirtualWindow.style.transform = `translateY(${range.offsetY}px)`;

  const rankMap = buildDistressedRankMap();
  const nextKeys = new Set(slice.map(r => recordKey(r)));
  const frag = document.createDocumentFragment();

  for (const r of slice) {
    const key = recordKey(r);
    let card = virtualScroll.mountedKeys.get(key);
    if (card && card.isConnected) {
      syncPropCardSelection(card, r, rankMap);
    } else {
      card = buildPropCard(r, rankMap);
      virtualScroll.mountedKeys.set(key, card);
    }
    frag.appendChild(card);
  }
  const indicator = cardsVirtualWindow.querySelector('.session-load-indicator');
  cardsVirtualWindow.replaceChildren(frag);
  if (indicator) cardsVirtualWindow.appendChild(indicator);

  for (const [key] of virtualScroll.mountedKeys) {
    if (!nextKeys.has(key)) virtualScroll.mountedKeys.delete(key);
  }

  updateResultCountLabel();
  if (resultsLoadMore) resultsLoadMore.hidden = true;
}

R.renderResults = function renderResults(opts = {}) {
  if (state.running && state.appView === 'dashboard' && !opts.force) {
    updateSummaryStats();
    updateResultCountLabel();
    return;
  }
  if (state.running) {
    preservePageScroll(() => renderResultsInner());
    return;
  }
  renderResultsInner();
}

R.buildPropCard = function buildPropCard(r, rankMap) {
  const key = recordKey(r);
  const bulkOn = isBulkSelected(key);
  const tierClass = tierBadgeClassForRecord(r);
  const card = document.createElement('div');
  card.className = `prop-card card-cyber ${heatClassForRecord(r)}${computeNeedsReview(r) ? ' needs-review' : ''}${state.selectedKey === key ? ' selected' : ''}${bulkOn ? ' bulk-selected' : ''}`;
  card.dataset.key = key;
  card.innerHTML = `
    <div class="card-thumb">
      <span class="card-badge-overlay tier-badge ${tierClass}">${tierBadgeLabelForRecord(r)}</span>
      <span class="card-score-pill">${escapeHtml(scoreDisplayForRecord(r))}</span>
      <label class="bulk-check-wrap" onclick="event.stopPropagation()"><input type="checkbox" class="bulk-row-check" aria-label="Select property"${bulkOn ? ' checked' : ''}></label>
      <img alt="" loading="lazy" decoding="async" style="display:none">
      <div class="card-thumb-gradient"></div>
      <div class="card-thumb-overlay">
        <div class="card-address">${escapeHtml(propertyStreetLine(r))}</div>
        <div class="card-location">${propertyTitleHtml(r)}</div>
      </div>
      <div class="card-hover-actions">
        <span class="card-action-btn">View Details</span>
      </div>
      <span class="card-thumb-source"></span>
      <div class="card-thumb-fallback">No photo — open property for imagery</div>
    </div>
    <div class="card-meta-cyber">
      <span class="card-cached" data-cached-label></span>
      ${isLeadExported(r) ? `<span class="card-exported-tag">Exported</span>` : ''}
      <span class="card-timestamp">${escapeHtml(formatLeadUploadedAt(r))}</span>
    </div>`;
  wireBulkCheckbox(card, key);
  wireCardThumb(card, r);
  return card;
}

R.buildResultRow = function buildResultRow(r) {
  const cat = resultCategory(r);
  const tier = resultLeadTier(r);
  const key = recordKey(r);
  const bulkOn = isBulkSelected(key);
  const tr = document.createElement('tr');
  tr.dataset.key = key;
  tr.className = `${state.selectedKey === key ? 'row-selected' : ''}${bulkOn ? ' bulk-selected' : ''}`.trim();
  tr.style.cursor = 'pointer';
  tr.innerHTML = `
    <td class="col-bulk"><input type="checkbox" class="bulk-row-check" aria-label="Select row"${bulkOn ? ' checked' : ''}></td>
    <td class="col-score"><span class="score-badge ${scoreClassForRecord(r)}">${scoreDisplayForRecord(r)}</span></td>
    <td class="col-uploaded">${leadUploadedHtml(r, 'table')}${isLeadExported(r) ? `<div class="table-exported-at">${escapeHtml(formatExportedAt(r))}</div>` : ''}</td>
    <td><span class="tier-badge ${tierBadgeClassForRecord(r)}">${tierBadgeLabelForRecord(r)}</span>${exportedBadgeHtml(r)}</td>
    <td><span class="category-badge ${categoryBadgeClass(cat)}">${categoryLabel(cat)}</span></td>
    <td>${leadTypeBadgeHtml(r)}</td>
    <td class="col-location">${propertyTitleHtml(r)}</td>
    <td class="col-name">${escapeHtml(r.firstName)}</td>
    <td class="col-name">${escapeHtml(r.lastName)}</td>
    <td class="col-contact">${escapeHtml(r.phone)}</td>
    <td class="col-contact">${escapeHtml(r.email)}</td>
    <td class="col-address">${escapeHtml(propertyStreetLine(r))}</td>
    <td class="reason-cell">${escapeHtml(buildOneLineSummary(r))}</td>
  `;
  wireBulkCheckbox(tr, key);
  wireScoreEditClick(tr.querySelector('.score-badge'), r);
  return tr;
}

R.syncPropCardSelection = function syncPropCardSelection(card, r, rankMap) {
  const key = recordKey(r);
  card.className = `prop-card card-cyber ${heatClassForRecord(r)}${computeNeedsReview(r) ? ' needs-review' : ''}${state.selectedKey === key ? ' selected' : ''}`;
  const addressEl = card.querySelector('.card-address');
  if (addressEl) addressEl.textContent = propertyStreetLine(r);
  const locationEl = card.querySelector('.card-location');
  if (locationEl) locationEl.innerHTML = propertyTitleHtml(r);
  const timestampEl = card.querySelector('.card-timestamp');
  if (timestampEl) timestampEl.textContent = formatLeadUploadedAt(r);
  const scoreEl = card.querySelector('.card-score-pill');
  if (scoreEl) scoreEl.textContent = scoreDisplayForRecord(r);
  const tierEl = card.querySelector('.card-badge-overlay');
  if (tierEl) {
    tierEl.className = `card-badge-overlay tier-badge ${tierBadgeClassForRecord(r)}`;
    tierEl.textContent = tierBadgeLabelForRecord(r);
  }
  const bulkOn = isBulkSelected(key);
  card.classList.toggle('bulk-selected', bulkOn);
  const cb = card.querySelector('.bulk-row-check');
  if (cb) cb.checked = bulkOn;
  wireCardThumb(card, r);
}

R.renderResultsIncremental = function renderResultsIncremental(sorted, rankMap) {
  const sortedKeys = new Set(sorted.map(r => recordKey(r)));
  const showCards = state.viewMode === 'cards';

  if (showCards) {
    const existingCards = new Map(
      [...cardsGrid.querySelectorAll('.prop-card[data-key]')].map(el => [el.dataset.key, el])
    );
    const cardFrag = document.createDocumentFragment();
    for (const r of sorted) {
      const key = recordKey(r);
      let card = existingCards.get(key);
      if (card) {
        syncPropCardSelection(card, r, rankMap);
      } else {
        card = buildPropCard(r, rankMap);
      }
      cardFrag.appendChild(card);
    }
    cardsGrid.replaceChildren(cardFrag);
    for (const [key, card] of existingCards) {
      if (!sortedKeys.has(key)) card.remove();
    }
  } else {
    const existingRows = new Map(
      [...resultsBody.querySelectorAll('tr[data-key]')].map(el => [el.dataset.key, el])
    );
    const tableFrag = document.createDocumentFragment();
    for (const r of sorted) {
      const key = recordKey(r);
      let row = existingRows.get(key);
      if (row) {
        const tier = resultLeadTier(r);
        row.className = state.selectedKey === key ? 'row-selected' : '';
        const uploadedCell = row.querySelector('.col-uploaded .lead-uploaded-val');
        if (uploadedCell) {
          uploadedCell.textContent = formatLeadUploadedAt(r);
          uploadedCell.setAttribute('datetime', leadUploadedIso(r));
        }
        const scoreBadge = row.querySelector('.score-badge');
        if (scoreBadge) {
          scoreBadge.className = `score-badge ${scoreClassForRecord(r)}`;
          scoreBadge.textContent = scoreDisplayForRecord(r);
        }
        const tierBadge = row.querySelector('.tier-badge');
        if (tierBadge) {
          tierBadge.className = `tier-badge ${tierBadgeClassForRecord(r)}`;
          tierBadge.textContent = tierBadgeLabelForRecord(r);
        }
        const catBadge = row.querySelector('.category-badge');
        if (catBadge) {
          catBadge.className = `category-badge ${categoryBadgeClass(cat)}`;
          catBadge.textContent = categoryLabel(cat);
        }
        const bulkOn = isBulkSelected(key);
        row.classList.toggle('bulk-selected', bulkOn);
        row.classList.toggle('row-selected', state.selectedKey === key);
        const cb = row.querySelector('.bulk-row-check');
        if (cb) cb.checked = bulkOn;
      } else {
        row = buildResultRow(r);
      }
      tableFrag.appendChild(row);
    }
    resultsBody.replaceChildren(tableFrag);
    for (const [key, row] of existingRows) {
      if (!sortedKeys.has(key)) row.remove();
    }
  }
  updateBulkEditUi();
}

R.INITIAL_RENDER_CHUNK = 32;
R.RENDER_CHUNK_SIZE = 48;

R.renderResultsProgressive = async function renderResultsProgressive() {
  if (state.running) {
    renderResultsInner();
    return;
  }
  const sorted = getFilteredResults();
  const total = state.results.length;
  if (state.viewMode === 'cards' && total > VIRTUAL_SCROLL_THRESHOLD) {
    renderVirtualCards();
    resultsUiRendered = true;
    return;
  }
  const cap = getDisplayCap();
  const toRender = sorted.slice(0, cap);
  if (!total || !sorted.length || state.viewMode !== 'cards' || toRender.length <= 48) {
    renderResultsInner();
    return;
  }

  const rankMap = buildDistressedRankMap();
  updateSummaryStats({ full: true });
  updateExportButtons();
  resetThumbLoadQueue();
  cardsGrid.replaceChildren();

  let shown = 0;
  while (shown < toRender.length) {
    const chunkSize = shown === 0 ? INITIAL_RENDER_CHUNK : RENDER_CHUNK_SIZE;
    const frag = document.createDocumentFragment();
    const end = Math.min(shown + chunkSize, toRender.length);
    for (let i = shown; i < end; i++) {
      frag.appendChild(buildPropCard(toRender[i], rankMap));
    }
    cardsGrid.appendChild(frag);
    shown = end;
    $('resultCount').textContent = shown < toRender.length
      ? `· Loading ${shown.toLocaleString()} of ${toRender.length.toLocaleString()}…`
      : `· ${toRender.length.toLocaleString()} shown${sorted.length !== total ? ` (${sorted.length.toLocaleString()} filtered)` : ''}`;
    if (shown < toRender.length) await yieldToMain();
  }
  updateLoadMoreBar(sorted.length, toRender.length);
  updateBulkEditUi();
  resultsUiRendered = true;
}

R.renderResultsInner = function renderResultsInner() {
  const sorted = getFilteredResults();
  const total = getTotalScannedCount();
  const loaded = state.results.length;
  const cap = getDisplayCap();
  const toRender = sorted.slice(0, cap);

  $('resultCount').textContent = total
    ? (toRender.length < sorted.length
      ? `· ${toRender.length.toLocaleString()} shown of ${sorted.length.toLocaleString()}${sorted.length !== total ? ` (${total.toLocaleString()} total)` : ''}`
      : (loaded < total && state.filter === 'all' && !state.searchQuery.trim()
        ? `· ${sorted.length.toLocaleString()} loaded · ${total.toLocaleString()} scanned`
        : `· ${sorted.length.toLocaleString()}${sorted.length !== total ? ` of ${total.toLocaleString()}` : ''} properties`))
    : '';
  updateScannedCountUi?.();

  if (!total) {
    if (virtualScroll.initialized && cardsVirtualWindow) {
      cardsVirtualWindow.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">◎</div>Results appear here — newest uploads at the top</div>';
      updateVirtualSpacerHeight(0);
    } else {
      cardsGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">◎</div>Results appear here — newest uploads at the top</div>';
    }
    resultsBody.innerHTML = '<tr><td colspan="13" class="empty-state">No results yet</td></tr>';
    updateLoadMoreBar(0, 0);
    updateSummaryStats();
    return;
  }

  if (!sorted.length) {
    if (virtualScroll.initialized && cardsVirtualWindow) {
      cardsVirtualWindow.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No properties match this filter</div>';
      updateVirtualSpacerHeight(0);
    } else {
      cardsGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No properties match this filter</div>';
    }
    resultsBody.innerHTML = '<tr><td colspan="13" class="empty-state">No properties match this filter</td></tr>';
    updateLoadMoreBar(0, 0);
    return;
  }

  const rankMap = buildDistressedRankMap();
  cardsGrid?.classList.toggle('no-card-anim', toRender.length > 24);

  if (state.running) {
    resetThumbLoadQueue();
    renderResultsIncremental(toRender, rankMap);
  } else if (state.viewMode === 'cards' && sorted.length > VIRTUAL_SCROLL_THRESHOLD) {
    renderVirtualCards();
    if (resultsLoadMore) resultsLoadMore.hidden = true;
  } else if (state.viewMode === 'cards') {
    resetVirtualScrollDom();
    resetThumbLoadQueue();
    const cardFrag = document.createDocumentFragment();
    for (const r of toRender) cardFrag.appendChild(buildPropCard(r, rankMap));
    cardsGrid.replaceChildren(cardFrag);
    updateLoadMoreBar(sorted.length, toRender.length);
  } else {
    const tableFrag = document.createDocumentFragment();
    for (const r of toRender) tableFrag.appendChild(buildResultRow(r));
    resultsBody.replaceChildren(tableFrag);
    updateLoadMoreBar(sorted.length, toRender.length);
  }

  updateSummaryStats({ full: true });
  updateExportButtons();
  resultsUiRendered = true;
}

R.escapeHtml = function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

R.updateProgress = function updateProgress() {
  const write = () => {
    const total = state.records.length;
    const pct = total ? (state.processed / total) * 100 : 0;
    progressBar.style.width = `${pct}%`;
    const hudInstant = { instant: true };
    animateStatNumber($('progressPct'), Math.round(pct), { ...hudInstant, suffix: '%' });
    const remaining = Math.max(0, total - state.processed);
    animateStatNumber($('statDone'), state.processed, hudInstant);
    animateStatNumber($('statRemaining'), remaining, hudInstant);
    $('statTotal').textContent = total.toLocaleString();
    $('statSuccess').textContent = state.succeeded.toLocaleString();
    $('statSkipped').textContent = state.skipped.toLocaleString();
    updateLiveScanDock();
    updateCommandBar();
  };
  if (state.running) preservePageScroll(write);
  else write();
}

R.setHudStatus = function setHudStatus(text, active = false) {
  const labels = { STANDBY: 'System Online', SCANNING: 'Scanning', ACTIVE: 'System Online', Ready: 'System Online' };
  if (!hudStatus) return;
  const scanning = active || text === 'SCANNING';
  hudStatus.textContent = labels[text] || text;
  hudStatus.style.color = scanning ? 'var(--neon-cyan)' : '';
  const dot = $('commandStatusDot');
  if (dot) {
    dot.classList.toggle('scanning', scanning);
    dot.classList.toggle('offline', !scanning && !state.results.length && !state.running);
  }
};

R.showPreview = function showPreview(address, status, streetViewUrl = null, satelliteUrl = null, score = null, animateGauge = true) {
  state.scanLiveSnapshot = { address, status, streetViewUrl, satelliteUrl, score, animateGauge };
  updateLiveScanDock();
  if (!state.running) return;
  const isActive = !!(status && !/complete|stopped|done|failed/i.test(status));
  setHudStatus(isActive ? 'SCANNING' : 'ACTIVE', isActive);
}

R.streetViewMetadata = function streetViewMetadata(address, apiKey) {
  return new Promise((resolve, reject) => {
    const cb = 'svMeta_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const cleanup = () => {
      delete window[cb];
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Street View metadata timed out'));
    }, 15000);

    window[cb] = (data) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('Street View metadata blocked — check API key & enable Street View Static API'));
    };

    script.src = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}&callback=${cb}`;
    document.head.appendChild(script);
  });
}

R.checkStreetViewAvailable = async function checkStreetViewAvailable(address, apiKey) {
  const data = await streetViewMetadata(address, apiKey);
  if (data.status === 'OK') return data;

  const msg = data.error_message || data.status || 'Unknown error';
  if (data.status === 'ZERO_RESULTS') {
    throw new Error('No Street View imagery at this address');
  }
  if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
    throw new Error(`Street View API: ${msg}`);
  }
  throw new Error(`Street View: ${msg}`);
}

R.getStreetViewUrl = function getStreetViewUrl(address, apiKey, size = STREET_VIEW_SIZE) {
  const key = normalizeApiKey(apiKey);
  if (!address) return '';
  if (USE_PROXY && !key && !serverHasMapsKey) return '';
  if (!USE_PROXY && !key) return '';
  if (USE_PROXY) {
    const q = new URLSearchParams({ address, size });
    appendMapsKeyParam(q, apiKey);
    return resolveImageryPublicUrl(`/api/sv-image?${q.toString()}`);
  }
  return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}&return_error_code=true`;
}

R.getSatelliteUrl = function getSatelliteUrl(address, apiKey, size = null) {
  const key = normalizeApiKey(apiKey);
  if (!address) return '';
  if (USE_PROXY && !key && !serverHasMapsKey) return '';
  if (!USE_PROXY && !key) return '';
  if (USE_PROXY) {
    const q = new URLSearchParams({ address });
    appendMapsKeyParam(q, apiKey);
    if (size) q.set('size', size);
    return resolveImageryPublicUrl(`/api/satellite-image?${q.toString()}`);
  }
  return '';
}

R.proxyFetchUrl = function proxyFetchUrl(path, params, apiKey) {
  const q = new URLSearchParams(params);
  appendMapsKeyParam(q, apiKey);
  return `${path}?${q.toString()}`;
}

R.fetchSatelliteBase64 = async function fetchSatelliteBase64(address, apiKey) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  const res = await fetch(proxyFetchUrl('/api/satellite-base64', { address }, apiKey));
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Satellite failed');
  return {
    base64: data.base64,
    mimeType: data.mimeType || 'image/png',
    geocoded: data.geocoded || null
  };
}

R.fetchPropertyImagery = async function fetchPropertyImagery(address, apiKey) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  let res;
  try {
    res = await fetch(proxyFetchUrl('/api/property-imagery', { address }, apiKey));
  } catch (e) {
    const detail = String(e?.message || e || 'network error').trim();
    throw new Error(`Imagery request failed (${detail}). If this keeps happening, check that launch-analyzer.bat is still running.`);
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Imagery failed');
  return data;
}

R.fetchStreetViewImagery = async function fetchStreetViewImagery(address, apiKey) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  let res;
  try {
    res = await fetch(proxyFetchUrl('/api/sv-base64', { address }, apiKey));
  } catch (e) {
    const detail = String(e?.message || e || 'network error').trim();
    throw new Error(`Street View request failed (${detail}). If this keeps happening, check that launch-analyzer.bat is still running.`);
  }
  return res.json();
}

R.fetchSatelliteImagery = async function fetchSatelliteImagery(address, apiKey) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  let res;
  try {
    res = await fetch(proxyFetchUrl('/api/satellite-base64', { address }, apiKey));
  } catch (e) {
    const detail = String(e?.message || e || 'network error').trim();
    throw new Error(`Satellite request failed (${detail}). If this keeps happening, check that launch-analyzer.bat is still running.`);
  }
  return res.json();
}

R.fetchStreetViewBase64 = async function fetchStreetViewBase64(address, apiKey) {
  if (USE_PROXY) {
    const data = await fetchStreetViewImagery(address, apiKey);
    if (!data.ok) throw new Error(data.error || 'Street View failed');
    return {
      base64: data.base64,
      mimeType: data.mimeType || 'image/jpeg',
      view: data.view ? { ...data.view, qualityFlags: data.view.qualityFlags || [] } : null
    };
  }
  const imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=${STREET_VIEW_SIZE}&location=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}&return_error_code=true`;
  await verifyImageLoads(imageUrl);
  throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456) — direct HTML mode cannot fetch images');
}

R.showFatalError = function showFatalError(msg) {
  errorBanner.innerHTML = `<strong>⚠ Fix this to stop skips</strong>${escapeHtml(msg)}`;
  errorBanner.classList.add('visible');
  if (!state.haltAlertShown) {
    notifyScanIssue('fatal', msg, { title: 'Action required', dedupeKey: `fatal-banner-${String(msg).slice(0, 40)}` });
  }
}

R.flagError = function flagError(err) {
  if (!firstErrorShown) {
    firstErrorShown = true;
    const m = err.message || String(err);
    if (m.includes('REQUEST_DENIED') || m.includes('API key') || m.includes('403')) {
      showFatalError('Street View API key rejected. Enable Street View Static API + billing in Google Cloud. Set key restrictions to None for testing.');
    } else if (m.includes('Gemini')) {
      showFatalError('Gemini API error. Check your Gemini key at aistudio.google.com/apikey — use a separate key from Street View.');
    }
  }
}

R.verifyImageLoads = async function verifyImageLoads(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('Street View timed out')), 20000);
    img.onload = () => { clearTimeout(timer); resolve(); };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('No Street View photo for this address'));
    };
    img.src = imageUrl;
  });
}

R.sleep = async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

R.callGeminiVision = async function callGeminiVision(base64, mimeType, apiKey, prompt, maxOutputTokens = 1024, images = null, meta = {}) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  if (!serverConfig.hasGeminiKey) throw new Error('GEMINI_API_KEY not configured in .env');
  const payload = {
    prompt,
    maxOutputTokens,
    address: meta.address || null,
    scanType: meta.scanType || null
  };
  if (Array.isArray(images) && images.length) {
    payload.images = images.map(img => ({
      base64: img.base64,
      mimeType: img.mimeType || 'image/jpeg'
    }));
  } else if (base64) {
    payload.base64 = base64;
    payload.mimeType = mimeType;
  }
  const res = await apiFetch('/api/gemini-vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Gemini vision failed');
  return data.text;
}

  }
  PDA.render = {
    get initVirtualScroll() { return R.initVirtualScroll; },
    get renderResultsProgressive() { return R.renderResultsProgressive; },
    get renderResults() { return R.renderResults; },
    get renderVirtualCards() { return R.renderVirtualCards; },
    get updateSummaryStats() { return R.updateSummaryStats; },
    get updateCommandBar() { return R.updateCommandBar; },
    get setFilter() { return R.setFilter; },
    get openPropertyModal() { return R.openPropertyModal; },
    get closePropertyModal() { return R.closePropertyModal; },
    get exportResults() { return R.exportResults; },
    get getFilteredResults() { return R.getFilteredResults; },
    get updateSummaryPipeline() { return R.updateSummaryPipeline; },
    get showInspector() { return R.showInspector; },
    get escapeHtml() { return R.escapeHtml; }
  };
})(window);
