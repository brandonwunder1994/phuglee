// review.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  if (typeof window !== 'undefined') window.PDA = PDA;
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {

R.qualifiesLowDistressSignals = function qualifiesLowDistressSignals(score, indicators, satelliteResult = null, reason = '') {
  const s = Math.round(Number(score)) || 0;
  if (s <= 0 || s > WELL_MAINTAINED_MAX_SCORE) return false;
  if (hasHardDistressIndicators(indicators)) return false;

  const inds = normalizeIndicators(indicators);
  if (inds.some(i => MODERATE_INDICATORS.has(i))) return false;

  const { roof, yard, aerial } = satelliteYardRoofPair(satelliteResult);
  if (roof === 'poor' || yard === 'poor') return true;
  if ((roof === 'fair' || yard === 'fair') && aerial != null && aerial >= DISTRESSED_MIN_SCORE) return true;
  if (aerial != null && aerial >= 8) return true;

  return false;
}

R.qualifiesWellMaintainedSignals = function qualifiesWellMaintainedSignals(score, indicators, satelliteResult = null, reason = '') {
  return !looksVisuallyDistressed(score, indicators, satelliteResult, reason);
}

R.severeDistressProfile = function severeDistressProfile(score, indicators, satelliteResult = null, reason = '') {
  return looksVisuallyDistressed(score, indicators, satelliteResult, reason);
}

R.indsHaveOvergrowth = function indsHaveOvergrowth(indicators) {
  return normalizeIndicators(indicators).includes('overgrown_landscaping');
}

R.qualifiesWellMaintainedRecord = function qualifiesWellMaintainedRecord(r) {
  if (!r || r.manualScore || r.manualOverride) return false;
  if (resultCategory(r) !== 'property') return false;
  if (computeNeedsReview(r)) return false;
  return qualifiesWellMaintainedSignals(
    r.score,
    r.indicators,
    r.satelliteClassification,
    combinedTierReason(r)
  );
}

R.shouldPromoteLowDistressToWellMaintained = function shouldPromoteLowDistressToWellMaintained(r) {
  if (!qualifiesWellMaintainedRecord(r)) return false;
  return resultLeadTier(r) === 'distressed';
}

R.migrateLightTierToDistressed = function migrateLightTierToDistressed(results) {
  return results.map(r => {
    const tier = String(r.leadTier || '').toLowerCase().replace(/-/g, '_');
    if (tier !== 'light') return r;
    const migrated = { ...r, leadTier: 'distressed' };
    migrated.tierRationale = buildTierRationale(migrated);
    return migrated;
  });
}

R.promoteRecordToWellMaintained = function promoteRecordToWellMaintained(r) {
  const baseReason = stripTierMigrationReasonSuffix(r.reason)
    .replace(/ Re-scanned[^.]*\./g, '')
    .trim();
  const promoted = {
    ...r,
    score: 1,
    leadTier: 'well_maintained',
    tierLocked: true,
    autoWellMaintained: true,
    reason: baseReason
      ? `${baseReason} Re-tiered to Well Maintained — manicured home, no visible distress.`
      : 'Re-tiered to Well Maintained — manicured home, no visible distress.'
  };
  promoted.tierRationale = buildTierRationale(promoted);
  return promoted;
}

R.reconcileAllPropertyTiers = function reconcileAllPropertyTiers() {
  let changed = 0;
  state.results = state.results.map(r => {
    if (r.manualScore || r.manualOverride) return r;
    if (resultCategory(r) !== 'property') return r;
    const before = normalizeLeadTier(r.leadTier);
    const updated = attachTierRationale({ ...r });
    const after = normalizeLeadTier(updated.leadTier);
    if (before !== after) changed++;
    return updated;
  });
  return changed;
}

R.isTierLocked = function isTierLocked(r) {
  return !!(r?.tierLocked || r?.manualScore || r?.manualOverride || r?.autoWellMaintained);
}

R.migrateLowDistressToWellMaintained = function migrateLowDistressToWellMaintained() {
  let moved = 0;
  state.results = state.results.map(r => {
    if (!shouldPromoteLowDistressToWellMaintained(r)) return r;
    moved++;
    return promoteRecordToWellMaintained(r);
  });
  if (moved) {
    saveSession();
    renderResults({ force: true });
    updateSummaryStats();
    log(`Moved ${moved.toLocaleString()} manicured home${moved === 1 ? '' : 's'} from Distressed → ✨ Well Maintained`, 'success');
  }
  return moved;
}

R.shouldDemoteWellMaintainedRecord = function shouldDemoteWellMaintainedRecord(r) {
  if (!r || r.manualScore || r.manualOverride) return false;
  if (resultCategory(r) !== 'property') return false;
  if (resultLeadTier(r) !== 'well_maintained') return false;
  return looksVisuallyDistressed(
    r.score,
    r.indicators,
    r.satelliteClassification,
    combinedTierReason(r)
  );
}

R.restoredScoreAfterWellMaintainedDemotion = function restoredScoreAfterWellMaintainedDemotion(r) {
  const ai = typeof r.aiScore === 'number' ? Math.round(r.aiScore) : null;
  if (ai != null && ai >= DISTRESSED_MIN_SCORE) return ai;
  return DISTRESSED_MIN_SCORE;
}

R.demoteRecordFromWellMaintained = function demoteRecordFromWellMaintained(r) {
  const baseReason = stripTierMigrationReasonSuffix(r.reason);
  const demoted = {
    ...r,
    score: restoredScoreAfterWellMaintainedDemotion(r),
    leadTier: 'distressed'
  };
  delete demoted.autoWellMaintained;
  delete demoted.tierLocked;
  demoted.reason = baseReason
    ? `${baseReason} Moved to Distressed — does not meet manicured/green-lawn Well Maintained bar.`
    : 'Moved to Distressed — does not meet manicured/green-lawn Well Maintained bar.';
  demoted.tierRationale = buildTierRationale(demoted);
  return demoted;
}

R.demoteFalseWellMaintainedToLight = function demoteFalseWellMaintainedToLight() {
  let moved = 0;
  state.results = state.results.map(r => {
    if (!shouldDemoteWellMaintainedRecord(r)) return r;
    moved++;
    return demoteRecordFromWellMaintained(r);
  });
  if (moved) {
    saveSession();
    renderResults({ force: true });
    updateSummaryStats();
    log(`Moved ${moved.toLocaleString()} home${moved === 1 ? '' : 's'} from ✨ Well Maintained → Distressed`, 'success');
  }
  return moved;
}

R.addressMatchesQuery = function addressMatchesQuery(address, query) {
  const addr = String(address || '').toLowerCase();
  const q = String(query || '').toLowerCase().trim();
  if (!q) return false;
  if (addr.includes(q)) return true;
  const tokens = q.split(/[\s,]+/).filter(t => t.length > 2);
  return tokens.length > 0 && tokens.every(t => addr.includes(t));
}

R.reconcileLeadTier = function reconcileLeadTier(record) {
  if (!record) return record;
  const cat = resultCategory(record);
  if (cat === 'vacant_lot') {
    record.leadTier = 'vacant';
    return record;
  }
  if (cat === 'blurred') {
    record.leadTier = 'blurred';
    return record;
  }
  if (cat === 'unavailable') {
    record.leadTier = 'unavailable';
    return record;
  }
  if (record.manualScore && record.leadTier) {
    record.leadTier = normalizeLeadTier(record.leadTier);
    record.score = clampScoreForTier(record.score, record.leadTier);
    return record;
  }
  if (shouldDemoteWellMaintainedRecord(record)) {
    return demoteRecordFromWellMaintained(record);
  }
  if (!isTierLocked(record)) {
    record = applyLearnedTierRules(record);
  }
  if (isTierLocked(record) && record.leadTier) {
    record.leadTier = normalizeLeadTier(record.leadTier);
    record.score = clampScoreForTier(record.score, record.leadTier);
    return record;
  }
  const ctx = leadTierContextFromRecord(record);
  let tier = computeLeadTier(resultScore(record), cat, {
    ...ctx,
    reason: combinedTierReason(record)
  });
  if (tier === 'well_maintained' || tier === 'distressed') record.score = clampScoreForTier(record.score, tier);
  record.leadTier = tier;
  return record;
}

R.leadTierLabel = function leadTierLabel(tier) {
  const normalized = normalizeLeadTier(tier);
  const meta = TIER_META[normalized];
  if (meta) {
    if (normalized === 'distressed') return meta.label;
    return meta.emoji ? `${meta.emoji} ${meta.label}` : meta.label;
  }
  if (normalized === 'vacant') return '🏜️ Vacant Lot';
  if (normalized === 'blurred') return '⛔ Blocked Image';
  if (normalized === 'well_maintained') return '✨ Well Maintained';
  return 'Unavailable';
}

R.formatIndicatorsHtml = function formatIndicatorsHtml(indicators, max = 4) {
  const list = normalizeIndicators(indicators);
  if (!list.length) return '';
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  let html = '<div class="indicator-tags">';
  for (const key of shown) {
    const cls = HIGH_INDICATORS.has(key) ? 'indicator-tag high' : 'indicator-tag';
    html += `<span class="${cls}">${escapeHtml(INDICATOR_LABELS[key] || key.replace(/_/g, ' '))}</span>`;
  }
  if (extra > 0) html += `<span class="indicator-tag">+${extra} more</span>`;
  html += '</div>';
  return html;
}

R.heatClass = function heatClass(score, category, tier = null) {
  if (category === 'vacant_lot') return 'heat-vacant';
  if (category === 'blurred') return 'heat-blurred';
  if (category === 'unavailable') return 'heat-low';
  if (tier === 'well_maintained') return 'heat-well-maintained';
  if (tier === 'distressed' || score >= DISTRESSED_MIN_SCORE) return 'heat-distressed';
  return 'heat-low';
}

R.heatClassForRecord = function heatClassForRecord(r) {
  return heatClass(r.score, resultCategory(r), resultLeadTier(r));
}

R.scoreClassForRecord = function scoreClassForRecord(r) {
  const cat = resultCategory(r);
  const tier = resultLeadTier(r);
  if (cat === 'vacant_lot') return 'score-vacant';
  if (cat === 'blurred') return 'score-blurred';
  if (cat === 'unavailable') return 'score-moderate';
  if (tier === 'well_maintained') return 'score-well-maintained';
  if (tier === 'distressed' || r.score >= DISTRESSED_MIN_SCORE) return 'score-distressed';
  return 'score-low';
}

R.scoreDisplayForRecord = function scoreDisplayForRecord(r) {
  const cat = resultCategory(r);
  if (cat === 'vacant_lot') return '🏜️';
  if (cat === 'blurred') return '⛔';
  if (cat === 'unavailable') return '—';
  return tierEmoji(resultLeadTier(r));
}

R.TIER_SORT = { distressed: 0, well_maintained: 1, vacant: 2, unavailable: 3 };

R.PROPERTY_TIERS = ['distressed', 'well_maintained'];

R.FILTER_LABELS = {
  all: 'All',
  distressed: 'Distressed',
  well_maintained: 'Well Maintained',
  vacant: 'Vacant Lot/Land',
  blurred: 'Blocked Image',
  review: 'Needs Review'
};

R.REVIEW_FILTER_LABELS = {
  distressed: 'Distressed',
  well_maintained: 'Well Maintained',
  vacant: 'Land',
  review: 'Manual Review'
};

R.LEAD_TYPES = [
  { id: 'code_violation', label: 'Code Violation' },
  { id: 'pre_foreclosure', label: 'Pre-Foreclosure' },
  { id: 'probate', label: 'Probate' },
  { id: 'tax_lien', label: 'Tax Lien' },
  { id: 'water_shut_off', label: 'Water Shut Off' }
];

R.DEFAULT_LEAD_TYPE = 'code_violation';

R.LEAD_TYPE_ALIASES = {
  code_violation: 'code_violation',
  codeviolation: 'code_violation',
  'code violation': 'code_violation',
  pre_foreclosure: 'pre_foreclosure',
  preforeclosure: 'pre_foreclosure',
  'pre foreclosure': 'pre_foreclosure',
  'pre-foreclosure': 'pre_foreclosure',
  probate: 'probate',
  tax_lien: 'tax_lien',
  taxlien: 'tax_lien',
  'tax lien': 'tax_lien',
  water_shut_off: 'water_shut_off',
  watershutoff: 'water_shut_off',
  'water shut off': 'water_shut_off',
  'water shut-off': 'water_shut_off'
};

R.normalizeLeadType = function normalizeLeadType(value, fallback = DEFAULT_LEAD_TYPE) {
  if (!value) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (LEAD_TYPE_ALIASES[raw]) return LEAD_TYPE_ALIASES[raw];
  const slug = raw.replace(/[\s-]+/g, '_');
  if (LEAD_TYPE_ALIASES[slug]) return LEAD_TYPE_ALIASES[slug];
  if (LEAD_TYPES.some(t => t.id === slug)) return slug;
  const byLabel = LEAD_TYPES.find(t => t.label.toLowerCase() === raw);
  return byLabel ? byLabel.id : fallback;
}

R.leadTypeLabel = function leadTypeLabel(id) {
  return LEAD_TYPES.find(t => t.id === id)?.label || String(id || '').replace(/_/g, ' ');
}

R.resultLeadType = function resultLeadType(r) {
  return normalizeLeadType(r?.leadType);
}

R.leadTypeBadgeHtml = function leadTypeBadgeHtml(r) {
  const label = leadTypeLabel(resultLeadType(r));
  return `<span class="lead-type-badge" title="Lead source type">${escapeHtml(label)}</span>`;
}

R.initLeadTypeSelects = function initLeadTypeSelects() {
  const typeOptions = LEAD_TYPES.map(t => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join('');
  const importLeadTypeSelect = $('importLeadTypeSelect');
  const leadTypeFilter = $('leadTypeFilter');
  if (importLeadTypeSelect) {
    importLeadTypeSelect.innerHTML = typeOptions;
    importLeadTypeSelect.value = normalizeLeadType(state.importLeadType);
  }
  if (leadTypeFilter) {
    leadTypeFilter.innerHTML = `<option value="all">All lead types</option>${typeOptions}`;
    leadTypeFilter.value = state.leadTypeFilter || 'all';
  }
}

R.TIER_META = {
  distressed: { label: 'Distressed', emoji: '⚠️', defaultScore: DISTRESSED_MIN_SCORE },
  well_maintained: { label: 'Well Maintained', emoji: '✨', defaultScore: 1 }
};

R.clampScoreForTier = function clampScoreForTier(score, tier, indicators = null, reason = '') {
  const s = Math.round(Number(score)) || 0;
  const normalized = normalizeLeadTier(tier);
  if (normalized === 'well_maintained') {
    return Math.min(Math.max(s, 1), WELL_MAINTAINED_MAX_SCORE);
  }
  if (normalized === 'distressed') {
    const inds = normalizeIndicators(indicators);
    let floor = DISTRESSED_MIN_SCORE;
    if (inds.some(i => HIGH_INDICATORS.has(i) || inds.includes('boarded_windows') || inds.includes('boarded_doors'))) floor = 8;
    else if (inds.includes('roof_damage_or_tarp') && /tarp|missing shingles|collapsed|sagging/i.test(reason)) floor = 8;
    else if (inds.includes('junk_or_hoarding_yard') && inds.includes('abandoned_vehicles')) floor = 7;
    else if (hasModerateWithSupportingNeglect(inds, reason)) floor = Math.max(floor, 6);
    else if (hasNeglectCombo(inds, reason)) floor = Math.max(floor, 6);
    else if (looksVisuallyDistressed(s, inds, null, reason)) floor = Math.max(floor, 6);
    return Math.max(s, floor);
  }
  return s;
}

R.tierEmoji = function tierEmoji(tier) {
  return TIER_META[tier]?.emoji || '—';
}

R.tierFromScore = function tierFromScore(score, category = 'property') {
  return computeLeadTier(score, category);
}

R.scoreForTier = function scoreForTier(tier) {
  return TIER_META[tier]?.defaultScore ?? 2;
}

R.buildTierPickerHtml = function buildTierPickerHtml(selectedTier, idPrefix = 'tierPick') {
  return PROPERTY_TIERS.map(tier => {
    const meta = TIER_META[tier];
    const active = tier === selectedTier ? ' active' : '';
    return `<button type="button" class="tier-pick-btn${active}" data-tier="${tier}" id="${idPrefix}_${tier}">
      <span class="tier-pick-emoji">${meta.emoji}</span>
      <span class="tier-pick-lbl">${meta.label}</span>
    </button>`;
  }).join('');
}

R.wireTierPicker = function wireTierPicker(container, onSelect) {
  if (!container) return;
  container.querySelectorAll('.tier-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tier-pick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(btn.dataset.tier);
    });
  });
}

