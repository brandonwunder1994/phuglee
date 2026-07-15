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

/** Coarser key (street + city + state) when zip differs between lists. */
R.addressMatchKeyLoose = function addressMatchKeyLoose(r) {
  const full = addressMatchKey(r);
  if (!full) return '';
  const parts = full.split('|');
  if (parts.length <= 3) return full;
  return parts.slice(0, 3).join('|');
}

/**
 * Build known address key sets from local results + optional server index payload.
 * @returns {{ exact: Set, loose: Set }}
 */
R.buildKnownAddressSets = function buildKnownAddressSets(results = [], index = null) {
  const exact = new Set();
  const loose = new Set();
  const addRow = (row) => {
    const k = addressMatchKey(row);
    if (k) exact.add(k);
    const l = addressMatchKeyLoose(row);
    if (l) loose.add(l);
  };
  for (const r of results || []) addRow(r);
  if (index) {
    // Scanned-only keys. Never merge:
    // - index.addresses (Filter bag; historically included queue match-keys)
    // - index.matchKeysWithQueue (would block replace-queue re-uploads)
    for (const k of index.matchKeys || []) if (k) exact.add(k);
    for (const k of index.matchKeysLoose || []) if (k) loose.add(k);
  }
  return { exact, loose };
}

/**
 * Scan-desk import index: scanned results only (safe for replace-queue uploads).
 * Strips queue-inflated fields so accidental merges cannot shrink the batch.
 */
R.scannedOnlyAddressIndex = function scannedOnlyAddressIndex(index) {
  if (!index || typeof index !== 'object') return null;
  return {
    ok: index.ok,
    matchKeys: Array.isArray(index.matchKeys) ? index.matchKeys : [],
    matchKeysLoose: Array.isArray(index.matchKeysLoose) ? index.matchKeysLoose : [],
    resultsCount: index.resultsCount,
    recordsCount: index.recordsCount
  };
}

/** True when row matches a known scanned address (exact or loose-without-zip). */
R.isRowAlreadyKnown = function isRowAlreadyKnown(row, known) {
  const exact = known?.exact instanceof Set ? known.exact : new Set();
  const loose = known?.loose instanceof Set ? known.loose : new Set();
  const k = addressMatchKey(row);
  if (k && exact.has(k)) return true;
  const l = addressMatchKeyLoose(row);
  if (l && loose.has(l) && !String(row.postal || row.zip || '').trim()) return true;
  return false;
}

