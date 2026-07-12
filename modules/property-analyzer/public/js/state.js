// state.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  if (typeof window !== 'undefined') window.PDA = PDA;
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {

R.geminiRequest = async function geminiRequest(body) {
  if (!USE_PROXY) return { ok: false, error: 'Run launch-analyzer.bat first' };
  if (!serverConfig.hasGeminiKey) return { ok: false, error: 'GEMINI_API_KEY not configured in .env' };
  const parts = body.contents?.[0]?.parts || [];
  const prompt = parts.find(p => p.text)?.text || 'Reply with only: OK';
  const imgPart = parts.find(p => p.inline_data);
  const res = await apiFetch('/api/gemini-vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      base64: imgPart?.inline_data?.data,
      mimeType: imgPart?.inline_data?.mime_type,
      maxOutputTokens: body.generationConfig?.maxOutputTokens || 1024
    })
  });
  const data = await res.json();
  if (data.ok) {
    return {
      ok: true,
      model: data.model,
      data: { candidates: [{ content: { parts: [{ text: data.text }] } }] }
    };
  }
  return { ok: false, error: data.error || 'Gemini failed' };
}

R.runGeminiTest = async function runGeminiTest() {
  if (!serverConfig.hasGeminiKey) {
    setDiag(diagGemini, 'fail', 'Gemini: ✗ add GEMINI_API_KEY to .env');
    return;
  }
  setDiag(diagGemini, 'warn', 'Gemini: testing…');
  try {
    const result = await geminiRequest({ contents: [{ parts: [{ text: 'Reply with only: OK' }] }] });
    if (result.ok) {
      setDiag(diagGemini, 'ok', `Gemini: ✓ WORKING (${result.model})`);
    } else {
      const t = result.error || '';
      const short = t.slice(0, 120);
      const isQuota = /quota|exceeded|429|resource_exhausted/i.test(t);
      setDiag(diagGemini, 'fail', isQuota
        ? 'Gemini: ✗ QUOTA EXCEEDED — wait or add billing'
        : `Gemini: ✗ BROKEN — ${short}`);
    }
  } catch (e) {
    setDiag(diagGemini, 'fail', 'Gemini: ✗ BROKEN — ' + e.message);
  }
}

R.runFullTest = async function runFullTest() {
  await fetchServerConfig();
  if (!serverConfig.hasMapsKey || !serverConfig.hasGeminiKey) {
    setDiag(diagFull, 'fail', 'Full pipeline: ✗ configure MAPS_API_KEY and GEMINI_API_KEY in .env');
    return;
  }
  if (!USE_PROXY) {
    setDiag(diagFull, 'fail', 'Full pipeline: ✗ run launch-analyzer.bat first');
    return;
  }
  setDiag(diagFull, 'warn', 'Full pipeline: testing…');
  const testAddr = '1600 Amphitheatre Parkway, Mountain View, CA 94043';
  try {
    const imgRes = await fetch(proxyFetchUrl('/api/sv-base64', { address: testAddr }, ''));
    const imgData = await imgRes.json();
    if (!imgData.ok) {
      const fix = imgData.hint || streetViewFixHint(imgData.error || '');
      setDiag(diagStreetView, 'fail', 'Street View: ✗ BROKEN — ' + imgData.error);
      setDiag(diagFull, 'fail', 'Full pipeline: ✗ died at STREET VIEW step');
      alert(`Street View failed:\n\n${imgData.error}\n\nHow to fix:\n${fix}`);
      return;
    }
    setDiag(diagStreetView, 'ok', 'Street View: ✓ WORKING — photo loads');

    const satRes = await fetch(proxyFetchUrl('/api/satellite-base64', { address: testAddr }, ''));
    const satData = await satRes.json();
    if (!satData.ok) {
      const satFix = satData.hint || 'Enable "Maps Static API" in Google Cloud API Library (same key as Street View).';
      setDiag(diagSatellite, 'fail', 'Satellite: ✗ BROKEN — ' + (satData.error || 'failed'));
      setDiag(diagFull, 'fail', 'Full pipeline: ✗ died at SATELLITE step');
      alert(`Satellite failed:\n\n${satData.error}\n\nHow to fix:\n${satFix}`);
      return;
    }
    setDiag(diagSatellite, 'ok', 'Satellite: ✓ WORKING — aerial photo loads');

    const geminiResult = await geminiRequest({
      contents: [{
        parts: [
          { text: 'Describe this property in one sentence.' },
          { inline_data: { mime_type: imgData.mimeType, data: imgData.base64 } }
        ]
      }]
    });
    if (!geminiResult.ok) {
      const t = geminiResult.error || '';
      const isQuota = /quota|exceeded|429|resource_exhausted/i.test(t);
      setDiag(diagGemini, 'fail', isQuota
        ? 'Gemini: ✗ QUOTA EXCEEDED — this is your blocker'
        : 'Gemini: ✗ BROKEN — ' + t.slice(0, 100));
      setDiag(diagFull, 'fail', 'Full pipeline: ✗ died at GEMINI step (Street View was fine)');
      alert(`Gemini failed:\n\n${t.slice(0, 500)}\n\nCheck your Gemini key at aistudio.google.com/apikey`);
      return;
    }
    setDiag(diagGemini, 'ok', `Gemini: ✓ WORKING (${geminiResult.model})`);
    const live = await refreshServerStatusUi();
    if (live?.gemini?.rateLimited) {
      setDiag(diagFull, 'warn', 'Full pipeline: ⚠ Gemini OK once, but server shows active rate limits — lower workers & wait');
      log('Gemini passed single test but server is seeing 429s — slow down before bulk scan', 'warn');
    } else {
      setDiag(diagFull, 'ok', 'Full pipeline: ✓ ALL WORKING — ready to scan');
    }
  } catch (e) {
    setDiag(diagFull, 'fail', 'Full pipeline: ✗ ' + e.message);
  }
}

R.recordKey = function recordKey(r) {
  return `${r.email}|${r.phone}|${r.address}`;
}

/**
 * Stable address key for dedupe (street + city + state + zip).
 * Used so re-imports of already-scanned properties are dropped and don't burn Maps/Gemini credits.
 */
