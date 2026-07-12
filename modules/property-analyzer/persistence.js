/**
 * DistressPersistence — auto-save, version history, backup download/load,
 * and restore notifications for Property Distress Analyzer.
 *
 * Usage:
 *   DistressPersistence.init({ getPayload, applyPayload, performSave, ... });
 *   DistressPersistence.scheduleSave('scan-result');
 *   DistressPersistence.saveNow('file-upload', { urgent: true });
 */
(function (global) {
  'use strict';

  const META_KEY = 'distressAnalyzerHistoryMeta';
  const HIST_PREFIX = 'distressAnalyzerHist_';
  const MAX_VERSIONS = 8;
  const SIZE_WARN_BYTES = 4 * 1024 * 1024;
  const DEBOUNCE_MS = 1200;
  const MAJOR_DEBOUNCE_MS = 400;
  const AUTO_SAVE_MIN_MS = 120000;
  const AUTO_SAVE_MAX_MS = 300000;
  const FETCH_KEEPALIVE_MAX_BYTES = 64000;

  const MAJOR_REASONS = new Set([
    'file-upload',
    'scan-result',
    'scan-batch',
    'scan-complete',
    'scan-stop',
    'scan-heartbeat',
    'llm-result',
    'restore',
    'load-backup',
    'manual',
    'destructive-guard',
    'beforeunload',
    'visibility-hidden',
    'review-progress',
    'review-action',
    'review-undo',
    'review-change',
    'review-exit',
    'review-blurred',
    'review-milestone',
    'review-metadata',
    'tier-edit',
    'flush-sync'
  ]);

  const LOCAL_ONLY_REASONS = new Set([
    'auto-interval',
    'auto-heartbeat',
    'debounced',
    'search',
    'restore',
    'review-progress',
    'review-change',
    'review-blurred',
    'review-undo',
    'review_defer',
    'review_keep',
    'review_change',
    'review_blurred'
  ]);

  const EMERGENCY_DOWNLOAD_REASONS = new Set([
    'manual',
    'beforeunload',
    'visibility-hidden',
    'file-upload',
    'scan-complete',
    'load-backup',
    'flush-sync',
    'destructive-guard'
  ]);

  let config = {
    storageKey: 'distressAnalyzerSession',
    useProxy: false,
    getPayload: () => ({}),
    applyPayload: async () => ({}),
    performSave: async () => ({ ok: false }),
    readAllLocalCandidates: async () => [],
    fetchServerBackup: async () => null,
    rankSession: () => -1,
    onStatusChange: () => {},
    onEmergencySave: () => {}
  };

  let debounceTimer = null;
  let autoSaveTimer = null;
  let heartbeatTimer = null;
  let saveInFlight = false;
  let lastSaveAt = 0;
  let lastSaveError = null;
  let lastSaveRejected = false;
  let lastPayloadBytes = 0;
  const SIZE_WARN_SESSION_KEY = 'distressAnalyzerSizeWarnShown';
  let sizeWarnShown = false;
  try {
    sizeWarnShown = sessionStorage.getItem(SIZE_WARN_SESSION_KEY) === '1';
  } catch (_) {}
  let toastStack = null;

  function $(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  function formatBytes(n) {
    if (!n || n < 1024) return (n || 0) + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function formatTimestamp(ts) {
    if (!ts) return 'unknown time';
    try {
      return new Date(ts).toLocaleString();
    } catch (_) {
      return String(ts);
    }
  }

  function countReviewedFromPayload(payload) {
    const buckets = payload?.reviewedKeysByFilter;
    if (!buckets || typeof buckets !== 'object') return 0;
    let n = 0;
    for (const k of Object.keys(buckets)) {
      const bucket = buckets[k];
      n += Array.isArray(bucket) ? bucket.length : 0;
    }
    return n;
  }

  function ensureToastStack() {
    if (toastStack) return toastStack;
    toastStack = $('persistToastStack');
    if (!toastStack && typeof document !== 'undefined') {
      toastStack = document.createElement('div');
      toastStack.id = 'persistToastStack';
      toastStack.className = 'persist-toast-stack';
      toastStack.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastStack);
    }
    return toastStack;
  }

  function showToast(message, type = 'info', durationMs = 4200) {
    const stack = ensureToastStack();
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `persist-toast persist-toast-${type}`;
    el.textContent = message;
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 320);
    }, durationMs);
  }

  function readMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return { versions: [] };
      const meta = JSON.parse(raw);
      if (!Array.isArray(meta.versions)) meta.versions = [];
      return meta;
    } catch (_) {
      return { versions: [] };
    }
  }

  function writeMeta(meta) {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) {
      console.warn('[Persistence] Could not write history meta', e);
    }
  }

  function dropOldestVersion(meta) {
    if (!meta.versions.length) return meta;
    const oldest = meta.versions.pop();
    if (oldest?.key) {
      try { localStorage.removeItem(oldest.key); } catch (_) {}
    }
    return meta;
  }

  function rotateVersionHistory(json, payload) {
    if (!json) return;
    const size = json.length;
    const savedAt = Number(payload?.savedAt) || Date.now();
    const results = (payload?.results || []).length;
    const records = (payload?.records || []).length;
    let meta = readMeta();

    const duplicate = meta.versions[0];
    if (duplicate && duplicate.results === results && duplicate.records === records
      && Math.abs(duplicate.savedAt - savedAt) < 5000) {
      return;
    }

    const key = `${HIST_PREFIX}${savedAt}`;
    while (meta.versions.length >= MAX_VERSIONS) {
      meta = dropOldestVersion(meta);
    }

    try {
      localStorage.setItem(key, json);
      meta.versions.unshift({
        key,
        savedAt,
        results,
        records,
        size,
        fileName: payload?.fileName || ''
      });
      writeMeta(meta);
    } catch (e) {
      console.warn('[Persistence] Version history quota — pruning oldest', e);
      while (meta.versions.length && meta.versions.length >= 1) {
        meta = dropOldestVersion(meta);
        try {
          localStorage.setItem(key, json);
          meta.versions.unshift({ key, savedAt, results, records, size, fileName: payload?.fileName || '' });
          writeMeta(meta);
          return;
        } catch (_) {}
      }
    }
  }

  function readVersionCandidates() {
    const meta = readMeta();
    const out = [];
    for (const v of meta.versions) {
      try {
        const raw = localStorage.getItem(v.key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        out.push({
          source: `history:${v.key}`,
          data,
          rank: config.rankSession(data),
          savedAt: v.savedAt,
          results: v.results
        });
      } catch (_) {}
    }
    return out;
  }

  function updateStorageIndicator(bytes) {
    lastPayloadBytes = bytes || lastPayloadBytes;
    const el = $('backupSizeIndicator');
    if (!el) return;
    if (!lastPayloadBytes) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const hist = readMeta().versions.length;
    const warn = lastPayloadBytes > SIZE_WARN_BYTES ? ' ⚠ large' : '';
    el.textContent = `Backup: ${formatBytes(lastPayloadBytes)} · ${hist} version${hist === 1 ? '' : 's'}${warn}`;
    el.classList.toggle('warn', lastPayloadBytes > SIZE_WARN_BYTES);
  }

  function maybeWarnLargePayload(bytes) {
    if (bytes <= SIZE_WARN_BYTES || sizeWarnShown) return;
    sizeWarnShown = true;
    try { sessionStorage.setItem(SIZE_WARN_SESSION_KEY, '1'); } catch (_) {}
    const serverNote = config.useProxy
      ? ' Your scan still auto-saves to disk on this PC — you will not lose data if the server is running.'
      : ' Open via launch-analyzer.bat so the server can mirror saves to disk.';
    showToast(
      `Browser storage is ${formatBytes(bytes)} (Chrome limit ~5 MB).${serverNote}`,
      'warn',
      9000
    );
  }

  function triggerDownload(json, payload) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const results = (payload?.results || []).length;
    const name = `distress-analyzer-backup_${results}results_${stamp}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`Backup downloaded (${formatBytes(json.length)})`, 'success');
    return name;
  }

  function notifyStatus() {
    config.onStatusChange({
      lastSaveAt,
      lastSaveError,
      lastSaveRejected,
      lastPayloadBytes,
      saveInFlight,
      sizeWarn: lastPayloadBytes > SIZE_WARN_BYTES
    });
  }

  async function saveNow(reason = 'manual', opts = {}) {
    if (saveInFlight) {
      scheduleSave(reason, opts);
      return { ok: false, queued: true };
    }
    saveInFlight = true;
    notifyStatus();
    try {
      const payload = config.getPayload();
      let json;
      const idleStringify = LOCAL_ONLY_REASONS.has(reason) && !opts.urgent;
      if (opts.urgent || (MAJOR_REASONS.has(reason) && !idleStringify)) {
        json = JSON.stringify(payload);
      } else {
        json = await new Promise((resolve, reject) => {
          const run = () => {
            try { resolve(JSON.stringify(payload)); }
            catch (e) { reject(e); }
          };
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 1200 });
          } else {
            setTimeout(run, 0);
          }
        });
      }

      const bytes = json.length;
      const serverAuthoritative = config.isServerAuthoritative?.()
        && !opts.localOnly
        && !LOCAL_ONLY_REASONS.has(reason);
      if (serverAuthoritative && config.buildSummaryStub) {
        // Local stub storage handled in performLocalPersist; full json still sent to server
        void config.buildSummaryStub(payload);
      }
      maybeWarnLargePayload(bytes);
      updateStorageIndicator(bytes);

      const result = await config.performSave({
        json,
        payload,
        reason,
        urgent: !!opts.urgent,
        localOnly: !!opts.localOnly || LOCAL_ONLY_REASONS.has(reason)
      });
      if (result?.ok === true) {
        const skipVersionHistory = opts.localOnly
          && reason !== 'review-exit'
          && reason !== 'review-milestone';
        if (!skipVersionHistory) rotateVersionHistory(json, payload);
        lastSaveAt = Number(payload.savedAt) || Date.now();
        lastSaveError = null;
        lastSaveRejected = false;
        if (result?.serverDeferred) {
          // Local mirror saved; full server push waits until session results finish loading.
        } else if (reason === 'review-milestone') {
          const reviewed = countReviewedFromPayload(payload);
          showToast(
            `Review checkpoint saved to disk — ${reviewed.toLocaleString()} properties reviewed`,
            'success',
            5500
          );
        } else if (MAJOR_REASONS.has(reason) && reason !== 'beforeunload' && reason !== 'visibility-hidden') {
          showToast('Session saved', 'success', 2400);
        }
      } else {
        lastSaveError = result?.error || new Error('Save failed');
        lastSaveRejected = !!result?.rejected;
        if (result?.rejected) {
          showToast('Save paused — still loading full session from server.', 'warn', 5000);
        } else if (EMERGENCY_DOWNLOAD_REASONS.has(reason)) {
          showToast('Save failed — downloading emergency backup', 'error', 6000);
          triggerDownload(json, payload);
        } else {
          showToast('Save failed — will retry when session is ready', 'warn', 4000);
        }
      }
      notifyStatus();
      return result || { ok: true };
    } catch (e) {
      lastSaveError = e;
      console.warn('[Persistence] saveNow failed', e);
      if (EMERGENCY_DOWNLOAD_REASONS.has(reason)) {
        try {
          const payload = config.getPayload();
          const json = JSON.stringify(payload);
          triggerDownload(json, payload);
          showToast('Emergency backup downloaded', 'error', 6000);
        } catch (_) {}
      } else {
        showToast('Save error — will retry automatically', 'warn', 4000);
      }
      notifyStatus();
      return { ok: false, error: e };
    } finally {
      saveInFlight = false;
      notifyStatus();
    }
  }

  function scheduleSave(reason = 'debounced', opts = {}) {
    if (debounceTimer) clearTimeout(debounceTimer);
    const delay = opts.urgent || MAJOR_REASONS.has(reason) ? MAJOR_DEBOUNCE_MS : DEBOUNCE_MS;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      saveNow(reason, opts);
    }, delay);
  }

  function startAutoSave() {
    stopAutoSave();
    const tick = () => {
      const delay = AUTO_SAVE_MIN_MS + Math.floor(Math.random() * (AUTO_SAVE_MAX_MS - AUTO_SAVE_MIN_MS));
      autoSaveTimer = setTimeout(async () => {
        try {
          const payload = config.getPayload();
          if (!(payload.results || []).length && !(payload.records || []).length) {
            tick();
            return;
          }
        } catch (_) {
          tick();
          return;
        }
        await saveNow('auto-interval');
        tick();
      }, delay);
    };
    tick();
  }

  function stopAutoSave() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function resolveBestSession() {
    const candidates = [];
    try {
      const local = await config.readAllLocalCandidates();
      for (const c of local) candidates.push(c);
    } catch (e) {
      console.warn('[Persistence] Local candidates failed', e);
    }
    for (const c of readVersionCandidates()) candidates.push(c);

    if (config.useProxy) {
      try {
        const backup = await config.fetchServerBackup();
        if (backup?.session) {
          candidates.push({
            source: 'server',
            data: backup.session,
            rank: config.rankSession(backup.session),
            savedAt: Number(backup.session.savedAt) || 0,
            results: backup.results,
            file: backup.file
          });
        }
      } catch (e) {
        console.warn('[Persistence] Server backup fetch failed', e);
      }
    }

    candidates.sort((a, b) => compareSessionCandidates(a, b));
    return candidates[0] || null;
  }

  function compareSessionCandidates(a, b) {
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

  function notifyRestore(best) {
    if (!best?.data) return;
    const ts = formatTimestamp(best.savedAt || best.data.savedAt);
    const n = (best.data.results || []).length;
    const src = best.source === 'server' ? 'server backup' : best.source.startsWith('history') ? 'local version history' : 'browser storage';
    const msg = `Session restored from ${src} (${ts}) — ${n.toLocaleString()} analyzed`;
    showToast(msg, 'success', 6500);
    const banner = $('sessionRestoreBanner');
    if (banner) {
      banner.innerHTML = `<span>${msg}</span>`;
      banner.classList.add('visible');
      banner.classList.remove('error');
      setTimeout(() => banner.classList.remove('visible'), 8000);
    }
  }

  function updateSettingsBackupHint(extra = '') {
    const el = $('sidebarSettingsBackupHint');
    if (!el) return;
    const ts = formatTimestamp(Date.now());
    el.textContent = extra || `Last saved ${ts} — server + download`;
  }

  /**
   * One-click backup: server reads full LATEST from disk (not partial browser state),
   * writes manual checkpoint, then downloads JSON to the operator's machine.
   */
  async function exportBackupNow() {
    const payload = config.getPayload();
    const localN = (payload.results || []).length;
    const localRecords = (payload.records || []).length;

    if (!config.useProxy) {
      if (!localN && !localRecords) {
        showToast('Nothing to back up yet — load or scan data first', 'warn', 4000);
        return { ok: false, error: 'empty' };
      }
      return saveBackupCheckpoint({ skipServerFirst: true });
    }

    const apiFetch = global.apiFetch || fetch;
    const btn = $('exportBackupNowBtn');
    const prevLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving…';
    }
    showToast('Creating backup from server…', 'info', 2500);

    try {
      const res = await apiFetch('/api/manual-backup?fromServer=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        throw new Error(body?.error || `Server backup failed (${res.status})`);
      }

      const dlRes = await apiFetch('/api/session-backup', { cache: 'no-store' });
      if (!dlRes.ok) {
        throw new Error(`Download failed (${dlRes.status})`);
      }
      const json = await dlRes.text();
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch (_) {
        throw new Error('Server returned invalid backup JSON');
      }
      const name = triggerDownload(json, parsed);
      const n = Number(body.results) || (parsed.results || []).length;
      const msg = body.file
        ? `Backup saved — ${n.toLocaleString()} properties · server: ${body.file}`
        : `Backup downloaded — ${n.toLocaleString()} properties`;
      showToast(msg, 'success', 7000);
      updateSettingsBackupHint(`Last backup ${formatTimestamp(Date.now())}`);
      return { ok: true, file: name, serverFile: body.file, results: n };
    } catch (e) {
      console.warn('[Persistence] exportBackupNow failed', e);
      showToast(`Backup failed: ${e.message}`, 'error', 6000);
      return { ok: false, error: e.message };
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel || 'Export backup now';
      }
    }
  }

  async function downloadBackupNow() {
    const payload = config.getPayload();
    const json = JSON.stringify(payload, null, 2);
    const name = triggerDownload(json, payload);
    let serverFile = null;
    if (config.useProxy) {
      try {
        const apiFetch = global.apiFetch || fetch;
        const res = await apiFetch('/api/manual-backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.homeCopy) {
          serverFile = body.homeCopy;
        } else if (!res.ok) {
          throw new Error(body?.error || `Server backup failed (${res.status})`);
        }
      } catch (e) {
        console.warn('[Persistence] Server manual backup failed', e);
        showToast('Downloaded locally — server copy failed. Keep server running.', 'warn', 6000);
        return name;
      }
    }
    const n = (payload.results || []).length;
    const msg = serverFile
      ? `Backup saved — ${n.toLocaleString()} properties · server: ${serverFile}`
      : `Backup downloaded — ${n.toLocaleString()} properties`;
    showToast(msg, 'success', 7000);
    updateSettingsBackupHint();
    return name;
  }

  async function saveBackupCheckpoint(opts = {}) {
    if (config.useProxy && !opts.skipServerFirst) {
      return exportBackupNow();
    }
    const payload = config.getPayload();
    const n = (payload.results || []).length;
    const records = (payload.records || []).length;
    if (!n && !records) {
      showToast('Nothing to back up yet — load or scan data first', 'warn', 4000);
      return { ok: false, error: 'empty' };
    }
    showToast('Saving your sorting to disk…', 'info', 2500);
    const saveResult = await saveNow('manual', { urgent: true });
    if (saveResult?.ok === false && !saveResult?.queued) {
      showToast('Session save failed — downloading emergency copy', 'warn', 5000);
    }
    const name = await downloadBackupNow();
    return { ok: true, file: name };
  }

  async function loadBackupFromFile(file) {
    if (!file) return { ok: false, error: 'No file' };
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      showToast('Invalid backup file — not valid JSON', 'error');
      return { ok: false, error: e.message };
    }
    if (!data || (!Array.isArray(data.records) && !Array.isArray(data.results))) {
      showToast('Invalid backup — missing records/results', 'error');
      return { ok: false, error: 'Invalid structure' };
    }
    await config.applyPayload(data, { fromBackup: true });
    await saveNow('load-backup', { urgent: true });
    const n = (data.results || []).length;
    showToast(`Loaded backup — ${n.toLocaleString()} results`, 'success');
    return { ok: true, data };
  }

  async function confirmDestructive(title, detail) {
    const hasData = (() => {
      try {
        const p = config.getPayload();
        return (p.results || []).length > 0 || (p.records || []).length > 0;
      } catch (_) { return false; }
    })();

    if (hasData) {
      const saveFirst = confirm(
        `${title}\n\n${detail}\n\nSave a backup file to your computer first? (Recommended)`
      );
      if (saveFirst) {
        await exportBackupNow();
      }
    }

    return confirm(`${title}\n\nThis cannot be undone. Continue?`);
  }

  function emergencySave() {
    try {
      config.onEmergencySave?.();
    } catch (e) {
      console.warn('[Persistence] onEmergencySave failed', e);
    }
    try {
      const payload = config.getPayload();
      if (!(payload.results || []).length && !(payload.records || []).length) return;
      const json = JSON.stringify(payload);
      try { localStorage.setItem(config.storageKey, json); } catch (_) {}
      rotateVersionHistory(json, payload);
      if (config.useProxy) {
        const token = global.__PDA_AUTH_TOKEN__ || '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['X-PDA-Token'] = token;
        const apiFetch = global.apiFetch || fetch;
        if (json.length <= FETCH_KEEPALIVE_MAX_BYTES) {
          apiFetch('/api/session-backup', { method: 'POST', headers, body: json, keepalive: true }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[Persistence] emergencySave failed', e);
    }
  }

  function bindUi() {
    const runExport = () => exportBackupNow();
    $('exportBackupNowBtn')?.addEventListener('click', runExport);
    $('saveBackupNowBtn')?.addEventListener('click', runExport);
    $('emptySaveBackupBtn')?.addEventListener('click', runExport);

    const loadInput = $('loadBackupInput');
    $('loadBackupBtn')?.addEventListener('click', () => loadInput?.click());
    $('emptyLoadBackupBtn')?.addEventListener('click', () => loadInput?.click());
    loadInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      await loadBackupFromFile(file);
    });
  }

  function init(options = {}) {
    Object.assign(config, options);
    bindUi();
    startAutoSave();
    global.addEventListener('beforeunload', emergencySave);
    global.addEventListener('pagehide', emergencySave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        emergencySave();
        saveNow('visibility-hidden', { urgent: true });
      }
    });
    notifyStatus();
    return api;
  }

  const api = {
    init,
    scheduleSave,
    saveNow,
    startAutoSave,
    stopAutoSave,
    resolveBestSession,
    notifyRestore,
    downloadBackupNow,
    exportBackupNow,
    saveBackupCheckpoint,
    loadBackupFromFile,
    confirmDestructive,
    emergencySave,
    showToast,
    updateStorageIndicator,
    rotateVersionHistory,
    readVersionCandidates,
    formatBytes,
    formatTimestamp,
    MAX_VERSIONS,
    SIZE_WARN_BYTES
  };

  global.DistressPersistence = api;
})(typeof window !== 'undefined' ? window : global);