/** True if this lead already exists among scanned results (address-level). */
R.isAlreadyScannedAddress = function isAlreadyScannedAddress(row, results) {
  return isRowAlreadyKnown(row, buildKnownAddressSets(results));
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
  if (r.manualScore || r.manualOverride || r.reviewResolved) return true;
  if (!r.manuallyReviewed) return false;
  const via = String(r.manuallyReviewedVia || '');
  if (via === 'review_session' || via === 'review_skip' || via === 'review_missing') return false;
  return true;
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
    // Do NOT promote reviewedKeysByFilter → manuallyReviewed. Bucket keys are progress
    // markers and historically caused entire review queues to look "already checked".
    state.results = state.results.map((r) => {
      if (r.manuallyReviewed) return r;
      if (r.manualScore || r.manualOverride || r.reviewResolved) {
        changed++;
        const via = r.manualScore ? 'tier_edit' : 'category_change';
        return markRecordManuallyReviewed(r, via);
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
  // Mid-scan: always allow server saves so Stop + refresh keeps progress.
  // Partial hydration only blocks idle saves (avoids clobbering server with a stub).
  if (state.running) return true;
  if (sessionLoadState.loading) return false;
  const expected = expectedServerResultCount();
  if (expected > 0 && state.results.length < expected) return false;
  return true;
}

/**
 * Pending leads on the current import queue that are not yet in results.
 * Matches Start Scan dedupe: recordKey OR addressMatchKey.
 */
R.countPendingScanLeads = function countPendingScanLeads(records = state.records, results = state.results) {
  if (!Array.isArray(records) || !records.length) return 0;
  const existingKeys = new Set();
  for (const r of results || []) {
    if (typeof recordKey === 'function') existingKeys.add(recordKey(r));
  }
  const known = typeof buildKnownAddressSets === 'function'
    ? buildKnownAddressSets(results, state._serverAddressIndex)
    : { exact: new Set(), loose: new Set() };
  let n = 0;
  for (const r of records) {
    if (r?.forceRescan) {
      n += 1;
      continue;
    }
    if (typeof recordKey === 'function' && existingKeys.has(recordKey(r))) continue;
    if (typeof isRowAlreadyKnown === 'function' && isRowAlreadyKnown(r, known)) continue;
    n += 1;
  }
  return n;
};

/** Fetch authoritative scanned-address index from server (full DB, not partial browser pages). */
R.fetchServerAddressIndex = async function fetchServerAddressIndex() {
  if (!USE_PROXY || typeof apiFetch !== 'function') return null;
  try {
    const res = await apiFetch('/api/import-address-index', { cache: 'no-store' });
    if (!res.ok) return null;
    const idx = await res.json();
    if (!idx?.ok) return null;
    state._serverAddressIndex = idx;
    return idx;
  } catch (err) {
    console.warn('[import] address index fetch failed', err);
    return null;
  }
};

/** Force a durable save of scan progress (stop, batch end, complete). */
R.persistScanProgressNow = function persistScanProgressNow(reason = 'scan-progress') {
  try {
    state.processed = (state.results || []).length;
    sessionDirty = true;
    if (typeof pushScanSessionMeta === 'function') pushScanSessionMeta();
    if (typeof flushSaveSession === 'function') {
      flushSaveSession({ sync: true, force: true, reason });
    } else if (typeof requestServerSave === 'function') {
      requestServerSave(reason);
    }
  } catch (e) {
    console.warn('[scan] persistScanProgressNow failed', e);
  }
};

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

/** Wipe browser-only session mirrors so the next load trusts the server queue. */
R.clearBrowserSessionCache = async function clearBrowserSessionCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
  try {
    const db = await openSessionIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_IDB_STORE, 'readwrite');
      tx.objectStore(SESSION_IDB_STORE).delete(STORAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (_) {
    /* ignore */
  }
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
    if (!r.manuallyReviewed && !r.reviewResolved && !r.manualOverride && !r.manualScore && !r.needsReviewLater && !r.satelliteOnly) continue;
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
      satelliteOnly: !!r.satelliteOnly,
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
  const attempt = (tryNumber) =>
    apiFetch('/api/scan-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        lastSessionSaveAt = Date.now();
        lastSessionSaveError = null;
        updateSessionSaveStatus?.();
        return res;
      })
      .catch((e) => {
        console.warn('Incremental scan result log failed', e);
        if (tryNumber < 2) {
          return new Promise((resolve) => setTimeout(resolve, 400)).then(() => attempt(tryNumber + 1));
        }
        lastSessionSaveError = e?.message || 'Scan save failed';
        updateSessionSaveStatus?.();
        if (typeof notifyScanIssue === 'function') {
          notifyScanIssue(
            'fatal',
            'Scan results are not saving to the server. Stop and check your connection before continuing — Gemini/Maps credits may be wasted.',
            {
              title: 'Save failed — results at risk',
              tier: 'error',
              browserNotify: true,
              dedupeKey: 'scan-result-save-failed'
            }
          );
        }
        throw e;
      });
  return attempt(1);
}

R.pushScanSessionMeta = function pushScanSessionMeta() {
  if (!USE_PROXY) return;
  const processed = typeof getTotalScannedCount === 'function'
    ? getTotalScannedCount()
    : (state.results || []).length;
  const body = JSON.stringify({
    type: 'meta',
    records: state.records.length,
    processed,
    fileName: state.fileName || '',
    savedAt: Date.now()
  });
  apiFetch('/api/scan-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  }).catch((e) => {
    console.warn('Scan meta save failed', e);
  });
}

/**
 * Lean upload persist (v3.1): push only the scan queue + batches — never the full results array.
 * Prevents tab freezes / 502s when the historical session is multi‑10MB.
 * Server re-dedupes against full results so already-scanned addresses never re-queue.
 */
R.pushScanQueueToServer = async function pushScanQueueToServer(opts = {}) {
  const reason = opts.reason || 'scan-queue';
  if (!USE_PROXY) {
    // Offline / direct mode: local stub only (skip full results stringify when huge)
    try {
      if (typeof buildSessionSummaryStub === 'function' && typeof buildSessionPayload === 'function') {
        const payload = buildSessionPayload();
        const stub = buildSessionSummaryStub(payload);
        stub.records = state.records || [];
        stub.importBatches = state.importBatches || [];
        stub.fileName = state.fileName || '';
        const json = JSON.stringify(stub);
        await idbPutSession(json).catch(() => {});
      }
    } catch (_) {}
    return { ok: true, local: true };
  }
  try {
    // Strip fat profile blobs from queue rows — scan only needs address identity fields
    const leanRecords = (state.records || []).map((r) => {
      if (!r || typeof r !== 'object') return r;
      if (!r.profile) return r;
      const { profile, ...rest } = r;
      return rest;
    });
    const body = JSON.stringify({
      replaceQueue: true,
      records: leanRecords,
      importBatches: Array.isArray(state.importBatches) ? state.importBatches : [],
      fileName: state.fileName || '',
      importLeadType: state.importLeadType || null,
      savedAt: Date.now()
    });
    const res = await apiFetch(`/api/session-scan-queue?reason=${encodeURIComponent(reason)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: body.length <= FETCH_KEEPALIVE_MAX_BYTES
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.error || `HTTP ${res.status}`, data };
    }
    // replaceQueue stores the list as uploaded — keep the local count the user just saw.
    if (data && typeof data.records === 'number') {
      const n = Math.max(0, Number(data.records) || 0);
      state._pendingUnscanned = n;
      state._serverPendingUnscanned = n;
    }
    lastSessionSaveAt = Date.now();
    lastSessionSaveError = null;
    sessionDirty = false;
    updateSessionSaveStatus?.();
    return { ok: true, data };
  } catch (e) {
    console.warn('[scan-queue] push failed', e);
    return { ok: false, error: e };
  }
};

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
    // Stubs are KPI hints only — not restorable sessions.
    if (data.serverAuthoritative === true && !(data.results || []).length) {
      return false;
    }
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
      low_confidence: Array.isArray(meta.reviewedKeysByFilter.low_confidence) ? meta.reviewedKeysByFilter.low_confidence : [],
      blurred: Array.isArray(meta.reviewedKeysByFilter.blurred) ? meta.reviewedKeysByFilter.blurred : [],
      satellite_only: Array.isArray(meta.reviewedKeysByFilter.satellite_only) ? meta.reviewedKeysByFilter.satellite_only : []
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

/**
 * Lazy-load full profile for one result. Disk stays complete; list pages omit profile.
 * Merges into state.results so later saves keep the profile in memory once opened.
 */
R.ensureResultProfile = async function ensureResultProfile(r) {
  if (!r) return r;
  if (r.profile && typeof r.profile === 'object' && !r.profileDeferred) return r;
  if (!r.profileDeferred && r.profile) return r;
  if (!USE_PROXY || typeof apiFetch !== 'function') {
    delete r.profileDeferred;
    return r;
  }
  const key = typeof recordKey === 'function' ? recordKey(r) : `${r.email || ''}|${r.phone || ''}|${r.address || ''}`;
  if (!key || key === '||') {
    delete r.profileDeferred;
    return r;
  }
  if (!state._profileFetchInflight) state._profileFetchInflight = new Map();
  if (state._profileFetchInflight.has(key)) {
    try { return await state._profileFetchInflight.get(key); } catch (_) { return r; }
  }
  const pending = (async () => {
    try {
      const res = await apiFetch(`/api/session-result-profile?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!data?.ok) {
        delete r.profileDeferred;
        return r;
      }
      if (data.profile && typeof data.profile === 'object') r.profile = data.profile;
      for (const field of ['marketValue', 'avm', 'wholesaleValue', 'county', 'ownerType', 'ownerName']) {
        if (data[field] != null && data[field] !== '' && (r[field] == null || r[field] === '')) {
          r[field] = data[field];
        }
      }
      delete r.profileDeferred;
      const idx = (state.results || []).findIndex((row) => recordKey(row) === key);
      if (idx >= 0) {
        state.results[idx] = r;
      }
      return r;
    } catch (e) {
      console.warn('[profile] ensureResultProfile failed', e);
      delete r.profileDeferred;
      return r;
    } finally {
      state._profileFetchInflight?.delete(key);
    }
  })();
  state._profileFetchInflight.set(key, pending);
  return pending;
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