R.addressMatchKey = function addressMatchKey(r) {
  if (!r) return '';
  const streetAbbr = {
    street: 'st', st: 'st', avenue: 'ave', ave: 'ave', road: 'rd', rd: 'rd',
    drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln', boulevard: 'blvd', blvd: 'blvd',
    court: 'ct', ct: 'ct', circle: 'cir', cir: 'cir', way: 'way', place: 'pl', pl: 'pl',
    terrace: 'ter', ter: 'ter', trail: 'trl', trl: 'trl', parkway: 'pkwy', pkwy: 'pkwy',
    highway: 'hwy', hwy: 'hwy', north: 'n', south: 's', east: 'e', west: 'w',
    northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw'
  };
  const norm = (s) => String(s || '')
    .toLowerCase()
    .replace(/[#.,/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const streetPart = norm(r.street || String(r.address || '').split(',')[0] || '')
    .replace(/\b([a-z0-9]+)\b/g, (m) => streetAbbr[m] || m);
  const city = norm(r.city || '');
  let state = norm(r.state || '');
  if (state.length > 2) {
    const map = {
      texas: 'tx', florida: 'fl', georgia: 'ga', ohio: 'oh', colorado: 'co',
      arizona: 'az', 'north carolina': 'nc', wyoming: 'wy', california: 'ca'
    };
    state = map[state] || state.slice(0, 2);
  }
  const zip = norm(r.postal || r.zip || '').replace(/\s+/g, '').slice(0, 5);
  if (!streetPart) return '';
  return [streetPart, city, state, zip].filter(Boolean).join('|');
}

/** True if this lead already exists among scanned results (address-level). */
R.isAlreadyScannedAddress = function isAlreadyScannedAddress(row, results) {
  const k = addressMatchKey(row);
  if (!k) return false;
  for (const r of results || []) {
    if (addressMatchKey(r) === k) return true;
  }
  return false;
}

R.markRecordManuallyReviewed = function markRecordManuallyReviewed(r, via = 'manual') {
  if (!r) return r;
  return {
    ...r,
    manuallyReviewed: true,
    manuallyReviewedAt: Date.now(),
    manuallyReviewedVia: via
  };
}

R.isManuallyReviewed = function isManuallyReviewed(r) {
  if (!r) return false;
  return !!(r.manuallyReviewed || r.manualScore || r.manualOverride || r.reviewResolved);
}

R.manuallyReviewedBadgeHtml = function manuallyReviewedBadgeHtml(r) {
  return isManuallyReviewed(r) ? '<span class="reviewed-badge">Reviewed by you</span>' : '';
}

R.categoryBadgeClass = function categoryBadgeClass(cat) {
  if (cat === 'vacant_lot') return 'vacant';
  if (cat === 'blurred') return 'blurred';
  return cat || 'property';
}

R.tierBadgeClassForRecord = function tierBadgeClassForRecord(r) {
  if (computeNeedsReview(r)) return 'review';
  return resultLeadTier(r);
}

R.tierBadgeLabelForRecord = function tierBadgeLabelForRecord(r) {
  if (computeNeedsReview(r)) return 'Needs Review';
  return leadTierLabel(resultLeadTier(r));
}

R.touchManuallyReviewedByKey = function touchManuallyReviewedByKey(key, via = 'review') {
  const idx = typeof ensureResultKeyIndex === 'function'
    ? ensureResultKeyIndex().get(key)
    : state.results.findIndex(r => recordKey(r) === key);
  if (idx == null || idx < 0) return;
  state.results[idx] = markRecordManuallyReviewed(state.results[idx], via);
}

R.migrateManuallyReviewedFlags = function migrateManuallyReviewedFlags() {
  try {
    let changed = 0;
    const reviewedKeys = new Set();
    const buckets = typeof REVIEW_FILTER_BUCKETS !== 'undefined'
      ? REVIEW_FILTER_BUCKETS
      : ['distressed', 'well_maintained', 'vacant', 'review', 'low_confidence'];
    for (const filter of buckets) {
      for (const key of state.reviewedKeysByFilter?.[filter] || []) reviewedKeys.add(key);
    }
    state.results = state.results.map((r) => {
      const key = recordKey(r);
      if (r.manuallyReviewed) return r;
      if (r.manualScore || r.manualOverride || r.reviewResolved) {
        changed++;
        const via = r.manualScore ? 'tier_edit' : 'category_change';
        return markRecordManuallyReviewed(r, via);
      }
      if (reviewedKeys.has(key)) {
        changed++;
        return markRecordManuallyReviewed(r, 'review_session');
      }
      return r;
    });
    return changed;
  } catch (e) {
    console.warn('migrateManuallyReviewedFlags failed', e);
    return 0;
  }
}

R.normalizeDeprecatedReviewState = function normalizeDeprecatedReviewState() {
  if (state.reviewFilter === 'low_confidence') state.reviewFilter = 'all';
  if (state.reviewProgressByFilter?.low_confidence) {
    delete state.reviewProgressByFilter.low_confidence;
  }
  if (state.reviewMode && !REVIEW_MODE_FILTERS.includes(state.reviewFilter)) {
    state.reviewMode = false;
    state.reviewFilter = 'all';
    state.reviewQueue = [];
    state.reviewIndex = 0;
  }
}

R.resetBlockingUiOnLoad = function resetBlockingUiOnLoad() {
  normalizeDeprecatedReviewState();
  state.reviewMode = false;
  hideReviewOverlay();
  closeAllToolModals();
  closePropertyModal({ save: false });
  closeScoreEditModal();
  imageLightbox?.classList.remove('open');
  document.body.style.overflow = '';
  document.body.classList.remove('review-mode-active', 'property-modal-open', 'scan-running');
  document.documentElement.classList.remove('scan-active');
  if (reviewModeOverlay) {
    reviewModeOverlay.classList.remove('open');
    reviewModeOverlay.hidden = true;
  }
}

R.normalizeStateAbbr = function normalizeStateAbbr(state) {
  if (!state) return '';
  const raw = String(state).trim();
  if (!raw) return '';
  if (raw.length === 2) return raw.toUpperCase();
  return US_STATE_NAME_TO_ABBR[raw.toLowerCase()] || raw.slice(0, 2).toUpperCase();
}

R.propertyLocationTitle = function propertyLocationTitle(r) {
  const city = (r.city || '').trim();
  const abbr = normalizeStateAbbr(r.state);
  const stateName = (r.state || '').trim();
  if (city && abbr) return `${city}, ${abbr}`;
  if (city) return city;
  if (abbr && US_STATE_ABBRS[abbr]) return US_STATE_ABBRS[abbr];
  if (stateName) return stateName;
  return 'Unknown location';
}

R.propertyStreetLine = function propertyStreetLine(r) {
  const street = (r.street || '').trim();
  const postal = (r.postal || '').trim();
  if (street && postal) return `${street}, ${postal}`;
  return street || r.address || '';
}

R.contactName = function contactName(r) {
  return `${r.firstName || ''} ${r.lastName || ''}`.trim() || '—';
}

R.stateIconHtml = function stateIconHtml(r, compact = false) {
  const abbr = normalizeStateAbbr(r.state);
  if (!abbr) return '';
  const glyph = US_STATE_ICON_GLYPHS?.[abbr];
  if (!glyph) return '';
  const color = US_STATE_ICON_COLORS[abbr] || '#8aa4c4';
  const title = US_STATE_ABBRS[abbr] || (r.state || abbr);
  const cls = compact ? 'state-icon state-icon-sm' : 'state-icon';
  return `<span class="${cls}" style="--state-color:${color}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"><span class="stateface-glyph" aria-hidden="true">${glyph}</span></span>`;
}

R.propertyTitleHtml = function propertyTitleHtml(r) {
  return `${stateIconHtml(r)}<span class="property-title-text">${escapeHtml(propertyLocationTitle(r))}</span>`;
}

R.sessionSaveTimer = null;
R.scanSaveHeartbeatTimer = null;
R.sessionDirty = false;
R.sessionSaveInFlight = false;
R.sessionSavePending = false;
R.sessionIdbPromise = null;
R.lastSessionSaveAt = 0;
R.lastSessionSaveError = null;
R.lastSessionSaveRejected = false;
R.pendingServerSave = false;
let reviewMetadataSaveTimer = null;
let reviewMetadataSaveInFlight = false;
let reviewMetadataSaveQueued = false;

R.expectedServerResultCount = function expectedServerResultCount() {
  const targets = [
    sessionLoadState.total,
    sessionLoadState.serverCanonical,
    state.processed,
    state.records.length
  ]
    .map((n) => Number(n) || 0)
    .filter((n) => n > 0);
  return targets.length ? Math.max(...targets) : 0;
}

R.isSessionReadyForServerSave = function isSessionReadyForServerSave() {
  if (sessionLoadState.loading) return false;
  const expected = expectedServerResultCount();
  if (expected > 0 && state.results.length < expected) return false;
  return true;
}

R.requestServerSave = function requestServerSave(reason = 'deferred') {
  if (!isSessionReadyForServerSave()) {
    pendingServerSave = true;
    sessionDirty = true;
    updateSessionSaveStatus();
    return;
  }
  scheduleSaveSession(reason);
}

R.flushPendingServerSave = function flushPendingServerSave(reason = 'session-ready') {
  if (!pendingServerSave || !isSessionReadyForServerSave()) return;
  pendingServerSave = false;
  sessionDirty = true;
  if (typeof pushReviewMetadataToServer === 'function') {
    pushReviewMetadataToServer(reason, { immediate: true });
  }
  scheduleSaveSession(reason);
}
R.isServerAheadRejection = function isServerAheadRejection(body, incomingCount = 0) {
  if (!body?.rejected) return false;
  const kept = Number(body.kept) || 0;
  const incoming = Number(body.incoming ?? incomingCount) || 0;
  return kept > 0 && incoming <= kept;
}

R.interpretServerBackupResponse = function interpretServerBackupResponse(res, body, opts = {}) {
  if (body && body.rejected) {
    const kept = body.kept ?? '?';
    const incoming = body.incoming ?? '?';
    if (isServerAheadRejection(body, opts.incomingCount)) {
      return { ok: true, reconciled: true, body };
    }
    return { ok: false, rejected: true, error: `Server kept newer backup (${kept} results, refused ${incoming})`, body };
  }
  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    return { ok: false, error: (body && body.error) || `Server save failed (HTTP ${status})`, body };
  }
  return { ok: true, body };
};

R.openSessionIdb = function openSessionIdb() {
  if (!sessionIdbPromise) {
    sessionIdbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(SESSION_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SESSION_IDB_STORE)) {
          db.createObjectStore(SESSION_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return sessionIdbPromise;
}

R.idbPutSession = function idbPutSession(json) {
  return openSessionIdb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(SESSION_IDB_STORE, 'readwrite');
    tx.objectStore(SESSION_IDB_STORE).put(json, STORAGE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

R.idbGetSession = function idbGetSession() {
  return openSessionIdb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(SESSION_IDB_STORE, 'readonly');
    const req = tx.objectStore(SESSION_IDB_STORE).get(STORAGE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  })).catch(() => null);
}

R.promiseWithTimeout = function promiseWithTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })
  ]);
}

R.yieldToMain = function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

R.setSessionRestoreBanner = function setSessionRestoreBanner(msg, isError = false) {
  if (msg && isError) console.warn('[Analyze]', msg);
}

R.countReviewedKeysInPayload = function countReviewedKeysInPayload(buckets) {
  if (!buckets || typeof buckets !== 'object') return 0;
  let n = 0;
  for (const k of Object.keys(buckets)) {
    const bucket = buckets[k];
    n += Array.isArray(bucket) ? bucket.length : 0;
  }
  return n;
}

R.buildReviewMetadataPayload = function buildReviewMetadataPayload() {
  const patches = [];
  for (const r of state.results) {
    if (!r.manuallyReviewed && !r.reviewResolved && !r.manualOverride && !r.manualScore && !r.needsReviewLater) continue;
    patches.push({
      email: r.email,
      phone: r.phone,
      address: r.address,
      manuallyReviewed: r.manuallyReviewed,
      manuallyReviewedAt: r.manuallyReviewedAt,
      manuallyReviewedVia: r.manuallyReviewedVia,
      reviewResolved: r.reviewResolved,
      needsReview: r.needsReview,
      needsReviewLater: r.needsReviewLater,
      landHomeConflict: r.landHomeConflict,
      satelliteConflict: r.satelliteConflict,
      manualOverride: r.manualOverride,
      manualScore: r.manualScore,
      tierLocked: r.tierLocked,
      category: r.category,
      leadTier: r.leadTier,
      score: r.score,
      structureOnLot: r.structureOnLot,
      confidence: r.confidence,
      imageryQuality: r.imageryQuality,
      reason: r.reason,
      analyzedAt: r.analyzedAt,
      manualEditedAt: r.manualEditedAt
    });
  }
  return {
    partialReviewSync: true,
    results: patches,
    records: [],
    fileName: state.fileName || '',
    processed: state.processed || 0,
    reviewedKeysByFilter: state.reviewedKeysByFilter,
    reviewProgressByFilter: state.reviewProgressByFilter,
    reviewFilter: state.reviewFilter,
    reviewQueue: state.reviewQueue,
    reviewIndex: state.reviewIndex,
    reviewStats: state.reviewStats,
    savedAt: Date.now()
  };
}

R.pushReviewMetadataToServer = function pushReviewMetadataToServer(reason = 'review-metadata', opts = {}) {
  if (!USE_PROXY || !isSessionReadyForServerSave()) {
    pendingServerSave = true;
    return Promise.resolve({ ok: false, deferred: true });
  }
  if (opts.immediate) {
    if (reviewMetadataSaveTimer) {
      clearTimeout(reviewMetadataSaveTimer);
      reviewMetadataSaveTimer = null;
    }
    return flushReviewMetadataToServer(reason);
  }
  if (reviewMetadataSaveTimer) clearTimeout(reviewMetadataSaveTimer);
  const debounceMs = REVIEW_PROGRESS_DEBOUNCE_MS || 600;
  reviewMetadataSaveTimer = setTimeout(() => {
    reviewMetadataSaveTimer = null;
    flushReviewMetadataToServer(reason);
  }, debounceMs);
  return Promise.resolve({ ok: true, queued: true });
}