R.matchesSearch = function matchesSearch(r, q) {
  if (!q) return true;
  const hay = [
    r.firstName, r.lastName, r.address, r.phone, r.email,
    r.street, r.city, r.state, r.postal, r.reason,
    leadTierLabel(resultLeadTier(r)), categoryLabel(resultCategory(r)),
    leadTypeLabel(resultLeadType(r)),
    ...leadTags(r),
    formatExportedAt(r)
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

R.resultAnalyzedAt = function resultAnalyzedAt(r) {
  return typeof r.analyzedAt === 'number' ? r.analyzedAt : 0;
}

R.formatLeadUploadedAt = function formatLeadUploadedAt(r) {
  const ts = resultAnalyzedAt(r);
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

R.leadUploadedIso = function leadUploadedIso(r) {
  const ts = resultAnalyzedAt(r);
  return ts ? new Date(ts).toISOString() : '';
}

R.leadUploadedHtml = function leadUploadedHtml(r, variant = 'card') {
  const formatted = formatLeadUploadedAt(r);
  const iso = leadUploadedIso(r);
  if (variant === 'table') {
    return `<span class="lead-uploaded-val">${escapeHtml(formatted)}</span>`;
  }
  const detailClass = variant === 'detail' ? ' lead-uploaded-at--detail' : '';
  return `<div class="lead-uploaded-at${detailClass}">
    <span class="lead-uploaded-icon" aria-hidden="true">⏱</span>
    <div class="lead-uploaded-text">
      <span class="lead-uploaded-lbl-text">Uploaded</span>
      <time class="lead-uploaded-val" datetime="${iso}">${escapeHtml(formatted)}</time>
    </div>
  </div>`;
}

R.leadTags = function leadTags(r) {
  return Array.isArray(r?.tags) ? r.tags.filter(Boolean) : [];
}

R.isLeadExported = function isLeadExported(r) {
  return leadTags(r).includes('exported') || !!r?.exportedAt;
}

R.formatExportedAt = function formatExportedAt(r) {
  const raw = r?.exportedAt;
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

R.exportedIso = function exportedIso(r) {
  const raw = r?.exportedAt;
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

R.exportedBadgeHtml = function exportedBadgeHtml(r) {
  if (!isLeadExported(r)) return '';
  const formatted = formatExportedAt(r);
  const iso = exportedIso(r);
  return `<span class="exported-badge" title="Exported ${escapeHtml(formatted)}">Exported${iso ? `<time datetime="${iso}"> · ${escapeHtml(formatted)}</time>` : ''}</span>`;
}

R.markLeadExported = function markLeadExported(r, exportedAt = new Date().toISOString()) {
  const tags = leadTags(r);
  if (!tags.includes('exported')) tags.push('exported');
  return { ...r, tags, exportedAt };
}

R.markLeadsExported = function markLeadsExported(records, exportedAt = new Date().toISOString()) {
  if (!records?.length) return 0;
  const keySet = new Set(records.map((r) => recordKey(r)));
  let changed = 0;
  for (let i = 0; i < state.results.length; i++) {
    if (!keySet.has(recordKey(state.results[i]))) continue;
    state.results[i] = markLeadExported(state.results[i], exportedAt);
    changed++;
  }
  if (changed) {
    filteredResultsCache = null;
    filteredResultsCacheKey = null;
    if (typeof notifyResultMutation === 'function') notifyResultMutation();
  }
  return changed;
}

R.sortResults = function sortResults(list) {
  return [...list].sort((a, b) => {
    const dt = resultAnalyzedAt(b) - resultAnalyzedAt(a);
    if (dt !== 0) return dt;
    return recordKey(b).localeCompare(recordKey(a));
  });
}

R.resultMatchesLeadTypeFilter = function resultMatchesLeadTypeFilter(r) {
  if (!state.leadTypeFilter || state.leadTypeFilter === 'all') return true;
  return resultLeadType(r) === state.leadTypeFilter;
}

R.resultMatchesCurrentFilter = function resultMatchesCurrentFilter(r) {
  if (!resultMatchesLeadTypeFilter(r)) return false;
  if (state.filter === 'all') return true;
  if (state.filter === 'review') return computeNeedsReview(r);
  if (state.filter === 'vacant') return resultCategory(r) === 'vacant_lot';
  if (state.filter === 'blurred') return isBlurredImagery(r);
  if (state.filter === 'distressed') return resultLeadTier(r) === 'distressed';
  if (state.filter === 'light') return resultLeadTier(r) === 'distressed';
  if (state.filter === 'well_maintained') return resultLeadTier(r) === 'well_maintained';
  return true;
}

R.getAlertTierKey = function getAlertTierKey(r) {
  if (computeNeedsReview(r)) return 'review';
  const cat = resultCategory(r);
  if (cat === 'vacant_lot') return 'vacant';
  if (cat === 'blurred') return 'blurred';
  if (cat === 'unavailable') return 'unavailable';
  return resultLeadTier(r);
}

R.getAlertTierLabel = function getAlertTierLabel(r) {
  if (computeNeedsReview(r)) return '⚠️ Needs Review';
  const cat = resultCategory(r);
  if (cat === 'vacant_lot') return leadTierLabel('vacant');
  if (cat === 'unavailable') return 'Unavailable';
  return leadTierLabel(resultLeadTier(r));
}

R.tierKeyToFilter = function tierKeyToFilter(tierKey) {
  if (tierKey === 'vacant') return 'vacant';
  if (tierKey === 'review') return 'review';
  if (['distressed', 'well_maintained'].includes(tierKey)) return tierKey;
  if (tierKey === 'light') return 'distressed';
  return null;
}

R.clearLiveTierAlertStack = function clearLiveTierAlertStack() {
  if (!liveTierAlertStack) return;
  liveTierAlertStack.querySelectorAll('.live-tier-alert-card').forEach(card => {
    if (card._fadeTimer) clearTimeout(card._fadeTimer);
    if (card._removeTimer) clearTimeout(card._removeTimer);
  });
  liveTierAlertStack.innerHTML = '';
}

R.removeTierAlertCard = function removeTierAlertCard(card) {
  if (!card?.parentNode) return;
  if (card._fadeTimer) clearTimeout(card._fadeTimer);
  if (card._removeTimer) clearTimeout(card._removeTimer);
  card.remove();
}

R.pushLiveTierAlert = function pushLiveTierAlert(r) {
  if (!liveTierAlertStack || !state.running) return;
  const tierKey = getAlertTierKey(r);
  if (!tierKey) return;

  const tierLabel = getAlertTierLabel(r);
  const addr = propertyStreetLine(r);

  clearLiveTierAlertStack();

  const card = document.createElement('div');
  card.className = 'live-tier-alert-card';
  card.dataset.tier = tierKey;
  card.innerHTML = `<span class="live-tier-alert-addr">${escapeHtml(tierLabel)} · ${escapeHtml(addr)}</span>`;

  liveTierAlertStack.hidden = false;
  liveTierAlertStack.appendChild(card);

  pulseTierFilterButton(tierKey);

  card._fadeTimer = setTimeout(() => {
    card.classList.add('fade-out');
    card._removeTimer = setTimeout(() => {
      removeTierAlertCard(card);
      if (!liveTierAlertStack.children.length) liveTierAlertStack.hidden = true;
    }, 200);
  }, TIER_ALERT_LIFETIME_MS);
}

R.showScanStartedAlert = function showScanStartedAlert() {
  clearLiveTierAlertStack();
}

R.showLiveTierAlert = function showLiveTierAlert(r) {
  pushLiveTierAlert(r);
}

R.hideLiveTierAlert = function hideLiveTierAlert() {
  clearLiveTierAlertStack();
}

R.pulseFilterButton = function pulseFilterButton(filterKey) {
  if (!filterKey) return;
  const btn = document.querySelector(`.filter-btn[data-filter="${filterKey}"]`);
  if (!btn) return;
  btn.classList.remove('filter-just-hit');
  void btn.offsetWidth;
  btn.classList.add('filter-just-hit');
  setTimeout(() => btn.classList.remove('filter-just-hit'), 700);
}

R.pulseTierFilterButton = function pulseTierFilterButton(tierKey) {
  pulseFilterButton(tierKeyToFilter(tierKey));
}

R.pulseActiveFilterButton = function pulseActiveFilterButton() {
  if (state.running) return;
  pulseFilterButton(state.filter);
}

R.highlightNewResultCard = function highlightNewResultCard(r) {
  if (state.running) return;
  const key = recordKey(r);
  const sel = `[data-key="${CSS.escape(key)}"]`;
  const card = cardsGrid.querySelector(sel);
  const row = resultsBody.querySelector(sel);
  [card, row].forEach(el => {
    if (!el) return;
    el.classList.add('result-just-added');
    setTimeout(() => el.classList.remove('result-just-added'), 2000);
  });
}

R.uiThrottleTimer = null;
R.uiDirty = false;
R.pendingHighlightResults = [];
R.userScrollUntil = 0;
R.USER_SCROLL_GRACE_MS = 2000;

R.markUserScroll = function markUserScroll() {
  userScrollUntil = Date.now() + USER_SCROLL_GRACE_MS;
}

R.userIsScrolling = function userIsScrolling() {
  return Date.now() < userScrollUntil;
}

window.addEventListener('wheel', markUserScroll, { passive: true });
window.addEventListener('touchmove', markUserScroll, { passive: true });
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
    markUserScroll();
  }
}, { passive: true });

R.shouldLockScroll = function shouldLockScroll() {
  if (!state.running || userIsScrolling()) return false;
  if (state.appView === 'dashboard') return false;
  return state.appView === 'scan';
}

R.distressedRankMapCache = null;
R.distressedRankMapLen = -1;

R.buildDistressedRankMap = function buildDistressedRankMap() {
  const len = state.results.length;
  if (distressedRankMapCache && distressedRankMapLen === len) return distressedRankMapCache;
  const allSorted = [...state.results]
    .filter(r => resultLeadTier(r) === 'distressed')
    .sort((a, b) => b.score - a.score);
  distressedRankMapCache = new Map(allSorted.slice(0, 3).map((r, i) => [recordKey(r), i + 1]));
  distressedRankMapLen = len;
  return distressedRankMapCache;
}

R.invalidateDistressedRankMap = function invalidateDistressedRankMap() {
  distressedRankMapCache = null;
  distressedRankMapLen = -1;
}

R.updateResultCountLabel = function updateResultCountLabel() {
  const sorted = getFilteredResults();
  const total = getTotalScannedCount();
  const loaded = state.results.length;
  $('resultCount').textContent = total
    ? (loaded < total && state.filter === 'all' && !state.searchQuery.trim()
      ? `· ${sorted.length.toLocaleString()} loaded · ${total.toLocaleString()} scanned`
      : `· ${sorted.length.toLocaleString()}${sorted.length !== total ? ` of ${total.toLocaleString()}` : ''} properties`)
    : '';
  updateScannedCountUi?.();
}

R.trimExcessLiveCards = function trimExcessLiveCards(maxCards) {
  if (!cardsGrid) return;
  let cards = cardsGrid.querySelectorAll('.prop-card[data-key]');
  while (cards.length > maxCards) {
    cards[cards.length - 1]?.remove();
    cards = cardsGrid.querySelectorAll('.prop-card[data-key]');
  }
  let hint = cardsGrid.querySelector('.results-scan-cap-hint');
  if (state.results.length > maxCards) {
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'results-scan-cap-hint';
      cardsGrid.appendChild(hint);
    }
    hint.textContent = `Showing latest ${maxCards} during scan — full list loads when scan finishes`;
  } else if (hint) {
    hint.remove();
  }
}

R.appendScanResult = function appendScanResult(r) {
  if (!resultMatchesCurrentFilter(r)) {
    updateResultCountLabel();
    return;
  }
  const key = recordKey(r);
  const rankMap = buildDistressedRankMap();
  const showCards = state.viewMode === 'cards';

  if (showCards) {
    const emptyCard = cardsGrid.querySelector('.empty-state');
    if (emptyCard) emptyCard.remove();
    cardsGrid.querySelector('.results-scan-cap-hint')?.remove();
    if (!cardsGrid.querySelector(`.prop-card[data-key="${CSS.escape(key)}"]`)) {
      cardsGrid.prepend(buildPropCard(r, rankMap));
      trimExcessLiveCards(MAX_LIVE_DOM_CARDS);
    }
  } else {
    const emptyRow = resultsBody.querySelector('.empty-state');
    if (emptyRow) emptyRow.remove();
    if (!resultsBody.querySelector(`tr[data-key="${CSS.escape(key)}"]`)) {
      resultsBody.prepend(buildResultRow(r));
    }
  }

  updateResultCountLabel();
}

R.flushThrottledUi = function flushThrottledUi(force = false) {
  if (uiThrottleTimer) {
    clearTimeout(uiThrottleTimer);
    uiThrottleTimer = null;
  }
  if (!force && !uiDirty) return;
  uiDirty = false;
  updateSummaryStats({ light: true });
  if (state.appView === 'dashboard') {
    if (state.running) {
      const seen = new Set();
      for (const r of pendingHighlightResults) {
        const k = recordKey(r);
        if (seen.has(k)) continue;
        seen.add(k);
        appendScanResult(r);
      }
      updateProgress();
    } else {
      renderResults();
      const last = pendingHighlightResults[pendingHighlightResults.length - 1];
      if (last && resultMatchesCurrentFilter(last)) {
        highlightNewResultCard(last);
        pulseActiveFilterButton();
      }
    }
  } else {
    updateProgress();
  }
  pendingHighlightResults = [];
}

R.scheduleThrottledUi = function scheduleThrottledUi(highlightResult = null) {
  if (highlightResult) pendingHighlightResults.push(highlightResult);
  uiDirty = true;
  if (uiThrottleTimer) return;
  uiThrottleTimer = setTimeout(flushThrottledUi, UI_THROTTLE_MS);
}

R.onResultAdded = function onResultAdded(result) {
  if (state.running) {
    const everyN = sessionSaveEveryN();
    if (state.results.length % everyN === 0) {
      sessionDirty = true;
      scheduleSaveSession('scan-result');
    }
    scheduleThrottledUi(result);
    pushLiveTierAlert(result);
    return;
  }
  updateSummaryStats();
  if (state.appView === 'dashboard') {
    renderResults();
    if (resultMatchesCurrentFilter(result)) {
      highlightNewResultCard(result);
      pulseActiveFilterButton();
    }
  }
}

R.getFilteredResults = function getFilteredResults() {
  const key = filteredResultsCacheKeyFromState();
  if (filteredResultsCache && filteredResultsCacheKey === key) return filteredResultsCache;
  const q = (state.searchQuery || '').trim().toLowerCase();
  const list = [];
  for (const r of state.results) {
    if (!resultMatchesLeadTypeFilter(r)) continue;
    if (q && !matchesSearch(r, q)) continue;
    if (state.filter === 'all') {
      list.push(r);
      continue;
    }
    if (state.filter === 'review') {
      if (!computeNeedsReview(r)) continue;
      list.push(r);
      continue;
    }
    if (!isClassifiedResult(r)) continue;
    if (state.filter === 'distressed' || state.filter === 'light') {
      if (resultLeadTier(r) !== 'distressed') continue;
    } else if (state.filter === 'well_maintained') {
      if (resultLeadTier(r) !== 'well_maintained') continue;
    } else if (state.filter === 'vacant') {
      if (resultCategory(r) !== 'vacant_lot') continue;
    } else if (state.filter === 'blurred') {
      if (!isBlurredImagery(r)) continue;
    }
    list.push(r);
  }
  filteredResultsCache = sortResults(list);
  filteredResultsCacheKey = key;
  return filteredResultsCache;
}

R.getSelectedIndex = function getSelectedIndex(list) {
  if (!state.selectedKey) return -1;
  return list.findIndex(r => recordKey(r) === state.selectedKey);
}

R.setFilter = function setFilter(filter) {
  state.filter = filter;
  state.displayLimit = DISPLAY_LIMIT_INITIAL;
  resetVirtualScrollPosition();
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  const list = getFilteredResults();
  if (!list.some(r => recordKey(r) === state.selectedKey)) {
    closePropertyModal({ save: false });
  }
  if (typeof notifyResultMutation === 'function') notifyResultMutation();
  else invalidateTierCountsCache();
  renderResults({ force: true });
  updateAppNav();
  updateExportButtons();
  updateFilterLabels();
  updateSummaryStats({ force: true });
  saveSession();
  applyFilterOverflowUi();
}

R.applyFilterOverflowUi = function applyFilterOverflowUi() {
  /* All tier filters visible inline — no overflow menu */
};

R.copyText = function copyText(text, btn) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    }
  }).catch(() => alert('Copy failed — select and copy manually: ' + text));
}