/**
 * Page size for background hydration. Smaller pages = less main-thread freeze
 * when parsing multi-MB JSON chunks on large (10k+) sessions.
 */
R.getSessionBackgroundPageSize = function getSessionBackgroundPageSize() {
  if (typeof isAnalyzeLayout === 'function' && isAnalyzeLayout()) return 250;
  return Math.min(500, Number(SESSION_PAGE_SIZE) || 500);
};

R.loadSessionResultsBackground = async function loadSessionResultsBackground(expectedTotal, opts = {}) {
  if (sessionLoadState.loading) return;
  const target = Math.max(
    Number(expectedTotal) || 0,
    sessionLoadState.serverCanonical || 0,
    sessionLoadState.total || 0
  );
  if (sessionLoadState.complete && target > 0 && state.results.length >= target) return;

  // Fast first paint: wait until browser is idle before sucking down remaining 10k rows
  if (opts.deferIdle && !opts.force && target > (state.results?.length || 0) + 50) {
    const run = () => {
      if (sessionLoadState.loading || state.running) return;
      if (sessionLoadState.complete && state.results.length >= target) return;
      loadSessionResultsBackground(target, { force: true });
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => setTimeout(run, 120), { timeout: 2500 });
    } else {
      setTimeout(run, 600);
    }
    return;
  }

  const generation = sessionLoadGeneration;
  sessionLoadState.loading = true;
  sessionLoadState.total = target || sessionLoadState.total;
  let offset = state.results.length;
  let emptyStreak = 0;
  const pageSize = getSessionBackgroundPageSize();
  let pagesSinceUi = 0;
  while (offset < sessionLoadState.total) {
    if (generation !== sessionLoadGeneration) break;
    // Pause hydration while a live scan is running so Street View/Gemini stay snappy
    if (state.running) {
      sessionLoadState.loading = false;
      setTimeout(() => {
        if (!sessionLoadState.complete && !sessionLoadState.loading && !state.running) {
          loadSessionResultsBackground(sessionLoadState.total, { force: true });
        }
      }, 4000);
      return;
    }
    const page = await fetchSessionResultsPage(offset, pageSize);
    if (!page?.results?.length) {
      emptyStreak++;
      if (emptyStreak >= 3) break;
      await yieldToMain();
      continue;
    }
    emptyStreak = 0;
    // Link disk-cached photos onto newly hydrated results (index already in memory)
    if (typeof resolveImageryForResult === 'function' && typeof imageryIndexMapCache !== 'undefined' && imageryIndexMapCache) {
      for (const r of page.results) {
        try { resolveImageryForResult(r); } catch (_) {}
      }
    }
    state.results.push(...page.results);
    offset += page.results.length;
    sessionLoadState.loaded = state.results.length;
    pagesSinceUi += 1;
    // Cheap bookkeeping every page; expensive UI only every few pages
    invalidateFilteredResultsCache();
    if (pagesSinceUi >= 4 || !page.hasMore || offset >= sessionLoadState.total) {
      pagesSinceUi = 0;
      updateResultCountLabel();
      updateScannedCountUi?.();
      updateSessionSaveStatus();
      if (cardsVirtualWindow) {
        const el = cardsVirtualWindow.querySelector('.session-load-indicator');
        if (el) {
          el.textContent =
            `Loading results… ${sessionLoadState.loaded.toLocaleString()} / ${sessionLoadState.total.toLocaleString()}`;
        }
      }
    }
    // Yield longer on large sessions so click handlers (Start Scan) stay responsive
    const yieldMs = target > 3000 ? 24 : 0;
    if (yieldMs) await new Promise((r) => setTimeout(r, yieldMs));
    else await yieldToMain();
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
        loadSessionResultsBackground(sessionLoadState.total, { force: true });
      }
    }, 3000);
  } else {
    sessionDirty = false;
    // Large sessions: server is authoritative — avoid multi-10MB IDB rewrite on every restore
    if ((state.results?.length || 0) < 1500) {
      flushPendingServerSave('session-ready');
    }
  }
  updateSessionSaveStatus();
  // Full hydration done — recompute once from memory, then drop server snapshot
  if ((state.results?.length || 0) >= (sessionLoadState.total || 0) && sessionLoadState.total > 0) {
    invalidateTierCountsCache({ clearServer: true });
    updateSummaryStats({ instant: true });
    updateFilterLabels?.();
    updateLocationHubUi?.();
  }
  if (isAnalyzeLayout() && resultsUiRendered) {
    updateResultCountLabel();
    updateSummaryStats({ light: true });
  } else if (state.viewMode === 'cards' && shouldUseVirtualScroll()) {
    renderVirtualCards();
  } else if (!isAnalyzeLayout()) {
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
  state._serverPendingUnscanned = Number(summary.pendingUnscanned) || 0;
  state._recordsLoadComplete = false;
  state.fileName = summary.fileName || '';
  // processed tracks results.length on the server now — keep client in sync
  state.processed = Number(summary.results) || Number(summary.processed) || 0;
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
    low_confidence: Array.isArray(summary.reviewedKeysByFilter?.low_confidence) ? summary.reviewedKeysByFilter.low_confidence : [],
    blurred: Array.isArray(summary.reviewedKeysByFilter?.blurred) ? summary.reviewedKeysByFilter.blurred : [],
    satellite_only: Array.isArray(summary.reviewedKeysByFilter?.satellite_only) ? summary.reviewedKeysByFilter.satellite_only : []
  };
  state._summarySavedAt = Number(summary.savedAt) || 0;
  state.reviewActionsSinceCheckpoint = Math.max(0, Number(summary.reviewActionsSinceCheckpoint) || 0);
  state.lastReviewCheckpointAt = Number(summary.lastReviewCheckpointAt) || 0;
  state.totalReviewCheckpoints = Math.max(0, Number(summary.totalReviewCheckpoints) || 0);
  state._tierCountsFromServer = summary.tierCounts
    ? normalizeTierCountsForDisplay(summary.tierCounts, summary.results || 0)
    : null;
  // Geo KPIs (per-state / per-city) so Historical search totals are accurate before full load
  state._geoFromServer = summary.geo && typeof summary.geo === 'object' ? summary.geo : null;
  sessionLoadState = {
    complete: false,
    loading: false,
    loaded: 0,
    total: summary.results || 0,
    serverCanonical: summary.results || sessionLoadState.serverCanonical || 0
  };
  // Clear local tier cache only — never wipe server KPI snapshots here
  tierCountsCache = null;
  tierCountsCacheKey = '';

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
  // Instant session totals from server tierCounts (no crawl-up from partial pages)
  updateSummaryStats({ instant: true });
  updateFilterLabels?.();
  updateExportButtons();
  if (summary.results) state.resultsWorkbenchOpen = true;
  progressSection.classList.add('review-minimal');
  if (state.processed > 0) progressSection.classList.add('active');
  state.appView = summary.results ? 'dashboard' : 'setup';
  updateScanFeedUi();
  updateAppNav();
  updateCommandBar();
  updateStartButton();
  updateScanReadyUi?.();
  updateLocationHubUi?.();

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
      // Do NOT merge stale full-session records — they hide forceRescan and zero the queue UI.
      state.records = collected;
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
    // Unscanned mode: API `total` is the authoritative pending count (full disk results).
    if (mode === 'unscanned' || mode === 'pending') {
      const pendingTotal = Number(total);
      if (Number.isFinite(pendingTotal)) {
        state._serverPendingUnscanned = pendingTotal;
        state._pendingUnscanned = pendingTotal;
      } else {
        state._pendingUnscanned = state.records.length;
      }
    } else {
      state._pendingUnscanned = state.records.length;
    }
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
  const serverPending = Number(state._serverPendingUnscanned) || 0;
  const hasForce = (state.records || []).some((r) => r?.forceRescan);
  const freshImport = Number(state._freshImportAt) > 0
    && (Date.now() - Number(state._freshImportAt)) < 30 * 60 * 1000;
  // Never wipe a list the user just dropped / marked forceRescan — that left Start
  // Scan stuck on "Loading leads…" while re-paging a huge server queue.
  if ((state.records || []).length > 0 && (hasForce || freshImport)) {
    return true;
  }
  // Stale full-session records (already scanned) look non-empty but block Start Scan.
  // When the server still has a forceRescan queue, always reload mode=unscanned.
  if ((state.records || []).length > 0 && !(serverPending > 0 && !hasForce)) {
    return true;
  }
  if (!USE_PROXY) return false;
  const pending = serverPending || Number(state._pendingUnscanned) || Number(state._expectedRecords) || 0;
  if (!pending && state._recordsLoadComplete && !(serverPending > 0)) return false;
  setSessionRestoreBanner?.('Loading leads for scan…');
  state.records = [];
  const res = await loadSessionRecords({ mode: 'unscanned' });
  setSessionRestoreBanner?.('');
  return !!(res?.ok && (state.records || []).length);
};