R.flushReviewMetadataToServer = async function flushReviewMetadataToServer(reason = 'review-metadata') {
  if (!USE_PROXY) return { ok: false, skipped: true };
  if (!isSessionReadyForServerSave()) {
    pendingServerSave = true;
    return { ok: false, deferred: true };
  }
  if (reviewMetadataSaveInFlight) {
    reviewMetadataSaveQueued = true;
    return { ok: false, queued: true };
  }
  reviewMetadataSaveInFlight = true;
  try {
    const payload = buildReviewMetadataPayload();
    const json = JSON.stringify(payload);
    const reasonParam = encodeURIComponent(reason || 'review-metadata');
    const res = await apiFetch(`/api/session-backup?reason=${reasonParam}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: json.length <= FETCH_KEEPALIVE_MAX_BYTES
    });
    const body = await res.json().catch(() => ({}));
    const interpreted = interpretServerBackupResponse(res, body, {
      incomingCount: state.results.length
    });
    if (interpreted.ok) {
      pendingServerSave = false;
      lastSessionSaveRejected = false;
      lastSessionSaveAt = payload.savedAt;
      updateSessionSaveStatus();
    } else if (!interpreted.rejected) {
      console.warn('[Review metadata save]', interpreted.error || 'failed');
    }
    return interpreted;
  } catch (e) {
    console.warn('[Review metadata save]', e);
    return { ok: false, error: e };
  } finally {
    reviewMetadataSaveInFlight = false;
    if (reviewMetadataSaveQueued) {
      reviewMetadataSaveQueued = false;
      flushReviewMetadataToServer(reason);
    }
  }
}

R.localReviewBucketsAheadOfServer = function localReviewBucketsAheadOfServer(localBuckets = {}, serverBuckets = {}) {
  const names = new Set([
    ...(typeof REVIEW_FILTER_BUCKETS !== 'undefined' ? REVIEW_FILTER_BUCKETS : []),
    'distressed', 'well_maintained', 'vacant', 'review', 'low_confidence',
    ...Object.keys(localBuckets || {}),
    ...Object.keys(serverBuckets || {})
  ]);
  for (const bucket of names) {
    const local = new Set(Array.isArray(localBuckets[bucket]) ? localBuckets[bucket] : []);
    const server = new Set(Array.isArray(serverBuckets[bucket]) ? serverBuckets[bucket] : []);
    for (const key of local) {
      if (!server.has(key)) return true;
    }
  }
  return false;
}

R.mergeBrowserReviewMetadata = function mergeBrowserReviewMetadata(localData) {
  if (!localData) return false;
  let changed = false;
  const localSavedAt = Number(localData.savedAt) || 0;
  const serverSavedAt = Number(state._summarySavedAt) || 0;
  const localBuckets = localData.reviewedKeysByFilter || {};
  const serverBuckets = state.reviewedKeysByFilter || {};
  const shouldUnionReviewKeys = localReviewBucketsAheadOfServer(localBuckets, serverBuckets)
    || localSavedAt > serverSavedAt;
  if (shouldUnionReviewKeys) {
    const merged = typeof mergeReviewedKeysByFilter === 'function'
      ? mergeReviewedKeysByFilter(serverBuckets, localBuckets)
      : localBuckets;
    if (JSON.stringify(merged) !== JSON.stringify(state.reviewedKeysByFilter)) {
      state.reviewedKeysByFilter = merged;
      changed = true;
    }
  }
  const localProgress = localData.reviewProgressByFilter || {};
  const serverProgress = state.reviewProgressByFilter || {};
  if (Object.keys(localProgress).length) {
    const next = { ...serverProgress };
    for (const [filter, inc] of Object.entries(localProgress)) {
      const prev = next[filter];
      const incIndex = Number(inc?.index) || 0;
      const prevIndex = Number(prev?.index) || 0;
      if (!prev || incIndex > prevIndex || (incIndex === prevIndex && localSavedAt > serverSavedAt)) {
        next[filter] = inc;
        changed = true;
      }
    }
    state.reviewProgressByFilter = next;
  }
  return changed;
}

R.buildSessionSummaryStub = function buildSessionSummaryStub(payload) {
  const stub = { ...payload };
  stub.results = [];
  stub.records = [];
  stub.serverAuthoritative = true;
  stub.resultCount = (payload.results || []).length;
  stub.recordCount = (payload.records || []).length;
  if (stub.tierCounts) {
    stub.tierCounts = normalizeTierCountsForDisplay(stub.tierCounts, stub.resultCount);
  }
  return stub;
}

R.isServerAuthoritativeSave = function isServerAuthoritativeSave() {
  return USE_PROXY && serverOnline !== false;
}

R.capBrainArray = function capBrainArray(value, cap) {
  if (!Array.isArray(value)) return [];
  return value.slice(-cap);
}

R.buildLearnedBrainSnapshot = function buildLearnedBrainSnapshot() {
  return {
    learnedRules: capBrainArray(learnedRules, BRAIN_CAPS.learnedRules),
    correctionEvents: capBrainArray(correctionEvents, BRAIN_CAPS.correctionEvents),
    scoreCorrections: capBrainArray(scoreCorrections, BRAIN_CAPS.scoreCorrections),
    tierCorrections: capBrainArray(tierCorrections, BRAIN_CAPS.tierCorrections),
    categoryCorrections: capBrainArray(categoryCorrections, BRAIN_CAPS.categoryCorrections)
  };
}

R.sessionHasLearnedBrain = function sessionHasLearnedBrain(data) {
  return !!(data && (
    Array.isArray(data.learnedRules) ||
    Array.isArray(data.correctionEvents) ||
    Array.isArray(data.scoreCorrections) ||
    Array.isArray(data.tierCorrections) ||
    Array.isArray(data.categoryCorrections)
  ));
}

R.applyLearnedBrainFromSession = function applyLearnedBrainFromSession(data, opts = {}) {
  const savedSchema = Number(data?.sessionSchemaVersion) || 1;
  const hasSessionBrain = sessionHasLearnedBrain(data);
  if (hasSessionBrain) {
    learnedRules = capBrainArray(data.learnedRules, BRAIN_CAPS.learnedRules);
    correctionEvents = capBrainArray(data.correctionEvents, BRAIN_CAPS.correctionEvents);
    scoreCorrections = capBrainArray(data.scoreCorrections, BRAIN_CAPS.scoreCorrections);
    tierCorrections = capBrainArray(data.tierCorrections, BRAIN_CAPS.tierCorrections);
    categoryCorrections = capBrainArray(data.categoryCorrections, BRAIN_CAPS.categoryCorrections);
    saveLearnedBrain({ silent: true });
    saveCorrections({ silent: true });
    renderLearnedRulesPanel();
    return { migrated: false, fromServer: true };
  }
  if (savedSchema < 6) {
    const hasLocalBrain = !!(
      learnedRules.length ||
      correctionEvents.length ||
      scoreCorrections.length ||
      tierCorrections.length ||
      categoryCorrections.length
    );
    saveLearnedBrain({ silent: true });
    saveCorrections({ silent: true });
    return { migrated: true, fromServer: false, needsServerPush: hasLocalBrain };
  }
  return { migrated: false, fromServer: false };
}

R.buildSessionPayload = function buildSessionPayload() {
  return {
    records: state.records,
    results: state.results,
    fileName: state.fileName,
    processed: state.processed,
    succeeded: state.succeeded,
    skipped: state.skipped,
    filter: state.filter,
    leadTypeFilter: state.leadTypeFilter,
    importLeadType: state.importLeadType,
    viewMode: state.viewMode,
    selectedKey: state.selectedKey,
    searchQuery: state.searchQuery,
    locationFilter: state.locationFilter,
    locationHubQuery: state.locationHubQuery || '',
    importBatches: state.importBatches || [],
    importDateFilter: state.importDateFilter || [],
    sortMode: state.sortMode,
    setupCollapsed: state.setupCollapsed,
    appView: state.propertyModalOpen ? (state.running ? 'scan' : 'dashboard') : state.appView,
    reviewFilter: state.reviewFilter,
    reviewQueue: state.reviewQueue,
    reviewIndex: state.reviewIndex,
    reviewStats: state.reviewStats,
    reviewUndoStack: state.reviewUndoStack,
    reviewProgressByFilter: state.reviewProgressByFilter,
    reviewedKeysByFilter: state.reviewedKeysByFilter,
    reviewActionsSinceCheckpoint: state.reviewActionsSinceCheckpoint || 0,
    lastReviewCheckpointAt: state.lastReviewCheckpointAt || 0,
    totalReviewCheckpoints: state.totalReviewCheckpoints || 0,
    ...buildLearnedBrainSnapshot(),
    sessionSchemaVersion: SESSION_SCHEMA_VERSION,
    savedAt: Date.now()
  };
}

R.sessionResultsSig = function sessionResultsSig(results) {
  let wm = 0;
  let distressed = 0;
  let manual = 0;
  for (const r of results || []) {
    if (resultCategory(r) !== 'property') continue;
    const tier = resultLeadTier(r);
    if (tier === 'well_maintained') wm++;
    else if (tier === 'distressed') distressed++;
    if (r.manualScore) manual++;
  }
  return `${(results || []).length}|${wm}|${distressed}|${manual}`;
}

R.updateSessionSaveStatus = function updateSessionSaveStatus() {
  const el = $('commandSaveStatus');
  if (!el) return;
  if (!state.results.length && !state.records.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (lastSessionSaveError) {
    el.className = 'command-save-status error';
    const expected = expectedServerResultCount();
    const stillLoading = sessionLoadState.loading
      || (expected > 0 && state.results.length < expected);
    el.textContent = (lastSessionSaveRejected || stillLoading)
      ? 'Save paused — loading full session from server'
      : 'Save failed — export results before closing';
    return;
  }
  const expected = expectedServerResultCount();
  if (expected > 0 && state.results.length < expected) {
    el.className = 'command-save-status pending';
    el.textContent = `Loading ${state.results.length.toLocaleString()} / ${expected.toLocaleString()} — saves paused`;
    return;
  }
  if (sessionDirty || sessionSaveInFlight || sessionSavePending) {
    el.className = 'command-save-status pending';
    el.textContent = 'Saving…';
    return;
  }
  if (lastSessionSaveAt) {
    el.className = 'command-save-status ok';
    const ago = Math.max(0, Math.round((Date.now() - lastSessionSaveAt) / 1000));
    el.textContent = ago < 5 ? 'Saved just now' : `Saved ${new Date(lastSessionSaveAt).toLocaleTimeString()}`;
    const footer = $('cyberFooter');
    if (footer) footer.textContent = ago < 60 ? 'Last updated moments ago' : `Last updated ${ago}s ago`;
    return;
  }
  el.hidden = true;
  const footer = $('cyberFooter');
  if (footer && (state.results.length || state.records.length)) {
    footer.textContent = 'Last updated moments ago';
  }
}

R.pushIncrementalScanResult = function pushIncrementalScanResult(result, processed) {
  if (!USE_PROXY || !result) return;
  const body = JSON.stringify({
    key: recordKey(result),
    result,
    processed: processed ?? state.processed,
    savedAt: Date.now()
  });
  apiFetch('/api/scan-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  }).catch((e) => console.warn('Incremental scan result log failed', e));
}

R.pushScanSessionMeta = function pushScanSessionMeta() {
  if (!USE_PROXY) return;
  const body = JSON.stringify({
    type: 'meta',
    records: state.records.length,
    processed: state.processed,
    fileName: state.fileName || '',
    savedAt: Date.now()
  });
  apiFetch('/api/scan-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  }).catch(() => {});
}

R.startScanSaveHeartbeat = function startScanSaveHeartbeat() {
  stopScanSaveHeartbeat();
  const tick = () => {
    if (!state.running) return;
    sessionDirty = true;
    flushSaveSession({ sync: true, reason: 'scan-heartbeat' });
    pushScanSessionMeta();
    scanSaveHeartbeatTimer = setTimeout(tick, scanSaveHeartbeatMs());
  };
  scanSaveHeartbeatTimer = setTimeout(tick, scanSaveHeartbeatMs());
}

R.stopScanSaveHeartbeat = function stopScanSaveHeartbeat() {
  if (!scanSaveHeartbeatTimer) return;
  clearTimeout(scanSaveHeartbeatTimer);
  scanSaveHeartbeatTimer = null;
}

R.performLocalPersist = async function performLocalPersist(json, payload, opts = {}) {
  const saveReason = opts.reason || 'unknown';
  const serverDeferred = !opts.localOnly && !isSessionReadyForServerSave();
  const localOnly = !!opts.localOnly || serverDeferred;
  const payloadBytes = json.length;
  const useStub = isServerAuthoritativeSave() && !localOnly;
  const localJson = useStub ? JSON.stringify(buildSessionSummaryStub(payload)) : json;
  if (useStub && localJson.length >= SESSION_STUB_MAX_BYTES) {
    console.warn('Session summary stub exceeds 10 KB:', localJson.length);
  }
  const skipLocalStorage = !useStub && payloadBytes > SIZE_WARN_BYTES;
  let lsOk = false;
  if (!skipLocalStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, localJson);
      lsOk = true;
    } catch (lsErr) {
      const quota = lsErr && (lsErr.name === 'QuotaExceededError' || lsErr.code === 22);
      if (!quota) throw lsErr;
      console.warn('localStorage quota exceeded, falling back to IndexedDB', lsErr);
    }
  }

  const pushServerBackup = async (saveReason = 'unknown', localOnly = false) => {
    if (!USE_PROXY || localOnly) return { ok: true, skipped: localOnly };
    try {
      const reasonParam = encodeURIComponent(saveReason || 'unknown');
      const res = await apiFetch(`/api/session-backup?reason=${reasonParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
        keepalive: json.length <= FETCH_KEEPALIVE_MAX_BYTES
      });
      const body = await res.json().catch(() => ({}));
      const interpreted = interpretServerBackupResponse(res, body, {
        incomingCount: (payload.results || []).length
      });
      if (!interpreted.ok) {
        console.warn('Server session backup failed', interpreted.rejected ? body : interpreted.error);
      } else if (interpreted.reconciled) {
        console.log('[Session] Server already has canonical backup — client save reconciled');
      }
      return interpreted;
    } catch (e) {
      console.warn('Server session backup failed', e);
      return { ok: false, error: e };
    }
  };

  const finalizeSaveResult = (server, localOnly) => {
    const serverRequired = USE_PROXY && !localOnly;
    const serverOk = !serverRequired || server.ok;
    if (!serverOk) {
      sessionDirty = true;
      lastSessionSaveRejected = !!server.rejected;
      lastSessionSaveError = server.error || new Error('Server save failed');
      updateSessionSaveStatus();
      return { ok: false, server, rejected: lastSessionSaveRejected, error: lastSessionSaveError, stub: useStub, serverDeferred };
    }
    sessionDirty = serverDeferred;
    if (serverDeferred) pendingServerSave = true;
    lastSessionSaveRejected = false;
    lastSessionSaveAt = payload.savedAt;
    lastSessionSaveError = null;
    updateSessionSaveStatus();
    return { ok: true, server, rejected: false, stub: useStub, serverDeferred };
  };

  if (lsOk) {
    await idbPutSession(localJson).catch((e) => console.warn('IndexedDB session mirror failed', e));
    const server = await pushServerBackup(saveReason, localOnly);
    return finalizeSaveResult(server, localOnly);
  }

  await idbPutSession(localJson);
  const server = await pushServerBackup(saveReason, localOnly);
  const result = finalizeSaveResult(server, localOnly);
  if (result.ok) {
    log('Session saved to IndexedDB (browser storage was full)', 'success');
  }
  return result;
}