R.setImgSrc = function setImgSrc(img, url) {
  if (!img) return;
  if (!url) {
    img.style.display = 'none';
    img.removeAttribute('src');
    return;
  }
  img.style.display = 'block';
  if (img.getAttribute('src') !== url) {
    img.classList.add('img-fade');
    img.onload = () => img.classList.remove('img-fade');
    img.src = url;
  }
}

R.getApiKeyForImagery = function getApiKeyForImagery() {
  if (USE_PROXY) return '';
  return normalizeApiKey(streetViewKey.value);
}

R.hasImageryKey = function hasImageryKey() {
  return USE_PROXY ? !!serverConfig.hasMapsKey : !!getApiKeyForImagery();
}

R.streetViewUnavailableForRecord = function streetViewUnavailableForRecord(result) {
  if (!result) return false;
  if (result.skippedStreetView === true) return true;
  if (result.viewMeta?.targeting === 'not_found') return true;
  if (result.qualityFlags?.includes('no_streetview')) return true;
  return false;
}

R.recordUsedSatelliteOnly = function recordUsedSatelliteOnly(result) {
  if (!result) return false;
  if (streetViewUnavailableForRecord(result)) return true;
  if (result.usedSatellite && !result.viewMeta) return true;
  return false;
}

R.buildStreetViewThumbUrl = function buildStreetViewThumbUrl(address, apiKey, size = STREET_VIEW_SIZE, viewMeta = null) {
  const key = normalizeApiKey(apiKey);
  if (!address) return '';
  if (USE_PROXY && !key && !serverHasMapsKey) return '';
  if (!USE_PROXY && !key) return '';
  if (USE_PROXY) {
    const q = new URLSearchParams({ address, size, fast: '1' });
    appendMapsKeyParam(q, apiKey);
    if (viewMeta?.panoId) q.set('pano', viewMeta.panoId);
    if (viewMeta?.panoLat != null) q.set('panoLat', String(viewMeta.panoLat));
    if (viewMeta?.panoLng != null) q.set('panoLng', String(viewMeta.panoLng));
    if (viewMeta?.heading != null) q.set('heading', String(viewMeta.heading));
    if (viewMeta?.fov != null) q.set('fov', String(viewMeta.fov));
    return `/api/sv-image?${q.toString()}`;
  }
  const fov = viewMeta?.fov ?? SV_THUMB_FOV;
  const params = new URLSearchParams({
    size,
    key,
    return_error_code: 'true',
    fov: String(fov),
    pitch: '0'
  });
  if (viewMeta?.panoId) {
    params.set('pano', viewMeta.panoId);
    if (viewMeta.heading != null) params.set('heading', String(viewMeta.heading));
  } else if (viewMeta?.panoLat != null && viewMeta?.panoLng != null) {
    params.set('location', `${viewMeta.panoLat},${viewMeta.panoLng}`);
    params.set('radius', String(SV_THUMB_RADIUS));
    if (viewMeta.heading != null) params.set('heading', String(viewMeta.heading));
  } else {
    params.set('location', address);
    params.set('radius', String(SV_THUMB_RADIUS));
    if (viewMeta?.heading != null) params.set('heading', String(viewMeta.heading));
  }
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

R.buildSatelliteThumbUrl = function buildSatelliteThumbUrl(address, apiKey, size = CARD_SAT_THUMB_SIZE, viewMeta = null) {
  const key = normalizeApiKey(apiKey);
  if (!address) return '';
  if (USE_PROXY && !key && !serverHasMapsKey) return '';
  if (!USE_PROXY && !key) return '';
  if (USE_PROXY) {
    const q = new URLSearchParams({ address, size });
    appendMapsKeyParam(q, apiKey);
    if (viewMeta?.targetLat != null) q.set('lat', String(viewMeta.targetLat));
    if (viewMeta?.targetLng != null) q.set('lng', String(viewMeta.targetLng));
    return `/api/satellite-image?${q.toString()}`;
  }
  const center = viewMeta?.targetLat != null && viewMeta?.targetLng != null
    ? `${viewMeta.targetLat},${viewMeta.targetLng}`
    : address;
  const params = new URLSearchParams({
    center,
    zoom: String(SAT_THUMB_ZOOM),
    size,
    maptype: 'satellite',
    key
  });
  if (viewMeta?.targetLat != null && viewMeta?.targetLng != null) {
    params.append('markers', `color:red|size:mid|${viewMeta.targetLat},${viewMeta.targetLng}`);
  }
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

R.isCachedImageryUrl = function isCachedImageryUrl(url) {
  return typeof url === 'string' && url.includes('/api/cached-imagery/');
}

R.lookupImageryFromIndex = function lookupImageryFromIndex(address) {
  if (!address || !imageryIndexMapCache) return null;
  return imageryIndexMapCache[normalizeAddressKey(address)] || null;
}

R.resolveImageryForResult = function resolveImageryForResult(result) {
  if (!result?.address) return result;
  const hit = lookupImageryFromIndex(result.address);
  if (hit) mergeImageryIntoResult(result, hit);
  return result;
}

R.getCachedImageryUrls = function getCachedImageryUrls(result) {
  resolveImageryForResult(result);
  const imagery = result?.imagery;
  if (!imagery) return { streetView: null, satellite: null };
  return {
    streetView: imagery.streetView?.url && imagery.streetView.status === 'ok' ? imagery.streetView.url : null,
    satellite: imagery.satellite?.url && imagery.satellite.status === 'ok' ? imagery.satellite.url : null
  };
}

R.mergeImageryIntoResult = function mergeImageryIntoResult(result, imagery) {
  if (!result || !imagery) return result;
  result.imagery = { ...(result.imagery || {}), ...imagery };
  return result;
}

R.cachePropertyImageryBackground = async function cachePropertyImageryBackground(result, opts = {}) {
  if (!USE_PROXY || !result?.address) return null;
  const addr = result.address;
  const cached = getCachedImageryUrls(result);
  if (cached.streetView && (!opts.includeSatellite || cached.satellite)) return result.imagery;

  const body = {
    address: addr,
    type: 'streetview',
    viewMeta: result.viewMeta || null
  };
  if (opts.base64) {
    body.base64 = opts.base64;
    body.mimeType = opts.mimeType || 'image/jpeg';
    body.source = 'scan_inline';
  }

  try {
    const res = await apiFetch('/api/imagery/cache-one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data?.imagery) {
      if (imageryIndexMapCache) {
        const mapKey = normalizeAddressKey(addr);
        imageryIndexMapCache[mapKey] = { ...(imageryIndexMapCache[mapKey] || {}), ...data.imagery };
      }
      mergeImageryIntoResult(result, data.imagery);
      const key = recordKey(result);
      const idx = state.results.findIndex((r) => recordKey(r) === key);
      if (idx >= 0) state.results[idx].imagery = result.imagery;
      DistressPersistence?.scheduleSave?.('imagery-cache');
      const card = cardsGrid?.querySelector(`.prop-card[data-key="${CSS.escape(key)}"]`);
      if (card) wireCardThumb(card, result);
    }
    if (!data?.ok && data?.unavailable && (result.usedSatellite || result.skippedStreetView)) {
      const satRes = await apiFetch('/api/imagery/cache-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, type: 'satellite' })
      });
      const satData = await satRes.json();
      if (satData?.imagery) {
        mergeImageryIntoResult(result, satData.imagery);
        const key = recordKey(result);
        const idx = state.results.findIndex((r) => recordKey(r) === key);
        if (idx >= 0) state.results[idx].imagery = result.imagery;
        const card = cardsGrid?.querySelector(`.prop-card[data-key="${CSS.escape(key)}"]`);
        if (card) wireCardThumb(card, result);
      }
    }
    return result.imagery;
  } catch (err) {
    console.warn('[Imagery cache]', addr, err.message);
    return null;
  }
}

R.imageryMigrationRunning = false;

R.normalizeAddressKey = function normalizeAddressKey(address) {
  return String(address || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

R.imageryIndexMapCache = null;

R.fetchImageryIndexMap = async function fetchImageryIndexMap() {
  if (imageryIndexMapCache) return imageryIndexMapCache;
  const res = await fetch('/api/imagery/index-map');
  const data = await res.json();
  if (!data?.ok || !data.map) return {};
  imageryIndexMapCache = data.map;
  return imageryIndexMapCache;
}

R.hydrateImageryFromServerIndex = async function hydrateImageryFromServerIndex(opts = {}) {
  if (!USE_PROXY || !state.results?.length) return 0;

  let map = imageryIndexMapCache;
  if (!map || opts.forceFetch) {
    try {
      map = await fetchImageryIndexMap();
    } catch (_) {
      return 0;
    }
  }
  if (!Object.keys(map).length) return 0;

  const CHUNK = 500;
  let hydrated = 0;
  for (let i = 0; i < state.results.length; i++) {
    const r = state.results[i];
    if (!r?.address) continue;
    const hasCached = isCachedImageryUrl(r.imagery?.streetView?.url)
      || isCachedImageryUrl(r.imagery?.satellite?.url);
    if (hasCached) continue;
    const hit = map[normalizeAddressKey(r.address)];
    if (!hit) continue;
    mergeImageryIntoResult(r, hit);
    hydrated++;
    if (hydrated % CHUNK === 0) await yieldToMain();
  }
  if (hydrated) {
    sessionDirty = true;
    refreshAllCardThumbs();
    if (!opts.deferSave) flushSaveSession({ reason: 'imagery-hydrate' });
    log(`Linked ${hydrated.toLocaleString()} cached preview photo${hydrated === 1 ? '' : 's'} from disk`, 'success');
  }
  return hydrated;
}

R.scheduleDeferredImageryHydrate = function scheduleDeferredImageryHydrate() {
  if (!USE_PROXY) return;
  const run = async () => {
    try {
      await fetchImageryIndexMap();
      await hydrateImageryFromServerIndex({ deferSave: true });
      refreshAllCardThumbs();
      flushSaveSession({ reason: 'imagery-hydrate-deferred' });
    } catch (e) {
      console.warn('[Imagery hydrate]', e);
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 4000 });
  } else {
    setTimeout(run, 200);
  }
}

R.runImageryMigrationIfNeeded = async function runImageryMigrationIfNeeded() {
  if (!USE_PROXY || imageryMigrationRunning || !state.results?.length) return;
  await hydrateImageryFromServerIndex();
  const needs = state.results.filter((r) => {
    if (!r?.address) return false;
    const c = getCachedImageryUrls(r);
    if (c.streetView || c.satellite) return false;
    if (r.imagery?.streetView?.unavailable && r.imagery?.satellite?.unavailable) return false;
    return true;
  });
  if (!needs.length) return;
  if (needs.length > 200 && !state.imageryMigrationPrompted) {
    state.imageryMigrationPrompted = true;
    log(`${needs.length} properties need photo caching — run: node scripts/migrate-imagery.js (or caching will happen gradually during scans)`, 'warn');
    return;
  }
  if (needs.length > 30) return;

  imageryMigrationRunning = true;
  log(`Caching photos for ${needs.length} propert${needs.length === 1 ? 'y' : 'ies'}…`, 'info');
  let done = 0;
  for (const r of needs.slice(0, 15)) {
    await cachePropertyImageryBackground(r);
    done++;
    if (done % 5 === 0) refreshAllCardThumbs();
    await sleep(400);
  }
  imageryMigrationRunning = false;
  refreshAllCardThumbs();
  DistressPersistence?.scheduleSave?.('imagery-migration');
  if (done) log(`Cached ${done} property photo${done === 1 ? '' : 's'} — no more Google calls for these`, 'success');
}

R.getPropertyImageUrls = function getPropertyImageUrls(address, result = null, opts = {}) {
  const cached = getCachedImageryUrls(result);
  const preferSatellite = recordUsedSatelliteOnly(result);
  if (cached.streetView || cached.satellite) {
    return {
      satellite: cached.satellite,
      streetView: streetViewUnavailableForRecord(result) ? null : cached.streetView,
      preferSatellite,
      fromCache: true
    };
  }

  const key = getApiKeyForImagery();
  if (!hasImageryKey() || !address) return { satellite: null, streetView: null, preferSatellite: false, fromCache: false };
  const viewMeta = result?.viewMeta || null;
  const size = opts.thumb ? CARD_THUMB_SIZE : STREET_VIEW_SIZE;
  const satSize = opts.thumb ? CARD_SAT_THUMB_SIZE : '640x640';
  const satellite = buildSatelliteThumbUrl(address, key, satSize, viewMeta);
  const streetView = streetViewUnavailableForRecord(result)
    ? null
    : buildStreetViewThumbUrl(address, key, size, viewMeta);
  return { satellite, streetView, preferSatellite, fromCache: false };
}

R.getCardThumbUrls = function getCardThumbUrls(result) {
  const cached = getCachedImageryUrls(result);
  const preferSatellite = recordUsedSatelliteOnly(result);
  if (preferSatellite) {
    return {
      primary: cached.satellite || cached.streetView || '',
      fallback: cached.streetView && cached.satellite && cached.streetView !== cached.satellite ? cached.streetView : '',
      label: cached.satellite ? (cached.streetView ? 'Cached satellite' : 'Cached satellite') : '',
      fromCache: !!(cached.satellite || cached.streetView),
      needsCache: !cached.satellite && !cached.streetView && !!result?.address
    };
  }
  const sv = streetViewUnavailableForRecord(result) ? null : cached.streetView;
  return {
    primary: sv || cached.satellite || '',
    fallback: cached.satellite && sv && cached.satellite !== sv ? cached.satellite : '',
    label: sv ? 'Cached' : (cached.satellite ? 'Cached satellite' : ''),
    fromCache: !!(sv || cached.satellite),
    needsCache: !sv && !cached.satellite && !!result?.address
      && !result?.imagery?.streetView?.unavailable
  };
}

R.thumbLoadsActive = 0;
R.thumbLoadQueue = [];
R.THUMB_LOAD_MAX_CACHED = 64;
R.THUMB_LOAD_MAX_REMOTE = 16;
R.THUMB_LOAD_TIMEOUT_MS = 12000;
R.THUMB_LAZY_ROOT_MARGIN = '600px 0px';
R.thumbObserver = null;
R.thumbObserved = new WeakSet();
R.imageryCacheQueued = new Set();
R.imageryCacheObserver = null;
R.imageryCacheObserved = new WeakSet();
R.IMAGERY_CACHE_ROOT_MARGIN = '400px 0px';

R.isCachedThumbUrl = function isCachedThumbUrl(url) {
  return typeof url === 'string' && url.startsWith('/api/cached-imagery/');
}

R.isNearViewport = function isNearViewport(el, margin = 600) {
  if (!el?.getBoundingClientRect) return false;
  const r = el.getBoundingClientRect();
  const h = window.innerHeight || document.documentElement.clientHeight;
  return r.bottom >= -margin && r.top <= h + margin;
}

R.ensureThumbObserver = function ensureThumbObserver() {
  if (thumbObserver) return thumbObserver;
  thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      const url = img.dataset.thumbSrc;
      if (!url || img.dataset.thumbLoaded === '1') {
        thumbObserver.unobserve(img);
        continue;
      }
      thumbObserver.unobserve(img);
      thumbObserved.delete(img);
      startThumbImageLoad(img, url);
    }
  }, { root: null, rootMargin: THUMB_LAZY_ROOT_MARGIN, threshold: 0 });
  return thumbObserver;
}