/** Finish background result hydration before review/export (first paint stays partial). */
R.ensureSessionResultsLoaded = async function ensureSessionResultsLoaded() {
  const target = Math.max(
    Number(sessionLoadState?.total) || 0,
    Number(sessionLoadState?.serverCanonical) || 0,
    Number(state._tierCountsFromServer?.total) || 0
  );
  if (!USE_PROXY) return true;
  if (sessionLoadState?.complete && (!target || state.results.length >= target)) return true;
  if (!target && state.results.length) return true;
  setSessionRestoreBanner?.('Loading remaining results…');
  await loadSessionResultsBackground(target || sessionLoadState?.total || state.results.length, { force: true });
  setSessionRestoreBanner?.('');
  return !!(sessionLoadState?.complete || state.results.length);
};

R.sessionDataRank = function sessionDataRank(data) {
  if (!data) return -1;
  // Server-authoritative stubs store resultCount but empty results[] — never treat
  // that count as real scan data or stubs beat the server after reload.
  const stubEmpty =
    data.serverAuthoritative === true && !(data.results || []).length;
  const results = stubEmpty
    ? 0
    : (data.resultCount ?? (data.results || []).length);
  const processed = stubEmpty ? 0 : (data.processed || 0);
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
    // Pull transport/proxy glitch dumps out of Needs Review before other migrates soften them.
    let requeuedGlitched = 0;
    if (typeof requeueGlitchedIncompleteScans === 'function') {
      const repaired = requeueGlitchedIncompleteScans(state.results, state.records);
      if (repaired.requeued) {
        state.results = repaired.results;
        state.records = repaired.records;
        state.processed = state.results.length;
        requeuedGlitched = repaired.requeued;
      }
    }
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
    repairsChangedData = beforeRepairSig !== sessionResultsSig(state.results) || requeuedGlitched > 0;
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
    low_confidence: Array.isArray(data.reviewedKeysByFilter?.low_confidence) ? data.reviewedKeysByFilter.low_confidence : [],
    blurred: Array.isArray(data.reviewedKeysByFilter?.blurred) ? data.reviewedKeysByFilter.blurred : [],
    satellite_only: Array.isArray(data.reviewedKeysByFilter?.satellite_only) ? data.reviewedKeysByFilter.satellite_only : []
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

  // Auto-open workbench when session already has results (scan-first IA)
  if (state.results.length > 0) {
    state.resultsWorkbenchOpen = true;
  }

  if (state.results.length) {
    updateExportButtons();
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
    // Server sessions are authoritative when the analyzer runs through the proxy.
    // Priming large localStorage stubs painted fake "15k all scanned" KPIs and hid
    // the real forceRescan queue for logged-in users.
    if (USE_PROXY) return false;
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
        state.resultsWorkbenchOpen = true;
        progressSection?.classList.add('review-minimal');
      }
      updateCommandBar();
      updateStartButton();
      return true;
    }
    if (!data?.records?.length && !data?.results?.length) return false;
    const resultCount = data.resultCount ?? (data.results || []).length;
    if (resultCount > 0 && resultCount < 8000) return false;
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
      state.resultsWorkbenchOpen = true;
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
    // Cookie sync runs once in bootstrapApp — do not await it again here.
    let summary = null;
    if (USE_PROXY) {
      // Summary + incremental stats in parallel. Recover only when JSONL is ahead of LATEST.
      const statsPromise = apiFetch('/api/scan-results/stats', { cache: 'no-store' })
        .then(async (res) => (res.ok ? res.json() : null))
        .catch(() => null);
      summary = await fetchSessionSummary();
      const stats = await statsPromise;
      const incCount = Number(stats?.count) || 0;
      const summaryResults = Number(summary?.results) || 0;
      if (incCount > summaryResults) {
        try {
          const recoverRes = await apiFetch('/api/recover-incremental', { method: 'POST' });
          if (recoverRes.ok) {
            const recovered = await recoverRes.json();
            if (recovered?.results > 0) {
              console.log('[Session] Recovered incremental scan rows:', recovered);
              summary = await fetchSessionSummary();
            }
          }
        } catch (e) {
          console.warn('Incremental recovery check failed', e);
        }
      }
      if (summary?.results) {
        sessionLoadState.serverCanonical = summary.results;
      }
    }
    if (summary?.results) {
      const firstPagePromise = fetchSessionResultsPage(0, getSessionFirstPageSize());
      await applySessionSummary(summary);
      setSessionRestoreBanner(
        summary.results > 500
          ? `Loaded ${summary.results.toLocaleString()} properties — showing first page…`
          : `Loaded ${summary.results.toLocaleString()} properties — loading results…`
      );
      // Paint cards before IndexedDB merge / unscanned queue — biggest perceived-load win.
      await loadSessionResultsFirstPage(summary.results, firstPagePromise);
      setSessionRestoreBanner('');
      updateScanReadyUi?.();
      updateStartButton?.();

      loadSessionResultsBackground(summary.results, { deferIdle: true });
      hydrateSessionReviewMeta().catch((e) => console.warn('Review meta hydrate failed', e));

      const pendingHint = Number(summary.pendingUnscanned) || 0;
      if (pendingHint > 0) {
        // Keep _pendingUnscanned from applySessionSummary; Start Scan uses ensureScanRecordsLoaded.
        // Load immediately — idle defer left Start Scan disabled behind stale full records.
        try {
          await loadSessionRecords({ mode: 'unscanned' });
        } catch (e) {
          console.warn('Unscanned records load failed', e);
        }
        updateScanReadyUi?.();
        updateStartButton?.();
      } else {
        state._pendingUnscanned = 0;
        state._expectedRecords = Number(summary.records) || 0;
        state._recordsLoadComplete = true;
      }

      const mergeBrowserMetaIdle = () => {
        readAllBrowserSessionCandidates()
          .then((browserCandidates) => {
            const browserBest = browserCandidates[0] || null;
            if (browserBest?.data && mergeBrowserReviewMetadata(browserBest.data)) {
              sessionDirty = true;
              if (typeof pushReviewMetadataToServer === 'function') {
                pushReviewMetadataToServer('review-metadata-merge', { immediate: true });
              } else {
                requestServerSave('review-metadata-merge');
              }
            }
          })
          .catch((e) => console.warn('Deferred browser session merge failed', e));
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(mergeBrowserMetaIdle, { timeout: 4000 });
      } else {
        setTimeout(mergeBrowserMetaIdle, 0);
      }

      if (!sessionDirty) sessionDirty = false;
      // Skip urgent local full-session write for large restores (can freeze tab for seconds)
      if (window.DistressPersistence && (summary.results || 0) <= 400) {
        DistressPersistence.saveNow('restore', { urgent: true, localOnly: true });
      }
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
  state.reviewedKeysByFilter = { distressed: [], well_maintained: [], vacant: [], review: [], low_confidence: [], blurred: [], satellite_only: [] };
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
  state.resultsWorkbenchOpen = false;
  state.pastMarketsOpen = false;
  state.sortMode = 'newest';
  state.leadTypeFilter = 'all';
  state.importLeadType = DEFAULT_LEAD_TYPE;
  state.setupCollapsed = false;
  state.appView = 'setup';
  initLeadTypeSelects();
  resultSearch.value = '';
  collapseSetup(false);
  progressSection?.classList.remove('review-minimal');
  $('failStats')?.classList.remove('visible');
  firstErrorShown = false;
  errorBanner.classList.remove('visible');
  errorBanner.innerHTML = '';
  resetScanIssueState();
  fileInput.value = '';
  if (heroCount) heroCount.textContent = '—';
  fileInfo.textContent = '';
  fileInfo.classList.remove('visible');
  updateExportButtons();
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