R.scheduleSaveSession = function scheduleSaveSession(reason = 'debounced') {
  sessionDirty = true;
  invalidateTierCountsCache();
  updateSessionSaveStatus();
  if (window.DistressPersistence) {
    DistressPersistence.scheduleSave(reason);
    return;
  }
  if (sessionSaveTimer) return;
  const delay = state.running ? SESSION_SAVE_SCAN_MS : SESSION_SAVE_IDLE_MS;
  sessionSaveTimer = setTimeout(() => {
    sessionSaveTimer = null;
    flushSaveSession({ reason });
  }, delay);
}

R.saveSession = function saveSession(reason = 'manual') {
  sessionDirty = true;
  invalidateTierCountsCache();
  updateSessionSaveStatus();
  if (state.running) {
    scheduleSaveSession(reason);
    return;
  }
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  flushSaveSession({ sync: true, force: true, reason });
}

R.writeSessionToStorage = async function writeSessionToStorage() {
  if (window.DistressPersistence) {
    return DistressPersistence.saveNow('flush-sync', { urgent: true });
  }
  if (sessionSaveInFlight) {
    sessionSavePending = true;
    updateSessionSaveStatus();
    return { ok: false, queued: true };
  }
  sessionSaveInFlight = true;
  updateSessionSaveStatus();
  try {
    const payload = buildSessionPayload();
    const json = JSON.stringify(payload);
    const result = await performLocalPersist(json, payload);
    if (window.DistressPersistence) {
      DistressPersistence.rotateVersionHistory(json, payload);
      DistressPersistence.updateStorageIndicator(json.length);
    }
    return result;
  } catch (e) {
    lastSessionSaveError = e;
    log('Could not save to browser storage (data may be too large)', 'error');
    console.warn('saveSession failed', e);
    return { ok: false, error: e };
  } finally {
    sessionSaveInFlight = false;
    updateSessionSaveStatus();
    if (sessionSavePending) {
      sessionSavePending = false;
      if (sessionDirty) writeSessionToStorage();
    }
  }
}

R.flushSaveSession = function flushSaveSession(opts = {}) {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  if (!sessionDirty && !opts.force && !state.results.length) return;
  const reason = opts.reason || (opts.sync ? 'flush-sync' : 'flush');
  if (window.DistressPersistence) {
    DistressPersistence.saveNow(reason, {
      urgent: !!(opts.sync || opts.force),
      localOnly: !!opts.localOnly
    });
    return;
  }
  if (opts.sync) {
    writeSessionToStorage();
    return;
  }
  const run = () => writeSessionToStorage();
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 800 });
  } else {
    run();
  }
}

R.compareSessionCandidates = function compareSessionCandidates(a, b) {
  const rankDiff = (b.rank || 0) - (a.rank || 0);
  if (rankDiff !== 0) {
    const aResults = (a.data?.results || []).length;
    const bResults = (b.data?.results || []).length;
    if (aResults !== bResults) return rankDiff;
  }
  const aSaved = Number(a.savedAt || a.data?.savedAt) || 0;
  const bSaved = Number(b.savedAt || b.data?.savedAt) || 0;
  if (bSaved !== aSaved) return bSaved - aSaved;
  if (a.source === 'browser' && b.source === 'server') return -1;
  if (a.source === 'server' && b.source === 'browser') return 1;
  return rankDiff;
}

R.readAllBrowserSessionCandidates = async function readAllBrowserSessionCandidates() {
  const candidates = [];
  let idbRaw = null;
  try {
    idbRaw = await promiseWithTimeout(idbGetSession(), 12000, 'IndexedDB session read');
  } catch (e) {
    console.warn('IndexedDB session read skipped', e);
  }
  const hasSessionCandidate = (data) => {
    if (!data || typeof data !== 'object') return false;
    const records = (data.records || []).length;
    const results = (data.results || []).length;
    const resultCount = Number(data.resultCount) || 0;
    const reviewed = countReviewedKeysInPayload(data.reviewedKeysByFilter);
    const progress = Object.keys(data.reviewProgressByFilter || {}).length;
    return records > 0 || results > 0 || resultCount > 0 || reviewed > 0 || progress > 0;
  };
  if (idbRaw) {
    try {
      const data = JSON.parse(idbRaw);
      if (hasSessionCandidate(data)) {
        candidates.push({
          source: 'browser-idb',
          data,
          rank: sessionDataRank(data),
          savedAt: Number(data.savedAt) || 0
        });
      }
    } catch (e) {
      console.warn('IndexedDB session parse failed', e);
    }
  }
  try {
    const localRaw = localStorage.getItem(STORAGE_KEY);
    if (localRaw) {
      const data = JSON.parse(localRaw);
      if (hasSessionCandidate(data)) {
        candidates.push({
          source: 'browser-local',
          data,
          rank: sessionDataRank(data),
          savedAt: Number(data.savedAt) || 0
        });
      }
    }
  } catch (e) {
    console.warn('localStorage session parse failed', e);
  }
  candidates.sort((a, b) => compareSessionCandidates(a, b));
  return candidates;
}

R.readStoredSessionRaw = async function readStoredSessionRaw() {
  const candidates = await readAllBrowserSessionCandidates();
  if (!candidates.length) return null;
  return JSON.stringify(candidates[0].data);
}

R.hydrateResultOnLoad = function hydrateResultOnLoad(r, i, total) {
  const copy = {
    ...r,
    leadType: normalizeLeadType(r.leadType),
    tierLocked: !!(r.tierLocked || r.manualScore || r.manualOverride || r.autoWellMaintained),
    analyzedAt: r.analyzedAt ?? (Date.now() - (total - i) * 1000)
  };
  if (!copy.tierRationale) copy.tierRationale = buildTierRationale(copy);
  return copy;
}

R.migrateLeadTypes = function migrateLeadTypes() {
  let changed = 0;
  state.records = (state.records || []).map(r => {
    if (r.leadType) return { ...r, leadType: normalizeLeadType(r.leadType) };
    changed++;
    return { ...r, leadType: DEFAULT_LEAD_TYPE };
  });
  state.results = (state.results || []).map(r => {
    if (r.leadType) return { ...r, leadType: normalizeLeadType(r.leadType) };
    changed++;
    return { ...r, leadType: DEFAULT_LEAD_TYPE };
  });
  if (changed) {
    log(`Tagged ${changed.toLocaleString()} lead${changed === 1 ? '' : 's'} as Code Violation`, 'success');
  }
  return changed;
}

R.scheduleDeferredSessionSeeding = function scheduleDeferredSessionSeeding() {
  const run = () => {
    try {
      seedCategoryCorrectionsFromResults(state.results);
      seedTierCorrectionsFromResults(state.results);
    } catch (e) {
      console.warn('Deferred session seeding failed', e);
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 8000 });
  } else {
    setTimeout(run, 120);
  }
}

R.applySessionTierSchemaUpgrade = function applySessionTierSchemaUpgrade() {
  let changed = 0;
  state.results = state.results.map(r => {
    if (r.manualScore || r.manualOverride || isTierLocked(r)) return r;
    if (resultCategory(r) !== 'property') return r;
    const ctx = { ...leadTierContextFromRecord(r), reason: combinedTierReason(r) };
    const tier = computeLeadTier(resultScore(r), 'property', ctx);
    const score = clampScoreForTier(resultScore(r), tier);
    const beforeTier = normalizeLeadTier(r.leadTier);
    const beforeScore = Math.round(Number(r.score)) || 0;
    if (beforeTier === tier && beforeScore === score) return r;
    changed++;
    const updated = { ...r, leadTier: tier, score };
    updated.tierRationale = buildTierRationale(updated);
    return updated;
  });
  if (changed) {
    log(`Tier rules updated — re-sorted ${changed.toLocaleString()} unlocked lead${changed === 1 ? '' : 's'} (your manual picks unchanged)`, 'success');
  }
  return changed;
}

R.fetchServerSessionBackup = async function fetchServerSessionBackup() {
  if (!USE_PROXY) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    const res = await apiFetch('/api/session-backup', { signal: ctrl.signal });
    clearTimeout(timer);
    const payload = await res.json();
    if (!payload.ok || !payload.session) return null;
    return payload;
  } catch (e) {
    console.warn('Server backup fetch failed', e);
    return null;
  }
}

R.fetchSessionSummary = async function fetchSessionSummary(opts = {}) {
  if (!USE_PROXY) return null;
  const lite = opts.lite !== false;
  try {
    const summaryPath = lite ? '/api/session-summary?lite=1' : '/api/session-summary';
    const res = await apiFetch(summaryPath);
    const data = await res.json();
    return data?.ok ? data : null;
  } catch (e) {
    console.warn('Session summary fetch failed', e);
    return null;
  }
}

R.fetchSessionReviewMeta = async function fetchSessionReviewMeta() {
  if (!USE_PROXY) return null;
  try {
    const res = await apiFetch('/api/session-review-meta');
    const data = await res.json();
    return data?.ok ? data : null;
  } catch (e) {
    console.warn('Session review meta fetch failed', e);
    return null;
  }
}