R.resetThumbLoadQueue = function resetThumbLoadQueue() {
  thumbLoadsActive = 0;
  thumbLoadQueue.length = 0;
}

R.drainThumbLoadQueue = function drainThumbLoadQueue(max) {
  while (thumbLoadsActive < max && thumbLoadQueue.length) {
    const run = thumbLoadQueue.shift();
    if (run) run();
  }
}

R.queueThumbSrc = function queueThumbSrc(img, url) {
  const max = isCachedThumbUrl(url) ? THUMB_LOAD_MAX_CACHED : THUMB_LOAD_MAX_REMOTE;
  const apply = () => {
    if (!img?.isConnected) {
      drainThumbLoadQueue(max);
      return;
    }
    thumbLoadsActive++;
    let released = false;
    let timer = null;
    const release = () => {
      if (released) return;
      released = true;
      if (timer) clearTimeout(timer);
      thumbLoadsActive = Math.max(0, thumbLoadsActive - 1);
      drainThumbLoadQueue(THUMB_LOAD_MAX_CACHED);
      drainThumbLoadQueue(THUMB_LOAD_MAX_REMOTE);
    };
    timer = setTimeout(release, THUMB_LOAD_TIMEOUT_MS);
    const prevOnload = img.onload;
    const prevOnerror = img.onerror;
    img.onload = (e) => { prevOnload?.call(img, e); release(); };
    img.onerror = (e) => { prevOnerror?.call(img, e); release(); };
    img.src = url;
    img.dataset.thumbLoaded = '1';
    delete img.dataset.thumbPending;
  };
  if (thumbLoadsActive < max) apply();
  else thumbLoadQueue.push(apply);
}

