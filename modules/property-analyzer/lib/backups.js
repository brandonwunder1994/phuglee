const { parseLearnedBrainFromSession } = require('./learned-brain');
const {
  scopeSessionPath,
  emptySession,
  readScopeFromRequest
} = require('./user-session');

module.exports = function createBackups(deps) {
  const { config, fs, path, crypto, getSafety } = deps;
  const {
    DATA_ROOT,
    SESSION_LATEST_FILE,
    SCAN_RESULTS_DIR,
    AUTO_BACKUPS_DIR,
    MILESTONE_BACKUPS_DIR,
    MANUAL_BACKUPS_DIR,
    ARCHIVE_DIR,
    ARCHIVE_REJECTED_DIR,
    MAX_EPHEMERAL_BACKUPS,
    MAX_MILESTONE_BACKUPS,
    MAX_MANUAL_BACKUPS,
    MILESTONE_SAVE_REASONS,
    AUTO_SNAPSHOT_MIN_MS,
    PROMOTE_BATCH_MIN,
    PROMOTE_DEBOUNCE_MS,
    ROLLING_BACKUP_MIN_MS,
    ROLLING_BACKUP_MIN_NEW_RESULTS
  } = config;

  const { writeFileAtomic } = require('./fs-atomic');
  const { computeTierCounts, computeGeoTierCounts } = require('./tier-counts');
  const backupLogic = require('./backup-logic');
  const {
    recordKeyFromResult,
    isManuallyEditedResult,
    resultEditTimestamp,
    shouldReplaceSessionResult,
    countSessionProgress,
    sessionPayloadBytes
  } = backupLogic;

  let scanResultWriteChain = Promise.resolve();
  let scanPromoteTimer = null;
  let scanResultsSincePromote = 0;
  let promoteInFlight = false;
  let promoteQueued = false;
  let lastRollingBackupAt = 0;
  const sessionFileCache = { path: '', mtimeMs: 0, parsed: null };
  let sessionBackupResponseCache = { key: '', body: '' };
  let sessionSummaryResponseCache = { key: '', liteKey: '', body: '', liteBody: '' };
  let summaryServedLogged = false;
  let lastActiveScope = null;

  function ensureScanResultsDir() {
    if (!fs.existsSync(SCAN_RESULTS_DIR)) {
      fs.mkdirSync(SCAN_RESULTS_DIR, { recursive: true });
    }
  }

  function scanResultsLogPath(d = new Date()) {
    const stamp = d.toISOString().slice(0, 10);
    return path.join(SCAN_RESULTS_DIR, `scan_results_${stamp}.jsonl`);
  }

  function appendScanResult(entry) {
    ensureScanResultsDir();
    const line = JSON.stringify({ ts: Date.now(), ...entry }) + '\n';
    const file = scanResultsLogPath();
    const writePromise = fs.promises.appendFile(file, line, 'utf8');
    scanResultWriteChain = scanResultWriteChain
      .then(() => writePromise)
      .catch((err) => {
        console.warn('[Scan result log] write failed:', err.message);
        throw err;
      });
    return scanResultWriteChain.then(() => ({ ok: true, file }));
  }

  function readIncrementalScanResults() {
    ensureScanResultsDir();
    const map = new Map();
    let meta = { processed: 0, savedAt: 0, fileName: '', records: 0 };
    let files = [];
    try {
      files = fs.readdirSync(SCAN_RESULTS_DIR)
        .filter((f) => f.startsWith('scan_results_') && f.endsWith('.jsonl'))
        .sort();
    } catch (_) {
      return { results: [], meta, count: 0 };
    }
    for (const file of files) {
      const lines = fs.readFileSync(path.join(SCAN_RESULTS_DIR, file), 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          if (row.type === 'meta') {
            if ((row.processed || 0) > meta.processed) meta.processed = row.processed;
            if ((row.savedAt || row.ts || 0) > meta.savedAt) meta.savedAt = row.savedAt || row.ts || 0;
            if (row.fileName) meta.fileName = row.fileName;
            if ((row.records || 0) > meta.records) meta.records = row.records;
            continue;
          }
          const key = row.key || recordKeyFromResult(row.result);
          if (!key || !row.result) continue;
          const prev = map.get(key);
          if (!prev || shouldReplaceSessionResult(prev.result, row.result)) map.set(key, row);
        } catch (_) {}
      }
    }
    return {
      results: Array.from(map.values()).map((r) => r.result),
      meta,
      count: map.size
    };
  }

  function invalidateSessionCaches() {
    sessionFileCache.path = '';
    sessionFileCache.mtimeMs = 0;
    sessionFileCache.parsed = null;
    sessionBackupResponseCache.key = '';
    sessionBackupResponseCache.body = '';
    sessionSummaryResponseCache.key = '';
    sessionSummaryResponseCache.liteKey = '';
    sessionSummaryResponseCache.metaKey = '';
    sessionSummaryResponseCache.body = '';
    sessionSummaryResponseCache.liteBody = '';
    sessionSummaryResponseCache.metaBody = '';
  }

  function readSessionBackupFromDisk(filePath) {
    const stat = fs.statSync(filePath);
    if (sessionFileCache.path === filePath
      && sessionFileCache.mtimeMs === stat.mtimeMs
      && sessionFileCache.parsed) {
      return { session: sessionFileCache.parsed, mtimeMs: stat.mtimeMs };
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    sessionFileCache.path = filePath;
    sessionFileCache.mtimeMs = stat.mtimeMs;
    sessionFileCache.parsed = parsed;
    return { session: parsed, mtimeMs: stat.mtimeMs };
  }

  function sessionLooksComplete(session) {
    if (!session) return false;
    const results = Array.isArray(session.results) ? session.results.length : 0;
    const records = Array.isArray(session.records) ? session.records.length : 0;
    const processed = session.processed || 0;
    if (!results) return false;
    // records may be a *pending-only* re-import queue (far smaller than historical
    // results). That pattern must NOT mean "session complete — skip incremental".
    if (records > 0 && results > records * 2) return false;
    if (records > 0 && processed >= records && results >= records && results <= records + 5) return true;
    return processed >= results && results > 0 && records > 0 && results >= records;
  }

  /**
   * Always attempt incremental merge. The merge is a no-op when nothing new is in
   * the jsonl log. Skipping merge when session "looked complete" caused lost scans
   * after stop/refresh (new addresses only in scan_results_*.jsonl).
   */
  function shouldMergeIncrementalIntoSession(_session) {
    return true;
  }

  function mergeIncrementalIntoSession(session) {
    const base = session && typeof session === 'object'
      ? session
      : { records: [], results: [], processed: 0, savedAt: 0 };
    const inc = readIncrementalScanResults();
    if (!inc.count) return base;
    const existing = new Map();
    for (const r of base.results || []) {
      existing.set(recordKeyFromResult(r), r);
    }
    let upgraded = false;
    const recordLeadTypeByKey = new Map();
    for (const rec of base.records || []) {
      if (rec?.leadType) recordLeadTypeByKey.set(recordKeyFromResult(rec), rec.leadType);
    }
    for (const r of inc.results) {
      const k = recordKeyFromResult(r);
      const prev = existing.get(k);
      if (!shouldReplaceSessionResult(prev, r)) continue;
      const merged = { ...r };
      if (!merged.leadType) {
        merged.leadType = prev?.leadType || recordLeadTypeByKey.get(k) || 'code_violation';
      }
      existing.set(k, merged);
      upgraded = true;
    }
    const mergedResults = Array.from(existing.values());
    const baseLen = (base.results || []).length;
    if (!upgraded && baseLen >= mergedResults.length) return base;
    const merged = { ...base };
    merged.results = mergedResults;
    merged.processed = Math.max(base.processed || 0, inc.meta.processed || 0, mergedResults.length);
    merged.savedAt = Math.max(Number(base.savedAt) || 0, inc.meta.savedAt || 0);
    if (inc.meta.fileName && !merged.fileName) merged.fileName = inc.meta.fileName;
    if (merged.results.length > baseLen) merged._mergedFromIncremental = true;
    return merged;
  }

  function ensureBackupDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function ensureArchiveDirs() {
    ensureBackupDir(ARCHIVE_DIR);
    ensureBackupDir(path.join(ARCHIVE_DIR, 'root'));
    ensureBackupDir(ARCHIVE_REJECTED_DIR);
  }

  function ensureAutoBackupsDir() {
    ensureBackupDir(AUTO_BACKUPS_DIR);
    ensureBackupDir(MILESTONE_BACKUPS_DIR);
    ensureBackupDir(MANUAL_BACKUPS_DIR);
    ensureArchiveDirs();
  }

  function sessionContentHash(session) {
    return crypto.createHash('sha256').update(JSON.stringify(session)).digest('hex').slice(0, 16);
  }

  function pruneBackupsInDir(dir, maxFiles, protectedNames = new Set()) {
    let files = [];
    try {
      files = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json') && !protectedNames.has(f))
        .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    } catch (_) {
      return;
    }
    for (const { f } of files.slice(maxFiles)) {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    }
  }

  function pruneEphemeralBackups() {
    pruneBackupsInDir(AUTO_BACKUPS_DIR, MAX_EPHEMERAL_BACKUPS, new Set(['SAFETY_STATUS.json', 'MIRROR_LATEST.json']));
  }

  function pruneMilestoneBackups() {
    pruneBackupsInDir(MILESTONE_BACKUPS_DIR, MAX_MILESTONE_BACKUPS);
  }

  function pruneManualBackups() {
    pruneBackupsInDir(MANUAL_BACKUPS_DIR, MAX_MANUAL_BACKUPS);
  }

  function recordKeyFromRow(r) {
    if (!r) return '';
    return `${r.email || ''}|${r.phone || ''}|${r.address || ''}`;
  }

  function countPendingUnscanned(session) {
    const results = Array.isArray(session?.results) ? session.results : [];
    const records = Array.isArray(session?.records) ? session.records : [];
    if (!records.length) return 0;
    const existing = new Set(results.map(recordKeyFromRow).filter(Boolean));
    let pending = 0;
    for (const r of records) {
      const k = recordKeyFromRow(r);
      if (!k || !existing.has(k)) pending += 1;
    }
    return pending;
  }

  function buildSessionSummary(session, opts = {}) {
    const lite = !!opts.lite;
    const results = Array.isArray(session?.results) ? session.results : [];
    const records = Array.isArray(session?.records) ? session.records : [];
    const pendingUnscanned = countPendingUnscanned(session);
    const summary = {
      ok: true,
      file: SESSION_LATEST_FILE,
      savedAt: Number(session?.savedAt) || null,
      fileName: session?.fileName || '',
      records: records.length,
      results: results.length,
      pendingUnscanned,
      importBatches: Array.isArray(session?.importBatches) ? session.importBatches.length : 0,
      processed: session?.processed || 0,
      filter: session?.filter || 'all',
      leadTypeFilter: session?.leadTypeFilter || 'all',
      importLeadType: session?.importLeadType || null,
      viewMode: session?.viewMode || 'cards',
      appView: session?.appView || 'setup',
      reviewFilter: session?.reviewFilter || null,
      reviewQueue: Array.isArray(session?.reviewQueue) ? session.reviewQueue.length : 0,
      reviewIndex: Number(session?.reviewIndex) || 0,
      reviewStats: session?.reviewStats || { kept: 0, changed: 0, deferred: 0, blurred: 0 },
      sessionSchemaVersion: session?.sessionSchemaVersion || 1,
      progress: countSessionProgress(session),
      tierCounts: computeTierCounts(results),
      // Accurate state/city KPIs without waiting for full client result hydration
      geo: computeGeoTierCounts(results)
    };
    if (lite) {
      summary.lite = true;
      summary.reviewProgressByFilter = {};
      summary.reviewedKeysByFilter = {
        distressed: [],
        well_maintained: [],
        vacant: [],
        review: [],
        low_confidence: []
      };
      return summary;
    }
    summary.reviewProgressByFilter = session?.reviewProgressByFilter || {};
    summary.reviewedKeysByFilter = session?.reviewedKeysByFilter || {};
    Object.assign(summary, parseLearnedBrainFromSession(session));
    return summary;
  }

  function buildSessionReviewMeta(session) {
    return {
      ok: true,
      savedAt: Number(session?.savedAt) || null,
      reviewProgressByFilter: session?.reviewProgressByFilter || {},
      reviewedKeysByFilter: session?.reviewedKeysByFilter || {},
      ...parseLearnedBrainFromSession(session)
    };
  }

  function sessionSummaryCacheKey(session, lite = false) {
    const results = Array.isArray(session?.results) ? session.results.length : 0;
    const records = Array.isArray(session?.records) ? session.records.length : 0;
    const savedAt = Number(session?.savedAt) || 0;
    const mtimeMs = sessionFileCache.mtimeMs || 0;
    return `${mtimeMs}|${savedAt}|${results}|${records}|${lite ? 'lite' : 'full'}`;
  }

  function getSessionSummaryResponseBody(session, opts = {}) {
    const lite = !!opts.lite;
    const cacheKey = sessionSummaryCacheKey(session, lite);
    const cacheField = lite ? 'liteKey' : 'key';
    const bodyField = lite ? 'liteBody' : 'body';
    if (sessionSummaryResponseCache[cacheField] === cacheKey && sessionSummaryResponseCache[bodyField]) {
      return sessionSummaryResponseCache[bodyField];
    }
    const body = JSON.stringify(buildSessionSummary(session, { lite }));
    sessionSummaryResponseCache[cacheField] = cacheKey;
    sessionSummaryResponseCache[bodyField] = body;
    return body;
  }

  function getSessionReviewMetaResponseBody(session) {
    const cacheKey = `${sessionSummaryCacheKey(session, false)}|meta`;
    if (sessionSummaryResponseCache.metaKey === cacheKey && sessionSummaryResponseCache.metaBody) {
      return sessionSummaryResponseCache.metaBody;
    }
    const body = JSON.stringify(buildSessionReviewMeta(session));
    sessionSummaryResponseCache.metaKey = cacheKey;
    sessionSummaryResponseCache.metaBody = body;
    return body;
  }

  function backupTierForReason(reason = '') {
    if (reason === 'manual' || reason === 'load-backup') return 'manual';
    // Only explicit operator/review/upload reasons — not promote_* or scan-batch heartbeats.
    if (MILESTONE_SAVE_REASONS.has(reason)) return 'milestone';
    return 'ephemeral';
  }

  function shouldWriteRollingBackup(mergedResults) {
    const safety = getSafety?.();
    const now = Date.now();
    const grew = mergedResults - (safety?.safetyState?.lastSnapshotResults || 0);
    if (now - lastRollingBackupAt < ROLLING_BACKUP_MIN_MS && grew < ROLLING_BACKUP_MIN_NEW_RESULTS) {
      return false;
    }
    return true;
  }

  function shouldWriteSessionSnapshot(session, reason, existingProgress = 0) {
    const safety = getSafety?.();
    const tier = backupTierForReason(reason);
    if (tier === 'manual' || tier === 'milestone') return true;
    const progress = countSessionProgress(session);
    if (progress > existingProgress) return true;
    if (!shouldWriteRollingBackup((session.results || []).length)) return false;
    return Date.now() - (safety?.safetyState?.lastAutoSnapshotAt || 0) > AUTO_SNAPSHOT_MIN_MS;
  }

  function readLatestSessionFileForScope(scope) {
    const latestPath = scopeSessionPath(DATA_ROOT, SESSION_LATEST_FILE, scope);
    if (!fs.existsSync(latestPath)) {
      return emptySession();
    }
    try {
      const stat = fs.statSync(latestPath);
      if (sessionFileCache.path === latestPath
        && sessionFileCache.mtimeMs === stat.mtimeMs
        && sessionFileCache.parsed) {
        return sessionFileCache.parsed;
      }
      const parsed = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
      sessionFileCache.path = latestPath;
      sessionFileCache.mtimeMs = stat.mtimeMs;
      sessionFileCache.parsed = parsed;
      return parsed;
    } catch (_) {
      return emptySession();
    }
  }

  function writeLatestSessionFileForScope(scope, session) {
    const latestPath = scopeSessionPath(DATA_ROOT, SESSION_LATEST_FILE, scope);
    fs.mkdirSync(path.dirname(latestPath), { recursive: true });
    writeFileAtomic(latestPath, JSON.stringify(session));
    invalidateSessionCaches();
    return latestPath;
  }

  function readLatestSessionFile() {
    return readLatestSessionFileForScope(lastActiveScope || { storageKey: '_anonymous' });
  }

  function loadSessionForRequest(req) {
    const scope = readScopeFromRequest(req);
    lastActiveScope = scope;
    let session = readLatestSessionFileForScope(scope);
    session = mergeIncrementalIntoSession(session);
    return { scope, session };
  }

  function writeTieredBackup(session, tag = 'auto', tier = 'ephemeral') {
    if (!session) return null;
    const safety = getSafety?.();
    ensureAutoBackupsDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const results = Array.isArray(session.results) ? session.results.length : 0;
    const progress = countSessionProgress(session);
    const dir = tier === 'milestone' ? MILESTONE_BACKUPS_DIR
      : tier === 'manual' ? MANUAL_BACKUPS_DIR
        : AUTO_BACKUPS_DIR;
    const file = path.join(dir, `${tag}_${results}r_p${progress}_${stamp}.json`);
    const json = JSON.stringify(session);
    try {
      writeFileAtomic(file, json);
      safety?.writeMirrorLatest(session);
      safety?.writeSafetyStatus(session, { tag, tier, snapshotFile: path.basename(file), progress });
      if (tier === 'milestone') pruneMilestoneBackups();
      else if (tier === 'manual') pruneManualBackups();
      else pruneEphemeralBackups();
      if (safety?.safetyState) {
        safety.safetyState.lastAutoSnapshotAt = Date.now();
        safety.safetyState.lastSnapshotResults = results;
      }
      return file;
    } catch (err) {
      console.warn(`[Safety] ${tier} backup failed:`, err.message);
      return null;
    }
  }

  function writeRollingAutoBackup(session, tag = 'auto', tier = 'ephemeral') {
    return writeTieredBackup(session, tag, tier);
  }

  function promoteIncrementalToLatest(reason = 'auto', scope = lastActiveScope) {
    const safety = getSafety?.();
    const activeScope = scope || lastActiveScope || { storageKey: '_anonymous' };
    if (promoteInFlight) {
      promoteQueued = true;
      return { promoted: false, queued: true, results: safety?.safetyState?.lastPromoteResults || 0 };
    }
    promoteInFlight = true;
    try {
      const base = readLatestSessionFileForScope(activeScope);
      const baseResults = Array.isArray(base.results) ? base.results.length : 0;
      const merged = mergeIncrementalIntoSession(base);
      const mergedResults = Array.isArray(merged.results) ? merged.results.length : 0;
      const upgraded = !!merged._mergedFromIncremental || mergedResults > baseResults;

      if (upgraded) {
        const toSave = { ...merged };
        delete toSave._mergedFromIncremental;
        try {
          writeLatestSessionFileForScope(activeScope, toSave);
          // JSONL + LATEST are durable; skip 60MB milestone copy on every promote tick.
          safety?.writeMirrorLatest(toSave);
          safety?.writeSafetyStatus(toSave, { tag: `promote_${reason}`, tier: 'live' });
          if (safety?.safetyState) {
            safety.safetyState.lastPromoteAt = Date.now();
            safety.safetyState.lastPromoteResults = mergedResults;
          }
          console.log(`[Safety] Promoted ${mergedResults} results (${reason})`);
        } catch (err) {
          console.warn('[Safety] Promote failed:', err.message);
          return { promoted: false, results: baseResults, error: err.message };
        }
      }

      return { promoted: upgraded, results: mergedResults };
    } finally {
      promoteInFlight = false;
      if (promoteQueued) {
        promoteQueued = false;
        setTimeout(() => promoteIncrementalToLatest('queued'), 8000);
      }
    }
  }

  function rememberActiveScope(req) {
    if (req) lastActiveScope = readScopeFromRequest(req);
    return lastActiveScope;
  }

  function schedulePromoteAfterScanResult(req) {
    rememberActiveScope(req);
    scanResultsSincePromote++;
    if (scanResultsSincePromote >= PROMOTE_BATCH_MIN) {
      scanResultsSincePromote = 0;
      if (scanPromoteTimer) {
        clearTimeout(scanPromoteTimer);
        scanPromoteTimer = null;
      }
      setTimeout(() => {
        const result = promoteIncrementalToLatest('scan-batch');
        maybeRollingBackupAfterPromote(result);
      }, 100);
      return;
    }
    if (scanPromoteTimer) return;
    scanPromoteTimer = setTimeout(() => {
      scanPromoteTimer = null;
      scanResultsSincePromote = 0;
      const result = promoteIncrementalToLatest('scan-debounce');
      maybeRollingBackupAfterPromote(result);
    }, PROMOTE_DEBOUNCE_MS);
  }

  function maybeRollingBackupAfterPromote(promoteResult) {
    const results = Number(promoteResult?.results) || 0;
    if (!results) return;
    const now = Date.now();
    if (
      results > 0 &&
      (now - lastRollingBackupAt >= ROLLING_BACKUP_MIN_MS ||
        results % ROLLING_BACKUP_MIN_NEW_RESULTS === 0)
    ) {
      try {
        const scope = lastActiveScope || { storageKey: '_anonymous' };
        const session = readLatestSessionFileForScope(scope);
        if ((session.results || []).length) {
          writeRollingAutoBackup(session, 'scan_milestone', 'milestone');
          lastRollingBackupAt = now;
        }
      } catch (err) {
        console.warn('[Safety] Rolling milestone backup failed:', err.message);
      }
    }
  }

  /**
   * If LATEST is empty/thin but JSONL has scan rows, promote into the active scope.
   * Recovers mid-scan reloads when debounce never flushed LATEST.
   */
  function recoverIncrementalIntoScope(scope) {
    const activeScope = scope || lastActiveScope || { storageKey: '_anonymous' };
    lastActiveScope = activeScope;
    const inc = readIncrementalScanResults();
    if (!inc.count) {
      return { recovered: false, results: 0, incremental: 0 };
    }
    const before = readLatestSessionFileForScope(activeScope);
    const beforeCount = Array.isArray(before.results) ? before.results.length : 0;
    const promoted = promoteIncrementalToLatest('recover-reload', activeScope);
    const after = readLatestSessionFileForScope(activeScope);
    const afterCount = Array.isArray(after.results) ? after.results.length : 0;
    return {
      recovered: afterCount > beforeCount,
      results: afterCount,
      incremental: inc.count,
      promoted: !!promoted?.promoted
    };
  }

  function getPersistenceStatus(scope) {
    const activeScope = scope || lastActiveScope || { storageKey: '_anonymous' };
    const latestPath = scopeSessionPath(DATA_ROOT, SESSION_LATEST_FILE, activeScope);
    const inc = readIncrementalScanResults();
    let latestResults = 0;
    let latestExists = false;
    let writable = false;
    try {
      fs.accessSync(DATA_ROOT, fs.constants.W_OK);
      writable = true;
    } catch (_) {
      writable = false;
    }
    try {
      if (fs.existsSync(latestPath)) {
        latestExists = true;
        const parsed = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
        latestResults = Array.isArray(parsed.results) ? parsed.results.length : 0;
      }
    } catch (_) {}
    const looksEphemeral =
      !String(DATA_ROOT || '').includes('pda-data') &&
      !String(process.env.PDA_DATA_ROOT || '').trim();
    return {
      ok: true,
      dataRoot: DATA_ROOT,
      writable,
      scope: activeScope.storageKey || '_anonymous',
      latestExists,
      latestResults,
      incrementalCount: inc.count,
      looksEphemeral,
      warning: !writable
        ? 'Data folder is not writable — scans may not save.'
        : looksEphemeral
          ? 'PDA_DATA_ROOT may not be a Railway volume — redeploys can wipe scans.'
          : (inc.count > latestResults + 5
            ? 'Scan log has more rows than LATEST — reload recovery will merge them.'
            : null)
    };
  }

  function promoteMergedSessionIfBetter(session) {
    if (!session?._mergedFromIncremental) return session;
    const activeScope = lastActiveScope || { storageKey: '_anonymous' };
    const latestPath = scopeSessionPath(DATA_ROOT, SESSION_LATEST_FILE, activeScope);
    let existingResults = 0;
    if (fs.existsSync(latestPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
        existingResults = Array.isArray(existing.results) ? existing.results.length : 0;
      } catch (_) {}
    }
    const mergedResults = Array.isArray(session.results) ? session.results.length : 0;
    if (mergedResults > existingResults) {
      const toSave = { ...session };
      delete toSave._mergedFromIncremental;
      try {
        writeLatestSessionFileForScope(activeScope, toSave);
        getSafety?.()?.writeMirrorLatest(toSave);
        console.log(`[Session] Promoted incremental recovery (${activeScope.storageKey}) — ${mergedResults} results`);
      } catch (err) {
        console.warn('[Session] Could not promote incremental recovery:', err.message);
      }
    }
    const cleaned = { ...session };
    delete cleaned._mergedFromIncremental;
    return cleaned;
  }

  return {
    appendScanResult,
    backupTierForReason,
    buildSessionSummary,
    buildSessionReviewMeta,
    getSessionSummaryResponseBody,
    getSessionReviewMetaResponseBody,
    computeTierCounts,
    countSessionProgress,
    ensureArchiveDirs,
    ensureAutoBackupsDir,
    invalidateSessionCaches,
    mergeIncrementalIntoSession,
    promoteIncrementalToLatest,
    promoteMergedSessionIfBetter,
    recoverIncrementalIntoScope,
    getPersistenceStatus,
    readIncrementalScanResults,
    readLatestSessionFile,
    readLatestSessionFileForScope,
    writeLatestSessionFileForScope,
    loadSessionForRequest,
    rememberActiveScope,
    readSessionBackupFromDisk,
    recordKeyFromResult,
    schedulePromoteAfterScanResult,
    sessionContentHash,
    sessionPayloadBytes,
    shouldMergeIncrementalIntoSession,
    shouldWriteSessionSnapshot,
    writeRollingAutoBackup,
    writeTieredBackup,
    get sessionBackupResponseCache() { return sessionBackupResponseCache; },
    set sessionBackupResponseCache(v) { sessionBackupResponseCache = v; },
    get summaryServedLogged() { return summaryServedLogged; },
    set summaryServedLogged(v) { summaryServedLogged = v; },
    get lastRollingBackupAt() { return lastRollingBackupAt; },
    set lastRollingBackupAt(v) { lastRollingBackupAt = v; }
  };
};