R.applySessionReviewMeta = function applySessionReviewMeta(meta) {
  if (!meta) return false;
  let changed = false;
  if (meta.reviewProgressByFilter && typeof meta.reviewProgressByFilter === 'object') {
    state.reviewProgressByFilter = meta.reviewProgressByFilter;
    changed = true;
  }
  if (meta.reviewedKeysByFilter && typeof meta.reviewedKeysByFilter === 'object') {
    state.reviewedKeysByFilter = {
      distressed: Array.isArray(meta.reviewedKeysByFilter.distressed) ? meta.reviewedKeysByFilter.distressed : [],
      well_maintained: Array.isArray(meta.reviewedKeysByFilter.well_maintained) ? meta.reviewedKeysByFilter.well_maintained : [],
      vacant: Array.isArray(meta.reviewedKeysByFilter.vacant) ? meta.reviewedKeysByFilter.vacant : [],
      review: Array.isArray(meta.reviewedKeysByFilter.review) ? meta.reviewedKeysByFilter.review : [],
      low_confidence: Array.isArray(meta.reviewedKeysByFilter.low_confidence) ? meta.reviewedKeysByFilter.low_confidence : []
    };
    changed = true;
  }
  if (sessionHasLearnedBrain(meta)) {
    applyLearnedBrainFromSession(meta, { fromBackup: true });
    changed = true;
  }
  if (changed) {
    invalidateTierCountsCache();
    updateSummaryStats();
    updateCommandBar();
  }
  return changed;
}

R.hydrateSessionReviewMeta = async function hydrateSessionReviewMeta() {
  const meta = await fetchSessionReviewMeta();
  if (!meta) return false;
  return applySessionReviewMeta(meta);
}

R.fetchSessionResultsPage = async function fetchSessionResultsPage(offset, limit = SESSION_PAGE_SIZE) {
  if (!USE_PROXY) return null;
  try {
    const res = await apiFetch(`/api/session-results?offset=${offset}&limit=${limit}`);
    const data = await res.json();
    return data?.ok ? data : null;
  } catch (e) {
    console.warn('Session results page fetch failed', e);
    return null;
  }
}

R.paintSessionResultsShell = function paintSessionResultsShell() {
  mainWorkspace?.classList.add('visible');
  if (state.viewMode === 'cards' && shouldUseVirtualScroll()) {
    renderVirtualCards();
  } else if (state.results.length) {
    renderResults({ force: true });
  }
  resultsUiRendered = true;
  updateExportButtons();
}

R.loadSessionResultsFirstPage = async function loadSessionResultsFirstPage(expectedTotal, pagePromise = null) {
  if (!USE_PROXY || !expectedTotal || state.results.length) return 0;
  const page = pagePromise
    ? await pagePromise
    : await fetchSessionResultsPage(0, getSessionFirstPageSize());
  if (!page?.results?.length) return 0;
  state.results.push(...page.results);
  sessionLoadState.loaded = state.results.length;
  sessionLoadState.total = expectedTotal;
  invalidateTierCountsCache();
  invalidateFilteredResultsCache();
  invalidateResultKeyIndex?.();
  updateSummaryStats({ light: true });
  updateResultCountLabel();
  updateScannedCountUi?.();
  paintSessionResultsShell();
  return page.results.length;
}

R.abortSessionBackgroundLoad = function abortSessionBackgroundLoad() {
  sessionLoadGeneration++;
  sessionLoadState.loading = false;
}

R.markSessionResultsReady = function markSessionResultsReady() {
  abortSessionBackgroundLoad();
  const n = state.results.length;
  sessionLoadState.loaded = n;
  sessionLoadState.total = n;
  sessionLoadState.complete = true;
}

R.loadSessionResultsBackground = async function loadSessionResultsBackground(expectedTotal) {
  if (sessionLoadState.loading) return;
  const target = Math.max(
    Number(expectedTotal) || 0,
    sessionLoadState.serverCanonical || 0,
    sessionLoadState.total || 0
  );
  if (sessionLoadState.complete && target > 0 && state.results.length >= target) return;
  const generation = sessionLoadGeneration;
  sessionLoadState.loading = true;
  sessionLoadState.total = target || sessionLoadState.total;
  let offset = state.results.length;
  let emptyStreak = 0;
  while (offset < sessionLoadState.total) {
    if (generation !== sessionLoadGeneration) break;
    const page = await fetchSessionResultsPage(offset, SESSION_PAGE_SIZE);
    if (!page?.results?.length) {
      emptyStreak++;
      if (emptyStreak >= 3) break;
      await yieldToMain();
      continue;
    }
    emptyStreak = 0;
    state.results.push(...page.results);
    offset += page.results.length;
    sessionLoadState.loaded = state.results.length;
    invalidateFilteredResultsCache();
    invalidateTierCountsCache();
    updateResultCountLabel();
    updateScannedCountUi?.();
    const pageNum = Math.floor(offset / SESSION_PAGE_SIZE);
    if (pageNum === 0 || pageNum % 2 === 0 || !page.hasMore) {
      updateSummaryStats({ light: true });
    }
    updateSessionSaveStatus();
    if (!sessionLoadState.complete && state.results.length >= getDisplayCap()) {
      if (isAnalyzeLayout()) {
        updateResultCountLabel();
      } else if (state.viewMode === 'cards' && shouldUseVirtualScroll()) {
        renderVirtualCards();
      } else {
        renderResults({ force: true });
      }
    }
    if (cardsVirtualWindow) {
      const el = cardsVirtualWindow.querySelector('.session-load-indicator');
      if (el) el.textContent = `Loading results… ${sessionLoadState.loaded.toLocaleString()} / ${sessionLoadState.total.toLocaleString()}`;
    }
    await yieldToMain();
    if (!page.hasMore) break;
  }
  sessionLoadState.loading = false;
  sessionLoadState.complete = sessionLoadState.total > 0
    ? state.results.length >= sessionLoadState.total
    : state.results.length > 0;
  if (!sessionLoadState.complete && sessionLoadState.total > state.results.length) {
    console.warn(`[Session] Background load incomplete: ${state.results.length} / ${sessionLoadState.total}`);
    setTimeout(() => {
      if (!sessionLoadState.complete && !sessionLoadState.loading) {
        loadSessionResultsBackground(sessionLoadState.total);
      }
    }, 3000);
  } else {
    sessionDirty = false;
    flushPendingServerSave('session-ready');
  }
  updateSessionSaveStatus();
  invalidateTierCountsCache();
  delete state._tierCountsFromServer;
  if (isAnalyzeLayout() && resultsUiRendered) {
    updateResultCountLabel();
    updateSummaryStats({ full: true });
    refreshAllCardThumbs?.();
  } else if (state.viewMode === 'cards' && shouldUseVirtualScroll()) {
    renderVirtualCards();
  } else {
    renderResults({ force: true });
  }
  cardsVirtualWindow?.querySelector('.session-load-indicator')?.remove();
  updateExportButtons();
}

R.applySessionSummary = async function applySessionSummary(summary) {
  initVirtualScroll();
  lastSessionSaveAt = Number(summary.savedAt) || Date.now();
  lastSessionSaveError = null;
  state.records = [];
  state.results = [];
  // Large sessions load results in pages; records load separately so Start Scan still works.
  state._expectedRecords = Number(summary.records) || 0;
  state._pendingUnscanned = Number(summary.pendingUnscanned) || 0;
  state._recordsLoadComplete = false;
  state.fileName = summary.fileName || '';
  state.processed = summary.processed || 0;
  state.filter = summary.filter || 'all';
  state.leadTypeFilter = summary.leadTypeFilter || 'all';
  state.importLeadType = normalizeLeadType(summary.importLeadType);
  state.viewMode = summary.viewMode || 'cards';
  state.reviewFilter = summary.reviewFilter || state.reviewFilter;
  state.reviewQueue = [];
  state.reviewIndex = Math.max(0, Number(summary.reviewIndex) || 0);
  state.reviewStats = summary.reviewStats && typeof summary.reviewStats === 'object'
    ? {
      kept: summary.reviewStats.kept || 0,
      changed: summary.reviewStats.changed || 0,
      deferred: summary.reviewStats.deferred || 0,
      blurred: summary.reviewStats.blurred || 0
    }
    : { kept: 0, changed: 0, deferred: 0, blurred: 0 };
  state.reviewProgressByFilter = summary.reviewProgressByFilter || {};
  state.reviewedKeysByFilter = {
    distressed: Array.isArray(summary.reviewedKeysByFilter?.distressed) ? summary.reviewedKeysByFilter.distressed : [],
    well_maintained: Array.isArray(summary.reviewedKeysByFilter?.well_maintained) ? summary.reviewedKeysByFilter.well_maintained : [],
    vacant: Array.isArray(summary.reviewedKeysByFilter?.vacant) ? summary.reviewedKeysByFilter.vacant : [],
    review: Array.isArray(summary.reviewedKeysByFilter?.review) ? summary.reviewedKeysByFilter.review : [],
    low_confidence: Array.isArray(summary.reviewedKeysByFilter?.low_confidence) ? summary.reviewedKeysByFilter.low_confidence : []
  };
  state._summarySavedAt = Number(summary.savedAt) || 0;
  state.reviewActionsSinceCheckpoint = Math.max(0, Number(summary.reviewActionsSinceCheckpoint) || 0);
  state.lastReviewCheckpointAt = Number(summary.lastReviewCheckpointAt) || 0;
  state.totalReviewCheckpoints = Math.max(0, Number(summary.totalReviewCheckpoints) || 0);
  state._tierCountsFromServer = summary.tierCounts
    ? normalizeTierCountsForDisplay(summary.tierCounts, summary.results || 0)
    : null;
  sessionLoadState = {
    complete: false,
    loading: false,
    loaded: 0,
    total: summary.results || 0,
    serverCanonical: summary.results || sessionLoadState.serverCanonical || 0
  };

  const recordCount = Number(summary.records) || 0;
  if (recordCount) {
    if (heroCount) heroCount.textContent = recordCount.toLocaleString();
    fileInfo.textContent = summary.fileName
      ? `✓ ${summary.fileName} — ${recordCount.toLocaleString()} rows (restored)`
      : `✓ ${recordCount.toLocaleString()} rows restored`;
    fileInfo.classList.add('visible');
  }

  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === state.filter);
  });
  initLeadTypeSelects();
  setViewMode(state.viewMode, false);
  updateProgress();
  updateSummaryStats();
  updateExportButtons();
  summarySection.classList.add('visible');
  progressSection.classList.add('review-minimal');
  if (state.processed > 0) progressSection.classList.add('active');
  state.appView = summary.results ? 'dashboard' : 'setup';
  updateScanFeedUi();
  updateAppNav();
  updateCommandBar();
  updateStartButton();
  updateScanReadyUi?.();
  invalidateTierCountsCache();

  const brainRestore = applyLearnedBrainFromSession(summary, { fromBackup: true });
  if (brainRestore.migrated && brainRestore.needsServerPush) {
    requestServerSave('brain-migration');
  }

  if (summary.results) {
    mainWorkspace?.classList.add('visible');
  if (cardsVirtualWindow && !cardsVirtualWindow.querySelector('.session-load-indicator')) {
      const indicator = document.createElement('div');
      indicator.className = 'session-load-indicator empty-state';
      indicator.style.gridColumn = '1 / -1';
      indicator.textContent = `Loading results… 0 / ${summary.results.toLocaleString()}`;
      cardsVirtualWindow.appendChild(indicator);
    }
  }
}

/**
 * Load import/scan-queue records for large sessions (summary path clears state.records).
 * mode=unscanned loads only leads not already analyzed — enough for Start Scan.
 */