R.startThumbImageLoad = function startThumbImageLoad(img, url) {
  if (!img?.isConnected || !url) return;
  if (img.dataset.thumbLoaded === '1' && img.getAttribute('src') === url && img.complete && img.naturalWidth) {
    img.classList.add('loaded');
    return;
  }
  if (isCachedThumbUrl(url)) {
    img.dataset.thumbLoaded = '1';
    delete img.dataset.thumbPending;
    img.src = url;
    return;
  }
  img.dataset.thumbPending = '1';
  queueThumbSrc(img, url);
}

R.scheduleThumbImageLoad = function scheduleThumbImageLoad(img, url, card) {
  if (!img || !url) return;
  if (img.dataset.thumbSrc === url && (img.dataset.thumbPending === '1' || img.dataset.thumbLoaded === '1')) {
    if (img.complete && img.naturalWidth) img.classList.add('loaded');
    return;
  }
  if (img.dataset.thumbSrc && img.dataset.thumbSrc !== url) {
    if (thumbObserver && thumbObserved.has(img)) {
      thumbObserver.unobserve(img);
      thumbObserved.delete(img);
    }
    img.removeAttribute('src');
    delete img.dataset.thumbLoaded;
    delete img.dataset.thumbPending;
  }
  img.dataset.thumbSrc = url;
  if (isNearViewport(card)) {
    startThumbImageLoad(img, url);
    return;
  }
  ensureThumbObserver().observe(img);
  thumbObserved.add(img);
}