R.loadSessionRecords = async function loadSessionRecords(opts = {}) {
  if (!USE_PROXY) return { ok: false, loaded: 0 };
  const mode = opts.mode || 'unscanned';
  const pageSize = Math.min(1000, Math.max(100, Number(opts.pageSize) || 500));
  const collected = [];
  let offset = 0;
  let total = null;
  let fileName = state.fileName || '';
  let importBatches = state.importBatches || [];

  try {
    while (true) {
      const res = await apiFetch(
        `/api/session-records?mode=${encodeURIComponent(mode)}&offset=${offset}&limit=${pageSize}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`session-records HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'session-records failed');
      const page = Array.isArray(data.records) ? data.records : [];
      total = Number(data.total) || total || 0;
      if (data.fileName) fileName = data.fileName;
      if (Array.isArray(data.importBatches) && data.importBatches.length) {
        importBatches = data.importBatches;
      }
      collected.push(...page);
      offset += page.length;
      if (!page.length || !data.hasMore || (total != null && offset >= total)) break;
      // Yield so UI stays responsive during multi-page load
      await new Promise((r) => setTimeout(r, 0));
    }

    // Merge with any records already present (avoid wiping mid-import)
    if (mode === 'unscanned' || mode === 'pending') {
      // For scan queue: use unscanned set as authoritative pending list.
      // Keep already-scanned rows out of records so Start Scan only walks pending.
      const byKey = new Map();
      for (const r of collected) {
        const k = recordKey(r);
        if (k) byKey.set(k, r);
      }
      // Preserve any local records that might be mid-session new imports
      for (const r of state.records || []) {
        const k = recordKey(r);
        if (k && !byKey.has(k)) byKey.set(k, r);
      }
      state.records = [...byKey.values()];
    } else if (!state.records.length) {
      state.records = collected;
    } else {
      const byKey = new Map((state.records || []).map((r) => [recordKey(r), r]));
      for (const r of collected) {
        const k = recordKey(r);
        if (k) byKey.set(k, r);
      }
      state.records = [...byKey.values()];
    }

    state.fileName = fileName || state.fileName;
    if (importBatches?.length) state.importBatches = importBatches;
    state._expectedRecords = Number(total) || state.records.length;
    state._pendingUnscanned = state.records.length;
    state._recordsLoadComplete = true;

    if (state.records.length) {
      if (heroCount) heroCount.textContent = state.records.length.toLocaleString();
      fileInfo.textContent = state.fileName
        ? `✓ ${state.fileName} — ${state.records.length.toLocaleString()} ready to scan`
        : `✓ ${state.records.length.toLocaleString()} leads ready to scan`;
      fileInfo.classList.add('visible');
    }

    updateStartButton();
    updateScanReadyUi?.();
    updateCommandBar?.();
    log?.(
      `Loaded ${state.records.length.toLocaleString()} unscanned lead${state.records.length === 1 ? '' : 's'} for scan`,
      'success'
    );
    return { ok: true, loaded: state.records.length, total };
  } catch (err) {
    console.warn('[session-records] load failed', err);
    state._recordsLoadComplete = false;
    log?.(`Could not load scan queue: ${err.message}`, 'error');
    return { ok: false, loaded: 0, error: err.message };
  }
};

R.ensureScanRecordsLoaded = async function ensureScanRecordsLoaded() {
  if ((state.records || []).length > 0) return true;
  if (!USE_PROXY) return false;
  const pending = Number(state._pendingUnscanned) || Number(state._expectedRecords) || 0;
  if (!pending && state._recordsLoadComplete) return false;
  setSessionRestoreBanner?.('Loading leads for scan…');
  const res = await loadSessionRecords({ mode: 'unscanned' });
  setSessionRestoreBanner?.('');
  return !!(res?.ok && (state.records || []).length);
};

R.sessionDataRank = function sessionDataRank(data) {
  if (!data) return -1;
  const results = data.resultCount ?? (data.results || []).length;
  const processed = data.processed || 0;
  const savedAt = Number(data.savedAt) || 0;
  let manualEdits = 0;
  let reviewMarks = 0;
  let leadTypes = 0;
  let blurred = 0;
  let enrichment = 0;
  let manuallyReviewedCount = 0;
  for (const r of data.results || []) {
    if (r.manualScore || r.manualOverride || r.tierLocked) manualEdits++;
    if (r.manuallyReviewed || r.reviewResolved) {
      reviewMarks++;
      if (r.manuallyReviewed) manuallyReviewedCount++;
    }
    if (r.leadType) leadTypes++;
    if (r.blurred || r.isBlurred) blurred++;
    if (Array.isArray(r.indicators) && r.indicators.length) enrichment += r.indicators.length;
  }
  const reviewQueue = (data.reviewQueue || []).length;
  const reviewIndex = Number(data.reviewIndex) || 0;
  const reviewedKeys = data.reviewedKeysByFilter || {};
  let reviewedKeyCount = 0;
  for (const k of Object.keys(reviewedKeys)) {
    const bucket = reviewedKeys[k];
    reviewedKeyCount += Array.isArray(bucket) ? bucket.length : Object.keys(bucket || {}).length;
  }
  const importLeadType = data.importLeadType ? 1 : 0;
  const progress = manualEdits + reviewMarks + reviewedKeyCount + reviewQueue + reviewIndex
    + leadTypes * 3 + blurred * 2 + enrichment + importLeadType * 5
    + manuallyReviewedCount * 2;
  return results * 1e15
    + processed * 1e9
    + progress * 1e6
    + savedAt;
}

R.stampManualEdit = function stampManualEdit(record) {
  const now = Date.now();
  record.manualEditedAt = now;
  record.analyzedAt = now;
  return record;
}

R.resolveBestSession = async function resolveBestSession() {
  const candidates = [];
  try {
    const browserCandidates = await readAllBrowserSessionCandidates();
    for (const c of browserCandidates) {
      candidates.push({ ...c, source: 'browser' });
    }
  } catch (e) {
    console.warn('Browser session read failed', e);
  }
  const backup = await fetchServerSessionBackup();
  if (backup?.session) {
    candidates.push({
      source: 'server',
      data: backup.session,
      rank: sessionDataRank(backup.session),
      savedAt: Number(backup.session.savedAt) || 0,
      file: backup.file
    });
  }
  candidates.sort((a, b) => compareSessionCandidates(a, b));
  return candidates[0] || null;
}

R.applySessionFromData = async function applySessionFromData(data, opts = {}) {
  await yieldToMain();
  lastSessionSaveAt = Number(data.savedAt) || Date.now();
  lastSessionSaveError = null;
  state.records = data.records || [];
  state.results = data.results || [];
  invalidateResultKeyIndex?.();
  state.fileName = data.fileName || '';
  state.processed = data.processed || 0;
  state.succeeded = data.succeeded || 0;
  state.skipped = data.skipped || 0;
  if (state.results.length < state.records.length && state.processed >= state.records.length) {
    state.processed = state.results.length;
  }

  const filterMigrate = {
    critical: 'distressed', hot: 'distressed', high: 'distressed',
    hot_lead: 'distressed', heavy: 'distressed', cripsy: 'distressed',
    very_light: 'distressed', verylight: 'distressed', 'very light': 'distressed',
    low: 'distressed', light: 'distressed', warm: 'distressed', fair: 'distressed', medium: 'distressed',
    wellmaintained: 'well_maintained', 'well-maintained': 'well_maintained', pristine: 'well_maintained'
  };
  state.filter = filterMigrate[data.filter] || data.filter || 'all';
  state.leadTypeFilter = data.leadTypeFilter || 'all';
  state.importLeadType = normalizeLeadType(data.importLeadType);
  state.viewMode = data.viewMode || 'cards';
  state.selectedKey = data.selectedKey || null;
  state.searchQuery = data.searchQuery || '';
  state.locationFilter = data.locationFilter || null;
  state.locationHubQuery = data.locationHubQuery || '';
  state.importBatches = Array.isArray(data.importBatches) ? data.importBatches : [];
  state.importDateFilter = Array.isArray(data.importDateFilter) ? data.importDateFilter : [];
  state.sortMode = 'newest';

  let sessionUpgraded = false;
  let repairsChangedData = false;
  const resultTotal = state.results.length;
  if (opts.fromBackup) {
    state.results = state.results.map((r, i) => hydrateResultOnLoad(r, i, resultTotal));
  } else {
    const beforeRepairSig = sessionResultsSig(state.results);
    state.results = state.results.map((r, i) => hydrateResultOnLoad(r, i, resultTotal));
    state.results = repairFalseFetchFailures(state.results);
    await yieldToMain();
    state.results = migrateLegacyFetchFailedResults(state.results);
    state.results = repairIncompleteImageryResults(state.results);
    if (state.filter === 'fetch_failed') state.filter = 'review';
    await yieldToMain();
    state.results = repairMisclassifiedResults(state.results);
    state.results = migrateImageryFailuresToBlurred(state.results);
    state.results = migrateLightTierToDistressed(state.results);

    const savedSchema = Number(data.sessionSchemaVersion) || 1;
    if (savedSchema < SESSION_SCHEMA_VERSION) {
      if (savedSchema < 5) migrateLeadTypes();
      applySessionTierSchemaUpgrade();
      sessionUpgraded = true;
    }
    repairsChangedData = beforeRepairSig !== sessionResultsSig(state.results);
  }

  const brainRestore = applyLearnedBrainFromSession(data, { fromBackup: !!opts.fromBackup });
  if (brainRestore.migrated) {
    sessionUpgraded = true;
    if (brainRestore.needsServerPush) repairsChangedData = true;
  }

  if (state.records.some(r => !r.leadType) || state.results.some(r => !r.leadType)) {
    migrateLeadTypes();
    repairsChangedData = true;
  }

  state.setupCollapsed = !!data.setupCollapsed;
  state.reviewFilter = data.reviewFilter || state.reviewFilter;
  state.reviewQueue = Array.isArray(data.reviewQueue) ? data.reviewQueue : [];
  state.reviewIndex = Math.max(0, parseInt(data.reviewIndex, 10) || 0);
  state.reviewStats = data.reviewStats && typeof data.reviewStats === 'object'
    ? {
      kept: data.reviewStats.kept || 0,
      changed: data.reviewStats.changed || 0,
      deferred: data.reviewStats.deferred || 0,
      blurred: data.reviewStats.blurred || 0
    }
    : { kept: 0, changed: 0, deferred: 0, blurred: 0 };
  state.reviewUndoStack = Array.isArray(data.reviewUndoStack) ? data.reviewUndoStack : [];
  state.reviewProgressByFilter = data.reviewProgressByFilter && typeof data.reviewProgressByFilter === 'object'
    ? data.reviewProgressByFilter
    : {};
  state.reviewedKeysByFilter = {
    distressed: Array.isArray(data.reviewedKeysByFilter?.distressed) ? data.reviewedKeysByFilter.distressed : [],
    well_maintained: Array.isArray(data.reviewedKeysByFilter?.well_maintained) ? data.reviewedKeysByFilter.well_maintained : [],
    vacant: Array.isArray(data.reviewedKeysByFilter?.vacant) ? data.reviewedKeysByFilter.vacant : [],
    review: Array.isArray(data.reviewedKeysByFilter?.review) ? data.reviewedKeysByFilter.review : [],
    low_confidence: Array.isArray(data.reviewedKeysByFilter?.low_confidence) ? data.reviewedKeysByFilter.low_confidence : []
  };
  state.reviewActionsSinceCheckpoint = Math.max(0, Number(data.reviewActionsSinceCheckpoint) || 0);
  state.lastReviewCheckpointAt = Number(data.lastReviewCheckpointAt) || 0;
  state.totalReviewCheckpoints = Math.max(0, Number(data.totalReviewCheckpoints) || 0);
  state.reviewMode = false;
  const savedView = ['setup', 'dashboard', 'scan', 'property'].includes(data.appView) ? data.appView : null;
  resultSearch.value = state.searchQuery;
  if (locationHubSearch) locationHubSearch.value = state.locationHubQuery || '';
  if (state.records.length) {
    if (heroCount) heroCount.textContent = state.records.length.toLocaleString();
    fileInfo.textContent = state.fileName
      ? `✓ ${state.fileName} — ${state.records.length.toLocaleString()} rows (restored)`
      : `✓ ${state.records.length.toLocaleString()} rows restored`;
    fileInfo.classList.add('visible');
  }

  syncResultCounters();

  if (state.results.length) {
    updateExportButtons();
    summarySection.classList.add('visible');
    progressSection.classList.add('review-minimal');
    if (state.processed > 0) progressSection.classList.add('active');
    collapseSetup(!!state.setupCollapsed);
  }

  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === state.filter);
  });
  initLeadTypeSelects();
  setViewMode(state.viewMode, false);

  updateProgress();
  updateSummaryStats();
  let restoredView = savedView;
  if (restoredView === 'scan' || restoredView === 'property') {
    restoredView = state.results.length ? 'dashboard' : 'setup';
  }

  if (state.results.length) {
    const sel = state.results.find(r => recordKey(r) === state.selectedKey);
    state.appView = 'dashboard';
    updateScanFeedUi();
    updateAppNav();
    if (sel) {
      const pick = sel;
      requestAnimationFrame(() => {
        if (!state.results.length) return;
        showInspector(pick, { scrollList: false, animateGauge: false });
      });
    } else {
      state.selectedKey = null;
    }
  } else {
    state.appView = state.records.length ? 'dashboard' : 'setup';
    updateScanFeedUi();
    updateAppNav();
  }
  updateCommandBar();
  scheduleDeferredSessionSeeding();
  updateStartButton();
  invalidateTierCountsCache();
  updateSessionSaveStatus();
  return { sessionUpgraded, repairsChangedData };
}