R.refreshAllCardThumbs = function refreshAllCardThumbs() {
  if (state.viewMode !== 'cards' || !cardsGrid) return;
  cardsGrid.querySelectorAll('.prop-card[data-key]').forEach((card) => {
    const r = findResultByKey(card.dataset.key);
    if (r) wireCardThumb(card, r);
  });
}

R.ensureImageryCacheObserver = function ensureImageryCacheObserver() {
  if (imageryCacheObserver) return imageryCacheObserver;
  imageryCacheObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = entry.target;
      imageryCacheObserver.unobserve(card);
      imageryCacheObserved.delete(card);
      const key = card.dataset?.imageryCacheKey;
      const r = key ? findResultByKey(key) : null;
      if (r) runImageryCacheForResult(r, card);
    }
  }, { root: null, rootMargin: IMAGERY_CACHE_ROOT_MARGIN, threshold: 0 });
  return imageryCacheObserver;
}

R.runImageryCacheForResult = function runImageryCacheForResult(result, card) {
  if (!USE_PROXY || !result?.address) return;
  const key = recordKey(result);
  if (imageryCacheQueued.has(key)) return;
  const cached = getCachedImageryUrls(result);
  if (cached.streetView || cached.satellite) return;
  if (result.imagery?.streetView?.unavailable && result.imagery?.satellite?.unavailable) return;
  imageryCacheQueued.add(key);
  cachePropertyImageryBackground(result, {
    includeSatellite: recordUsedSatelliteOnly(result) || result.usedSatellite || result.skippedStreetView
  }).finally(() => {
    imageryCacheQueued.delete(key);
    if (card?.isConnected) wireCardThumb(card, result);
  });
}