R.restoreServerSessionBackup = async function restoreServerSessionBackup(opts = {}) {
  const backup = await fetchServerSessionBackup();
  if (!backup?.session?.results?.length) return false;
  setSessionRestoreBanner(`Restoring backup — ${backup.results.toLocaleString()} analyzed properties…`);
  await applySessionFromData(backup.session, { fromBackup: true });
  sessionDirty = true;
  flushSaveSession({ sync: true });
  log(`Restored ${backup.results.toLocaleString()} analyzed / ${backup.records.toLocaleString()} total rows from ${backup.file}`, 'success');
  setSessionRestoreBanner('');
  return true;
}

R.primeSessionFromLocalStorage = function primeSessionFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data?.serverAuthoritative && !(data.results || []).length) {
      state.fileName = data.fileName || '';
      state.processed = data.processed || 0;
      state.filter = data.filter || 'all';
      state._tierCountsFromServer = data.tierCounts
        ? normalizeTierCountsForDisplay(data.tierCounts, data.resultCount || 0)
        : null;
      sessionLoadState.total = data.resultCount || 0;
      sessionLoadState.serverCanonical = Math.max(sessionLoadState.serverCanonical || 0, data.resultCount || 0);
      if (data.recordCount) {
        updateScannedCountUi?.();
        fileInfo.textContent = data.fileName
          ? `✓ ${data.fileName} — ${data.recordCount.toLocaleString()} rows`
          : `✓ ${data.recordCount.toLocaleString()} rows`;
        fileInfo.classList.add('visible');
      }
      if (sessionLoadState.total) {
        summarySection?.classList.add('visible');
        progressSection?.classList.add('review-minimal');
      }
      updateCommandBar();
      updateStartButton();
      return true;
    }
    if (!data?.records?.length && !data?.results?.length) return false;
    const resultCount = data.resultCount ?? (data.results || []).length;
    if (resultCount > 0 && resultCount < 8000) return false;
    if (USE_PROXY && resultCount >= 8000) {
      state.records = [];
      state.results = [];
      state.fileName = data.fileName || '';
      state.processed = data.processed || 0;
      state.filter = data.filter || 'all';
      state._tierCountsFromServer = data.tierCounts
        ? normalizeTierCountsForDisplay(data.tierCounts, resultCount)
        : null;
      sessionLoadState.total = resultCount;
      sessionLoadState.serverCanonical = Math.max(sessionLoadState.serverCanonical || 0, resultCount);
      const recordCount = Number(data.recordCount ?? data.records?.length) || 0;
      if (recordCount) {
        updateScannedCountUi?.();
        fileInfo.textContent = data.fileName
          ? `✓ ${data.fileName} — ${recordCount.toLocaleString()} rows`
          : `✓ ${recordCount.toLocaleString()} rows`;
        fileInfo.classList.add('visible');
      }
      if (sessionLoadState.total) {
        summarySection?.classList.add('visible');
        progressSection?.classList.add('review-minimal');
        if (state.processed > 0) progressSection?.classList.add('active');
      }
      updateCommandBar();
      updateStartButton();
      return true;
    }
    state.records = data.records || [];
    state.results = data.results || [];
    state.fileName = data.fileName || '';
    state.processed = data.processed || 0;
    state.succeeded = data.succeeded || state.results.length;
    if (state.records.length) {
      if (heroCount) heroCount.textContent = state.records.length.toLocaleString();
      fileInfo.textContent = state.fileName
        ? `✓ ${state.fileName} — ${state.records.length.toLocaleString()} rows`
        : `✓ ${state.records.length.toLocaleString()} rows`;
      fileInfo.classList.add('visible');
    }
    if (state.results.length) {
      summarySection?.classList.add('visible');
      progressSection?.classList.add('review-minimal');
      if (state.processed > 0) progressSection?.classList.add('active');
      updateExportButtons();
    }
    updateCommandBar();
    updateStartButton();
    return true;
  } catch (_) {
    return false;
  }
}

R.applyPayloadWithUi = async function applyPayloadWithUi(data, opts = {}) {
  const usedServer = opts.fromBackup || opts.source === 'server';
  const { sessionUpgraded, repairsChangedData } = await applySessionFromData(data, { fromBackup: usedServer });
  const expected = expectedServerResultCount();
  sessionLoadState.loaded = state.results.length;
  sessionLoadState.total = Math.max(state.results.length, expected);
  sessionLoadState.complete = !expected || state.results.length >= expected;
  if (USE_PROXY && expected > state.results.length) {
    loadSessionResultsBackground(expected);
  }
  if (sessionUpgraded || repairsChangedData) {
    requestServerSave('session-upgrade');
  }
  updateCommandBar();
  updateStartButton();
  if (state.results.length) {
    mainWorkspace?.classList.add('visible');
    updateSummaryStats({ full: true });
    setSessionRestoreBanner(`Loaded ${state.results.length.toLocaleString()} properties — rendering cards…`);
    renderResultsProgressive().then(() => setSessionRestoreBanner('')).catch(() => setSessionRestoreBanner(''));
  }
  return { sessionUpgraded, repairsChangedData };
}

R.loadSession = async function loadSession() {
  setSessionRestoreBanner('Loading your data…');
  try {
    let summary = null;
    if (USE_PROXY) {
      summary = await fetchSessionSummary();
      if (summary?.results) {
        sessionLoadState.serverCanonical = summary.results;
      }
    }
    if (summary?.results) {
      const firstPagePromise = fetchSessionResultsPage(0, getSessionFirstPageSize());
      await applySessionSummary(summary);
      const browserCandidates = await readAllBrowserSessionCandidates();
      const browserBest = browserCandidates[0] || null;
      if (browserBest?.data && mergeBrowserReviewMetadata(browserBest.data)) {
        sessionDirty = true;
        if (typeof pushReviewMetadataToServer === 'function') {
          pushReviewMetadataToServer('review-metadata-merge', { immediate: true });
        } else {
          requestServerSave('review-metadata-merge');
        }
      }
      // Load unscanned import queue so Ready to scan / Start Scan work on large sessions
      const pendingHint = Number(summary.pendingUnscanned) || Number(summary.records) || 0;
      if (pendingHint > 0) {
        setSessionRestoreBanner(
          `Loading ${pendingHint.toLocaleString()} unscanned leads for scan…`
        );
        await loadSessionRecords({ mode: 'unscanned' });
      }
      setSessionRestoreBanner(`Loaded ${summary.results.toLocaleString()} properties — loading results…`);
      await loadSessionResultsFirstPage(summary.results, firstPagePromise);
      loadSessionResultsBackground(summary.results);
      hydrateSessionReviewMeta().catch((e) => console.warn('Review meta hydrate failed', e));
      if (!sessionDirty) sessionDirty = false;
      if (window.DistressPersistence) {
        DistressPersistence.saveNow('restore', { urgent: true, localOnly: true });
      }
      updateScanReadyUi?.();
      return;
    }
    const best = window.DistressPersistence
      ? await DistressPersistence.resolveBestSession()
      : await resolveBestSession();
    if (!best?.data) {
      setSessionRestoreBanner('');
      return;
    }
    const browserCount = (best.data.results || []).length;
    if (summary?.results && browserCount < summary.results) {
      await applySessionSummary(summary);
      setSessionRestoreBanner(`Syncing ${browserCount.toLocaleString()} local → ${summary.results.toLocaleString()} server results…`);
      if (browserCount > 0) {
        state.results = best.data.results || [];
        state.records = best.data.records || state.records;
        sessionLoadState.loaded = state.results.length;
        paintSessionResultsShell();
      }
      loadSessionResultsBackground(summary.results);
      sessionDirty = false;
      return;
    }
    const browserCandidates = await readAllBrowserSessionCandidates();
    const browserBest = browserCandidates[0] || null;
    await applyPayloadWithUi(best.data, { fromBackup: best.source === 'server', source: best.source });
    if (window.DistressPersistence) {
      DistressPersistence.notifyRestore(best);
    } else if (best.source === 'server' && compareSessionCandidates(best, browserBest || { rank: -1 }) < 0) {
      const n = (best.data.results || []).length;
      log(`Recovered ${n.toLocaleString()} analyzed properties from server backup (${best.file || 'LATEST'})`, 'success');
    }
    if (!browserBest || compareSessionCandidates(best, browserBest) < 0) {
      sessionDirty = true;
      const mirrorLocalOnly = best.source === 'server';
      if (window.DistressPersistence) {
        DistressPersistence.saveNow('restore', { urgent: true, localOnly: mirrorLocalOnly });
      } else {
        flushSaveSession({ sync: true, force: true, reason: 'restore', localOnly: mirrorLocalOnly });
      }
    }
  } catch (e) {
    console.warn('Failed to load session', e);
    const restored = await restoreServerSessionBackup({ auto: true });
    if (!restored) {
      setSessionRestoreBanner('Could not restore saved session — click Restore my last scan below.', true);
    }
  } finally {
    resetBlockingUiOnLoad();
    setSessionRestoreBanner('');
    updateCommandBar();
    updateStartButton();
  }
}