R.scheduleImageryCacheForCard = function scheduleImageryCacheForCard(result, card) {
  if (!USE_PROXY || !result?.address || !card) return;
  const cached = getCachedImageryUrls(result);
  if (cached.streetView || cached.satellite) return;
  if (result.imagery?.streetView?.unavailable && result.imagery?.satellite?.unavailable) return;
  card.dataset.imageryCacheKey = recordKey(result);
  if (isNearViewport(card, 400)) {
    runImageryCacheForResult(result, card);
    return;
  }
  ensureImageryCacheObserver().observe(card);
  imageryCacheObserved.add(card);
}


  }
  PDA.review = {
    get openReviewMode() { return R.openReviewMode; },
    get closeReviewMode() { return R.closeReviewMode; },
    get reviewKeep() { return R.reviewKeep; },
    get reviewUndo() { return R.reviewUndo; },
    get markRecordManuallyReviewed() { return R.markRecordManuallyReviewed; },
    get mutateTierOnRecord() { return R.mutateTierOnRecord; },
    get loadCorrections() { return R.loadCorrections; },
    get saveCorrections() { return R.saveCorrections; },
    get loadLearnedBrain() { return R.loadLearnedBrain; },
    get saveLearnedBrain() { return R.saveLearnedBrain; },
    get openScoreEditModal() { return R.openScoreEditModal; },
    get renderLearnedRulesPanel() { return R.renderLearnedRulesPanel; },
    get bulkApplyTier() { return R.bulkApplyTier; }
  };
})(window);