R.scheduleDeferredSessionMigration = function scheduleDeferredSessionMigration() {
  const run = () => {
    try {
      let migrated = migrateManuallyReviewedFlags();
      if (typeof purgeGhostReviewedKeys === 'function' && purgeGhostReviewedKeys()) {
        migrated = true;
      }
      if (typeof backfillReviewedKeysFromResults === 'function' && backfillReviewedKeysFromResults()) {
        migrated = true;
      }
      if (typeof repairReviewResolvedRecords === 'function' && repairReviewResolvedRecords()) {
        migrated = true;
      }
      if (migrated) {
        sessionDirty = true;
        scheduleSaveSession();
      }
    } catch (e) {
      console.warn('Deferred session migration failed', e);
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 50);
  }
}

R.clearSession = function clearSession() {
  abortSessionBackgroundLoad();
  sessionLoadState = { complete: false, loading: false, loaded: 0, total: 0, serverCanonical: 0 };
  localStorage.removeItem(STORAGE_KEY);
  openSessionIdb().then((db) => {
    const tx = db.transaction(SESSION_IDB_STORE, 'readwrite');
    tx.objectStore(SESSION_IDB_STORE).delete(STORAGE_KEY);
  }).catch(() => {});
  lastSessionSaveAt = 0;
  lastSessionSaveError = null;
  lastSessionSaveRejected = false;
  sessionDirty = false;
  invalidateTierCountsCache();
  invalidateDistressedRankMap();
  pipelineMetricsSig = '';
  state.reviewMode = false;
  state.reviewFilter = 'all';
  state.reviewQueue = [];
  state.reviewIndex = 0;
  state.reviewUndoStack = [];
  state.reviewStats = { kept: 0, changed: 0, deferred: 0 };
  state.reviewProgressByFilter = {};
  state.reviewedKeysByFilter = { distressed: [], well_maintained: [], vacant: [], review: [], low_confidence: [] };
  state.reviewActionsSinceCheckpoint = 0;
  state.lastReviewCheckpointAt = 0;
  state.totalReviewCheckpoints = 0;
  closeAllToolModals();
  setBulkSelectMode(false);
  state.records = [];
  state.results = [];
  state.fileName = '';
  state.processed = 0;
  state.succeeded = 0;
  state.skipped = 0;
  state.failStreetView = 0;
  state.failGemini = 0;
  state.haltAlertShown = false;
  state.selectedKey = null;
  state.searchQuery = '';
  state.locationFilter = null;
  state.locationHubQuery = '';
  state.sortMode = 'newest';
  state.leadTypeFilter = 'all';
  state.importLeadType = DEFAULT_LEAD_TYPE;
  state.setupCollapsed = false;
  state.appView = 'setup';
  initLeadTypeSelects();
  resultSearch.value = '';
  collapseSetup(false);
  progressSection.classList.remove('review-minimal');
  $('failStats').classList.remove('visible');
  firstErrorShown = false;
  errorBanner.classList.remove('visible');
  errorBanner.innerHTML = '';
  resetScanIssueState();
  fileInput.value = '';
  if (heroCount) heroCount.textContent = '—';
  fileInfo.textContent = '';
  fileInfo.classList.remove('visible');
  updateExportButtons();
  summarySection.classList.remove('visible');
  progressSection.classList.remove('active');
  progressBar.style.width = '0%';
  $('progressPct').textContent = '0%';
  $('statDone').textContent = '0';
  $('statRemaining').textContent = '0';
  $('statTotal').textContent = '0';
  $('statBatch').textContent = '0';
  $('statSuccess').textContent = '0';
  $('statSkipped').textContent = '0';
  $('statAvg').textContent = '—';
  updateGauge(null);
  updateGauge(null, false, 'scan');
  state.propertyModalOpen = false;
  propertyModal?.classList.remove('open');
  if (propertyModal) propertyModal.hidden = true;
  document.body.classList.remove('property-modal-open');
  document.body.style.overflow = '';
  setHudStatus('STANDBY');
  resetVirtualScrollDom();
  cardsGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">◎</div>Results appear here — newest uploads at the top</div>';
  resultsBody.innerHTML = '<tr><td colspan="13" class="empty-state">No results</td></tr>';
  $('resultCount').textContent = '';
  updateSummaryStats();
  updateStartButton();
  updateScanFeedUi();
  updateAppNav();
  updateCommandBar();
}

R.toolModalOverflowLocked = function toolModalOverflowLocked() {
  return state.propertyModalOpen
    || scoreEditModal?.classList.contains('open')
    || imageLightbox.classList.contains('open')
    || state.reviewMode;
}

R.syncToolModalOverflow = function syncToolModalOverflow() {
  if (openToolModalId && !toolModalOverflowLocked()) {
    document.body.style.overflow = 'hidden';
  } else if (!toolModalOverflowLocked()) {
    document.body.style.overflow = '';
  }
}

R.getToolModals = function getToolModals() {
  return [settingsModal, uploadModal, brainModal, $('apiUsageModal')].filter(Boolean);
}

R.openToolModal = function openToolModal(modalEl) {
  if (!modalEl) return;
  if (modalEl.id === 'brainModal') renderLearnedRulesPanel();
  if (modalEl.id === 'apiUsageModal') {
    fetchApiUsage?.();
    refreshServerStatusUi?.();
  }
  for (const m of getToolModals()) {
    if (m && m !== modalEl) m.classList.remove('open');
  }
  modalEl.classList.add('open');
  modalEl.hidden = false;
  openToolModalId = modalEl.id;
  document.body.style.overflow = 'hidden';
}

R.closeToolModal = function closeToolModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('open');
  if (modalEl.id === 'apiUsageModal') modalEl.hidden = true;
  if (openToolModalId === modalEl.id) openToolModalId = null;
  syncToolModalOverflow();
}

R.closeAllToolModals = function closeAllToolModals() {
  for (const m of getToolModals()) {
    if (m) {
      m.classList.remove('open');
      if (m.id === 'apiUsageModal') m.hidden = true;
    }
  }
  openToolModalId = null;
  syncToolModalOverflow();
}

R.openUploadModal = function openUploadModal() { openToolModal(uploadModal); }
R.openSettingsModal = function openSettingsModal() { openToolModal(settingsModal); }
R.openBrainModal = function openBrainModal() { openToolModal(brainModal); }
R.openApiUsageModal = function openApiUsageModal() { openToolModal($('apiUsageModal')); }

R.buildImportHeaderCopy = function buildImportHeaderCopy() {
  const importMeta = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.importMeta) ? PDA.lib.importMeta : null;
  const defaultTitle = 'Analyze';
  const defaultTagline = 'AI ranks Street View distress — you double-check every tier';
  const source = state.records.length ? state.records : state.results;

  if (state.running) {
    const loc = importMeta?.deriveImportLocation(state.records);
    const total = state.records.length || 0;
    const pct = total ? Math.round((state.processed / total) * 100) : 0;
    return {
      title: importMeta?.formatImportLocation(loc) || state.fileName || 'Scanning',
      tagline: total
        ? `Scanning ${pct}% — ${state.processed.toLocaleString()} of ${total.toLocaleString()} leads`
        : 'Scan in progress…',
      scanTitle: 'Scanning',
      heroCount: state.processed.toLocaleString(),
      heroLabel: total ? `of ${total.toLocaleString()} leads` : 'leads processed',
      sidebarTitle: importMeta?.formatImportLocation(loc) || 'Scanning',
      sidebarTagline: total
        ? `${state.processed.toLocaleString()} / ${total.toLocaleString()} leads`
        : 'Scan in progress'
    };
  }

  if (state.records.length) {
    const loc = importMeta?.deriveImportLocation(state.records);
    const pending = importMeta
      ? importMeta.countUnscannedLeads(state.records, state.results, recordKey)
      : state.records.length;
    const analyzed = state.results.length;
    const title = importMeta?.formatImportLocation(loc) || state.fileName || defaultTitle;
    let tagline = defaultTagline;
    let heroCount = pending.toLocaleString();
    let heroLabel = 'leads ready to scan';
    let scanTitle = title;

    if (pending > 0) {
      tagline = analyzed > 0
        ? `${pending.toLocaleString()} leads ready to scan (${analyzed.toLocaleString()} already analyzed)`
        : `${pending.toLocaleString()} leads ready to scan`;
      scanTitle = `${title} — ready to scan`;
    } else if (analyzed > 0) {
      tagline = `All ${state.records.length.toLocaleString()} leads analyzed — review results below`;
      heroCount = state.records.length.toLocaleString();
      heroLabel = 'leads analyzed';
      scanTitle = `${title} — scan complete`;
    } else {
      tagline = `${state.records.length.toLocaleString()} leads loaded — hit Start Scan`;
      scanTitle = `${title} — ready to scan`;
    }

    return {
      title,
      tagline,
      scanTitle,
      heroCount,
      heroLabel,
      sidebarTitle: title,
      sidebarTagline: tagline
    };
  }

  if (state.results.length) {
    const loc = importMeta?.deriveImportLocation(state.results);
    const title = importMeta?.formatImportLocation(loc)
      || `${state.results.length.toLocaleString()} results`;
    const tagline = 'Restored scan — review or export below';
    return {
      title,
      tagline,
      scanTitle: title,
      heroCount: state.results.length.toLocaleString(),
      heroLabel: 'properties scanned',
      sidebarTitle: title,
      sidebarTagline: tagline
    };
  }

  return {
    title: defaultTitle,
    tagline: defaultTagline,
    scanTitle: 'Scanning',
    heroCount: '—',
    heroLabel: 'properties scanned',
    sidebarTitle: defaultTitle,
    sidebarTagline: 'Rank visible distress'
  };
}

R.applyImportHeaderCopy = function applyImportHeaderCopy(copy) {
  if (!copy) return;
  if (sidebarTitle) sidebarTitle.textContent = copy.sidebarTitle;
  if (sidebarTagline) sidebarTagline.textContent = copy.sidebarTagline;
  if (scanProgressTitle) scanProgressTitle.textContent = copy.scanTitle;
}

R.updateCommandHeader = function updateCommandHeader() {
  R.applyImportHeaderCopy(R.buildImportHeaderCopy());
}

R.updateCommandBar = function updateCommandBar() {
  const hasWork = !!(state.records.length || state.results.length || state.running);
  document.body.classList.toggle('home-empty', !hasWork);
  if (!hasWork) {
    sidebarSettingsGroup?.classList.remove('open');
    sidebarManageDataGroup?.classList.remove('open');
    if (sidebarSettingsToggle) sidebarSettingsToggle.setAttribute('aria-expanded', 'false');
    if (sidebarManageDataToggle) sidebarManageDataToggle.setAttribute('aria-expanded', 'false');
  }
  mainWorkspace?.classList.add('visible');
  updateLocationHubUi?.();
  updateCommandHeader();
}


  }
  PDA.state = {
    get state() { return R.state; },
    get scoreCorrections() { return R.scoreCorrections; },
    get tierCorrections() { return R.tierCorrections; },
    get categoryCorrections() { return R.categoryCorrections; },
    get learnedRules() { return R.learnedRules; },
    get correctionEvents() { return R.correctionEvents; },
    get computeLeadTier() { return R.computeLeadTier; },
    get resultLeadTier() { return R.resultLeadTier; },
    get getTierCounts() { return R.getTierCounts; },
    get resultCategory() { return R.resultCategory; },
    get recordKey() { return R.recordKey; },
    get bulkSelectedKeys() { return R.bulkSelectedKeys; },
    get isVacantLot() { return R.isVacantLot; },
    get isBlurredImagery() { return R.isBlurredImagery; }
  };
})(window);
