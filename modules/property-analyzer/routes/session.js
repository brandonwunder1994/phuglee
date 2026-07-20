const { writeFileAtomic } = require('../lib/fs-atomic');
const backupLogic = require('../lib/backup-logic');
const { scopeSessionPath } = require('../lib/user-session');
const { freeSessionDiskSpace, pruneRejectedQuarantine, isDiskSpaceError } = require('../lib/disk-cleanup');

function register(ctx) {
  const { router, sendJson, readBody, backups, safety, config, fs, path, hasValidPdaAuth } = ctx;
  const { DATA_ROOT, SESSION_BACKUP_FILES, SESSION_LATEST_FILE, ARCHIVE_REJECTED_DIR } = config;
  const { readScopeFromRequest } = require('../lib/user-session');

  function rejectAnonymousWrite(req, res) {
    try {
      const authPath = require('path').join(__dirname, '..', '..', '..', 'lib', 'phuglee-auth.js');
      const { isAuthRequired } = require(authPath);
      if (!isAuthRequired()) return false;
    } catch (_) {
      return false;
    }
    // Standalone :3456 / shell proxy already authenticated via X-PDA-Token.
    // Do not also require a Phuglee cookie — that blocked queue + scan-result saves
    // and left Analyze stuck on "Analyzing…" with empty buckets.
    if (typeof hasValidPdaAuth === 'function' && hasValidPdaAuth(req)) {
      return false;
    }
    const scope = readScopeFromRequest(req);
    if (scope.kind === 'anonymous') {
      sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return true;
    }
    return false;
  }

  function finalizeSession(session) {
    return backups.promoteMergedSessionIfBetter(session);
  }

  router.get('/api/session-summary', async (req, res, url) => {
    const lite = url.searchParams.get('lite') === '1';
    const { scope, session } = backups.loadSessionForRequest(req);
    const body = backups.getSessionSummaryResponseBody(finalizeSession(session), { lite });
    if (!backups.summaryServedLogged) {
      backups.summaryServedLogged = true;
      const parsed = JSON.parse(body);
      console.log(`[Session] Summary served (${scope.kind}/${scope.storageKey}): ${parsed.results} results, ${body.length} bytes${lite ? ' (lite)' : ''}`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
    return true;
  });

  router.get('/api/session-review-meta', async (req, res, url) => {
    const { session } = backups.loadSessionForRequest(req);
    const body = backups.getSessionReviewMetaResponseBody(finalizeSession(session));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
    return true;
  });

  router.get('/api/session-results', async (req, res, url) => {
    const { leanResultsForList } = require('../lib/result-lean');
    const { session } = backups.loadSessionForRequest(req);
    const finalized = finalizeSession(session);
    const results = Array.isArray(finalized.results) ? finalized.results : [];
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
    const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10) || 500));
    const slice = results.slice(offset, offset + limit);
    // Lean list: omit nested profile blobs — full profile loads on property open.
    // Disk session is unchanged.
    sendJson(res, 200, {
      ok: true,
      offset,
      limit,
      total: results.length,
      hasMore: offset + slice.length < results.length,
      lean: true,
      results: leanResultsForList(slice)
    });
    return true;
  });

  /**
   * Fast Review Leads open: pending keys + lean rows for one bucket.
   * Avoids waiting for the client to hydrate all ~16k results.
   */
  router.get('/api/session-review-queue', async (req, res, url) => {
    const { buildSessionReviewQueue } = require('../lib/review-queue-server');
    const filter = String(url.searchParams.get('filter') || '').trim();
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
    const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '300', 10) || 300));
    const resultsOnly = url.searchParams.get('resultsOnly') === '1'
      || url.searchParams.get('resultsOnly') === 'true';
    const includeKeysParam = url.searchParams.get('includeKeys');
    const includeKeys = includeKeysParam == null
      ? undefined
      : !(includeKeysParam === '0' || includeKeysParam === 'false');
    const { session } = backups.loadSessionForRequest(req);
    const finalized = finalizeSession(session);
    const results = Array.isArray(finalized.results) ? finalized.results : [];
    const body = buildSessionReviewQueue(results, filter, {
      offset,
      limit,
      resultsOnly,
      includeKeys,
      // Exit Review persists reviewedKeysByFilter even when a lean result stamp lags.
      reviewedKeysByFilter: finalized.reviewedKeysByFilter || session?.reviewedKeysByFilter || {}
    });
    if (!body.ok) {
      sendJson(res, 400, body);
      return true;
    }
    sendJson(res, 200, body);
    return true;
  });

  /**
   * Awaiting-review bucket counts for the Analyze KPI strip, computed server-side
   * in one pass so the client does not scan the full session six times.
   */
  router.get('/api/session-awaiting-counts', async (req, res, url) => {
    const { buildAwaitingCounts } = require('../lib/review-queue-server');
    const { session } = backups.loadSessionForRequest(req);
    const finalized = finalizeSession(session);
    const results = Array.isArray(finalized.results) ? finalized.results : [];
    // Must pass reviewedKeysByFilter — same as review-queue — so KPIs hit 0 when
    // Exit Review saved stamps even if a lean row still lags manuallyReviewed.
    sendJson(res, 200, buildAwaitingCounts(results, {
      reviewedKeysByFilter: finalized.reviewedKeysByFilter || session?.reviewedKeysByFilter || {}
    }));
    return true;
  });

  /** On-demand full profile for one property (read-only; does not alter disk). */
  router.get('/api/session-result-profile', async (req, res, url) => {
    const { recordKeyFromResult } = require('../lib/backup-logic');
    const { profilePayloadFromResult } = require('../lib/result-lean');
    const key = String(url.searchParams.get('key') || '').trim();
    if (!key || key === '||') {
      sendJson(res, 400, { ok: false, error: 'key required' });
      return true;
    }
    const { session } = backups.loadSessionForRequest(req);
    const finalized = finalizeSession(session);
    const results = Array.isArray(finalized.results) ? finalized.results : [];
    const match = results.find((r) => recordKeyFromResult(r) === key);
    if (!match) {
      sendJson(res, 404, { ok: false, error: 'result not found', key });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      key,
      ...profilePayloadFromResult(match)
    });
    return true;
  });

  /**
   * Paginated import/scan queue (records). mode=unscanned returns only leads not yet in results
   * so large analyzed sessions can still Start Scan without loading 10k+ finished results as records.
   */
  router.get('/api/session-records', async (req, res, url) => {
    const { session } = backups.loadSessionForRequest(req);
    const finalized = finalizeSession(session);
    const allRecords = Array.isArray(finalized.records) ? finalized.records : [];
    const results = Array.isArray(finalized.results) ? finalized.results : [];
    const mode = String(url.searchParams.get('mode') || 'all').toLowerCase();
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
    const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10) || 500));

    let source = allRecords;
    if (mode === 'unscanned' || mode === 'pending') {
      const { filterUnscannedRecords } = require('../lib/pending-scan');
      source = filterUnscannedRecords(allRecords, results);
    }

    const slice = source.slice(offset, offset + limit);
    sendJson(res, 200, {
      ok: true,
      mode: mode === 'unscanned' || mode === 'pending' ? 'unscanned' : 'all',
      offset,
      limit,
      total: source.length,
      recordsTotal: allRecords.length,
      resultsTotal: results.length,
      hasMore: offset + slice.length < source.length,
      records: slice,
      fileName: finalized.fileName || '',
      importBatches: Array.isArray(finalized.importBatches) ? finalized.importBatches : []
    });
    return true;
  });

  router.get('/api/session-backup', async (req, res, url) => {
    const { scope } = backups.loadSessionForRequest(req);
    const requested = url.searchParams.get('file') || SESSION_LATEST_FILE;
    const fileName = SESSION_BACKUP_FILES.includes(requested) ? requested : SESSION_LATEST_FILE;
    const filePath = scopeSessionPath(DATA_ROOT, fileName, scope);
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { ok: false, error: 'No session backup file on server' });
      return true;
    }
    let session;
    let mtimeMs = 0;
    try {
      ({ session, mtimeMs } = backups.readSessionBackupFromDisk(filePath));
    } catch (e) {
      sendJson(res, 500, { ok: false, error: 'Backup file is corrupt: ' + e.message });
      return true;
    }
    const mergeIncremental = backups.shouldMergeIncrementalIntoSession(session);
    const cacheKey = `${scope.storageKey}|${fileName}|${mtimeMs}|${mergeIncremental ? 'merge' : 'raw'}`;
    if (backups.sessionBackupResponseCache.key === cacheKey && backups.sessionBackupResponseCache.body) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(backups.sessionBackupResponseCache.body);
      return true;
    }
    session = finalizeSession(
      mergeIncremental ? backups.mergeIncrementalIntoSession(session) : session
    );
    const body = JSON.stringify({
      ok: true,
      file: fileName,
      scope: scope.kind,
      storageKey: scope.storageKey,
      savedAt: session.savedAt || null,
      fileName: session.fileName || '',
      records: Array.isArray(session.records) ? session.records.length : 0,
      results: Array.isArray(session.results) ? session.results.length : 0,
      processed: session.processed || 0,
      session
    });
    backups.sessionBackupResponseCache = { key: cacheKey, body };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
    return true;
  });

  router.post('/api/scan-result', async (req, res, url) => {
    if (rejectAnonymousWrite(req, res)) return true;
    backups.rememberActiveScope(req);
    let raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
      return true;
    }
    try {
      if (body?.type === 'meta') {
        await backups.appendScanResult({
          type: 'meta',
          records: body.records || 0,
          processed: body.processed || 0,
          fileName: body.fileName || '',
          savedAt: body.savedAt || Date.now()
        });
        sendJson(res, 200, { ok: true, type: 'meta', durable: true });
        return true;
      }
      const key = body?.key || backups.recordKeyFromResult(body?.result);
      if (!key || !body?.result) {
        sendJson(res, 400, { ok: false, error: 'Missing result key' });
        return true;
      }
      await backups.appendScanResult({
        key,
        result: body.result,
        processed: body.processed || 0,
        savedAt: body.savedAt || Date.now()
      });
      backups.schedulePromoteAfterScanResult(req);
      sendJson(res, 200, { ok: true, key, durable: true });
      return true;
    } catch (err) {
      console.error('[Scan result] durable write failed:', err.message);
      sendJson(res, 500, {
        ok: false,
        error: 'Failed to save scan result to disk: ' + (err.message || 'write error'),
        code: 'SCAN_RESULT_WRITE_FAILED'
      });
      return true;
    }
  });

  router.get('/api/persistence-status', async (req, res) => {
    const { scope } = backups.loadSessionForRequest(req);
    sendJson(res, 200, backups.getPersistenceStatus(scope));
    return true;
  });

  /** Force-merge scan JSONL into this user's LATEST (reload recovery). */
  router.post('/api/recover-incremental', async (req, res) => {
    const { scope } = backups.loadSessionForRequest(req);
    const result = backups.recoverIncrementalIntoScope(scope);
    sendJson(res, 200, { ok: true, ...result, scope: scope.storageKey });
    return true;
  });

  router.get('/api/safety-status', async (req, res, url) => {
    sendJson(res, 200, safety.getSafetyStatus());
    return true;
  });

  router.get('/api/scan-results/stats', async (req, res, url) => {
    const inc = backups.readIncrementalScanResults();
    sendJson(res, 200, {
      ok: true,
      count: inc.count,
      processed: inc.meta.processed,
      savedAt: inc.meta.savedAt || null
    });
    return true;
  });

  /**
   * Lean scan-queue write (v3.1). Updates records + importBatches + fileName only.
   * Never touches results — avoids multi‑10MB client POST on every spreadsheet upload.
   * replaceQueue: store the uploaded list as-is (count the user just saw).
   * append: still skip addresses already scanned or already queued.
   * Body: { replaceQueue?: true, records: [], importBatches?: [], fileName?: string }
   */
  router.post('/api/session-scan-queue', async (req, res, url) => {
    if (rejectAnonymousWrite(req, res)) return true;
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
      return true;
    }
    if (!body || !Array.isArray(body.records)) {
      sendJson(res, 400, { ok: false, error: 'records array required' });
      return true;
    }

    const {
      buildKnownAddressKeySet,
      dedupeIncomingAgainstKnown
    } = require('../lib/address-match');

    const { scope, session } = backups.loadSessionForRequest(req);
    const base = finalizeSession(session) || {};
    const results = Array.isArray(base.results) ? base.results : [];
    const replaceQueue = body.replaceQueue !== false;
    const incoming = body.records;
    const existingBatches = Array.isArray(base.importBatches) ? base.importBatches : [];
    let nextBatches = existingBatches;
    if (Array.isArray(body.importBatches) && body.importBatches.length) {
      // Prefer client list when it is a full replacement (includes prior + new)
      nextBatches = body.importBatches;
    }

    // Drop fat profile objects if client sent them (scan queue only needs identity)
    const lean = incoming.map((r) => {
      if (!r || typeof r !== 'object' || !r.profile) return r;
      const { profile, ...rest } = r;
      return rest;
    });

    let queueRecords = lean;
    let dedupeStats = {
      incoming: lean.length,
      kept: lean.length,
      skippedExact: 0,
      skippedLoose: 0,
      skippedInFile: 0,
      skippedTotal: 0
    };
    if (!replaceQueue) {
      // Append only: don't re-queue addresses already scanned or already waiting
      const known = buildKnownAddressKeySet(
        results,
        Array.isArray(base.records) ? base.records : []
      );
      const deduped = dedupeIncomingAgainstKnown(lean, known);
      queueRecords = [...(Array.isArray(base.records) ? base.records : []), ...deduped.kept];
      dedupeStats = {
        incoming: lean.length,
        kept: deduped.kept.length,
        skippedExact: deduped.skippedExact,
        skippedLoose: deduped.skippedLoose,
        skippedInFile: deduped.skippedInFile,
        skippedTotal: deduped.skippedTotal
      };
    }

    const next = {
      ...base,
      records: replaceQueue ? lean : queueRecords,
      results,
      processed: Number(base.processed) || results.length || 0,
      importBatches: nextBatches,
      fileName: body.fileName != null ? String(body.fileName) : (base.fileName || ''),
      importLeadType: body.importLeadType || base.importLeadType || null,
      savedAt: Number(body.savedAt) || Date.now()
    };

    backups.writeLatestSessionFileForScope(scope, next);
    try {
      safety.writeMirrorLatest(next);
      safety.writeSafetyStatus(next, { reason: url.searchParams.get('reason') || 'scan-queue', tier: 'mirror' });
    } catch (_) {}

    sendJson(res, 200, {
      ok: true,
      records: Array.isArray(next.records) ? next.records.length : 0,
      results: results.length,
      importBatches: Array.isArray(next.importBatches) ? next.importBatches.length : 0,
      fileName: next.fileName || '',
      savedAt: next.savedAt,
      dedupe: dedupeStats
    });
    return true;
  });

  router.post('/api/session-backup', async (req, res, url) => {
    if (rejectAnonymousWrite(req, res)) return true;
    const { scope } = backups.loadSessionForRequest(req);
    let raw = await readBody(req);
    let session;
    try {
      session = JSON.parse(raw);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
      return true;
    }
    if (!session || (!Array.isArray(session.records) && !Array.isArray(session.results))) {
      sendJson(res, 400, { ok: false, error: 'Missing session records/results' });
      return true;
    }
    session = backups.mergeIncrementalIntoSession(session);
    delete session._mergedFromIncremental;
    const latestPath = scopeSessionPath(DATA_ROOT, SESSION_LATEST_FILE, scope);
    const allowDowngrade = url.searchParams.get('allowDowngrade') === '1';
    // forceReplace=1 writes the incoming session as-is (skips merge). Pair with allowDowngrade=1
    // when intentionally removing leads (e.g. clear a city so Filter can re-import).
    const forceReplace = url.searchParams.get('forceReplace') === '1';
    let existingSession = null;
    let existingResults = 0;
    let existingProcessed = 0;
    let existingSavedAt = 0;
    let existingProgress = 0;
    if (fs.existsSync(latestPath)) {
      try {
        existingSession = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
        existingResults = Array.isArray(existingSession.results) ? existingSession.results.length : 0;
        existingProcessed = existingSession.processed || 0;
        existingSavedAt = Number(existingSession.savedAt) || 0;
        existingProgress = backups.countSessionProgress(existingSession);
      } catch (_) {}
    }
    const incomingCount = Array.isArray(session.results) ? session.results.length : 0;
    // Captured before merge — finalizeMergedSession deletes partialReviewSync.
    const rawPartialReviewSync = session.partialReviewSync === true;
    if (existingSession && incomingCount > 0 && !forceReplace) {
      const before = incomingCount;
      session = backupLogic.mergeSessionSave(existingSession, session);
      if ((session.results || []).length !== before || incomingCount < existingResults) {
        console.log(`[Session] Merged client save (${scope.storageKey}: ${before} → ${(session.results || []).length} results)`);
      }
    } else if (forceReplace) {
      console.log(`[Session] Force replace (${scope.storageKey}: existing ${existingResults} → incoming ${incomingCount} results)`);
    }
    const results = Array.isArray(session.results) ? session.results.length : 0;
    const processed = session.processed || 0;
    const incomingSavedAt = Number(session.savedAt) || 0;
    const saveReason = url.searchParams.get('reason') || 'unknown';
    const incomingProgress = backups.countSessionProgress(session);
    const incomingBytes = backups.sessionPayloadBytes(session);
    let existingBytes = 0;
    if (fs.existsSync(latestPath)) {
      try { existingBytes = backups.sessionPayloadBytes(JSON.parse(fs.readFileSync(latestPath, 'utf8'))); } catch (_) {}
    }
    // Exit Review / mid-review metadata is a deliberate partial patch: same result count after
    // merge, but progress score can drop when empty reviewQueue replaces a long stash.
    // Never block those saves — dropping Keep/Change stamps is worse than a score dip.
    const isPartialReviewSave = rawPartialReviewSync
      || /^review(-|_)/i.test(String(saveReason || ''))
      || String(saveReason || '') === 'review-exit'
      || String(saveReason || '') === 'review-metadata'
      || String(saveReason || '') === 'review-progress';
    const incomingWorse = backupLogic.isIncomingSessionWorse(
      { existingResults, existingProcessed, existingProgress, existingBytes, existingSavedAt },
      { results, processed, incomingProgress, incomingBytes, incomingSavedAt }
    );
    if (!allowDowngrade && existingResults > 0 && incomingWorse && !isPartialReviewSave) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      backups.ensureArchiveDirs();
      const quarantine = path.join(ARCHIVE_REJECTED_DIR, `distressAnalyzerSession_REJECTED_${scope.storageKey}_${results}_${stamp}.json`);
      try {
        writeFileAtomic(quarantine, JSON.stringify(session));
        pruneRejectedQuarantine(fs, path, config);
      } catch (_) {}
      sendJson(res, 409, {
        ok: false,
        rejected: true,
        reason: 'downgrade_blocked',
        kept: existingResults,
        incoming: results,
        keptProgress: existingProgress,
        incomingProgress,
        quarantine: path.basename(quarantine)
      });
      return true;
    }
    // Never silently wipe a large pending scan queue (credits/time at risk).
    const confirmUnscannedPurge = url.searchParams.get('confirmUnscannedPurge') === '1';
    const existingRecords = Array.isArray(existingSession?.records) ? existingSession.records.length : 0;
    const incomingRecords = Array.isArray(session.records) ? session.records.length : 0;
    if (
      forceReplace &&
      allowDowngrade &&
      existingRecords - incomingRecords >= 100 &&
      !confirmUnscannedPurge
    ) {
      sendJson(res, 409, {
        ok: false,
        rejected: true,
        reason: 'unscanned_queue_purge_blocked',
        keptRecords: existingRecords,
        incomingRecords,
        droppedRecords: existingRecords - incomingRecords,
        message:
          'Blocked: this save would drop 100+ leads from the scan queue. ' +
          'If intentional, retry with confirmUnscannedPurge=1. Do not purge mid-scan.'
      });
      return true;
    }
    backups.writeLatestSessionFileForScope(scope, session);
    if (saveReason === 'scan-complete' || saveReason === 'scan-stop') {
      try {
        backups.promoteIncrementalToLatest(saveReason, scope);
      } catch (err) {
        console.warn('[Session] promote after scan save failed:', err.message);
      }
    }
    safety.lastMirrorContentHash = backups.sessionContentHash(session);
    const tier = backups.backupTierForReason(saveReason);
    if (tier === 'milestone' || tier === 'manual') {
      if (backups.shouldWriteSessionSnapshot(session, saveReason, existingProgress)) {
        backups.writeRollingAutoBackup(session, `session_${saveReason.replace(/[^a-z0-9_-]/gi, '_')}`, tier);
        backups.lastRollingBackupAt = Date.now();
      } else {
        safety.writeMirrorLatest(session);
      }
    } else {
      safety.writeMirrorLatest(session);
      safety.writeSafetyStatus(session, { reason: saveReason, tier: 'mirror' });
    }
    sendJson(res, 200, {
      ok: true,
      file: SESSION_LATEST_FILE,
      scope: scope.kind,
      storageKey: scope.storageKey,
      results,
      records: Array.isArray(session.records) ? session.records.length : 0,
      processed: session.processed || 0,
      progress: incomingProgress,
      savedAt: session.savedAt || Date.now(),
      tier
    });
    return true;
  });

  /**
   * Remove scan-queue records by importSource / sourceFile without touching results.
   * Body: {
   *   importSource?: "new_analyzer_leads_2026-07-11",
   *   sourceFileIncludes?: "new analyzer leads",
   *   recordsOnly?: true  // default true — never delete AI results
   * }
   */
  router.post('/api/purge-import-source', async (req, res) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
      return true;
    }
    const importSource = String(body.importSource || '').trim();
    const sourceFileIncludes = String(body.sourceFileIncludes || '').trim().toLowerCase();
    const recordsOnly = body.recordsOnly !== false;
    if (!importSource && !sourceFileIncludes) {
      sendJson(res, 400, {
        ok: false,
        error: 'importSource or sourceFileIncludes is required'
      });
      return true;
    }

    function matchesRecord(row) {
      if (importSource && row?.importSource === importSource) return true;
      if (sourceFileIncludes) {
        const src = String(row?.sourceFile || '').toLowerCase();
        if (src.includes(sourceFileIncludes)) return true;
      }
      return false;
    }

    function matchesBatch(batch) {
      const src = String(batch?.sourceFile || '').toLowerCase();
      const id = String(batch?.id || '').toLowerCase();
      if (sourceFileIncludes && src.includes(sourceFileIncludes)) return true;
      if (importSource && id.includes(importSource.toLowerCase())) return true;
      return false;
    }

    const { scope, session } = backups.loadSessionForRequest(req);
    const base = finalizeSession(session) || {};
    const records = Array.isArray(base.records) ? base.records : [];
    const results = Array.isArray(base.results) ? base.results : [];
    const batches = Array.isArray(base.importBatches) ? base.importBatches : [];

    const keptRecords = records.filter((r) => !matchesRecord(r));
    const removedRecords = records.length - keptRecords.length;
    const keptResults = recordsOnly ? results : results.filter((r) => !matchesRecord(r));
    const removedResults = results.length - keptResults.length;
    const keptBatches = batches.filter((b) => !matchesBatch(b));
    const removedBatches = batches.length - keptBatches.length;

    // Block purging queue rows that were never scanned into results (unless explicitly confirmed).
    if (removedRecords > 0 && body.confirmUnscannedPurge !== true) {
      const resultKeys = new Set();
      for (const r of results) {
        const k = backups.recordKeyFromResult?.(r);
        if (k) resultKeys.add(k);
      }
      let unscannedBeingPurged = 0;
      for (const r of records) {
        if (!matchesRecord(r)) continue;
        const k = backups.recordKeyFromResult?.(r);
        if (!k || !resultKeys.has(k)) unscannedBeingPurged += 1;
      }
      if (unscannedBeingPurged > 0) {
        sendJson(res, 409, {
          ok: false,
          rejected: true,
          reason: 'unscanned_purge_blocked',
          removedRecordsWouldBe: removedRecords,
          unscannedBeingPurged,
          message:
            'Blocked: this would delete unscanned leads from the queue before they land in Distressed / Well Maintained / Vacant. ' +
            'Scan them first, or retry with confirmUnscannedPurge: true only if you intentionally want to discard them.'
        });
        return true;
      }
    }

    if (!removedRecords && !removedResults && !removedBatches) {
      sendJson(res, 200, {
        ok: true,
        removedRecords: 0,
        removedResults: 0,
        removedBatches: 0,
        records: records.length,
        results: results.length,
        scope: scope.kind,
        storageKey: scope.storageKey,
        message: 'No matching records found'
      });
      return true;
    }

    const next = {
      ...base,
      records: keptRecords,
      results: keptResults,
      importBatches: keptBatches,
      savedAt: Date.now()
    };
    if (
      String(next.fileName || '')
        .toLowerCase()
        .includes(sourceFileIncludes || 'new analyzer leads')
    ) {
      next.fileName = '';
    }

    backups.rememberActiveScope(req);
    backups.writeLatestSessionFileForScope(scope, next);
    backups.invalidateSessionCaches?.();

    sendJson(res, 200, {
      ok: true,
      removedRecords,
      removedResults,
      removedBatches,
      records: keptRecords.length,
      results: keptResults.length,
      importBatches: keptBatches.length,
      scope: scope.kind,
      storageKey: scope.storageKey
    });
    return true;
  });

  /**
   * Purge leads for a city/state from the Analyze session so Filter can re-import.
   * Body: { city: "Cheyenne", state: "WY" } (state optional but recommended)
   */
  router.post('/api/purge-location', async (req, res) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
      return true;
    }
    const city = String(body.city || '').trim().toLowerCase();
    const stateRaw = String(body.state || '').trim().toLowerCase();
    if (!city) {
      sendJson(res, 400, { ok: false, error: 'city is required' });
      return true;
    }
    const stateAliases = new Set();
    if (stateRaw) {
      stateAliases.add(stateRaw);
      if (stateRaw === 'wy' || stateRaw === 'wyoming') {
        stateAliases.add('wy');
        stateAliases.add('wyoming');
      }
    }

    function matches(row) {
      const rowCity = String(row.city || '').trim().toLowerCase();
      const rowState = String(row.state || '').trim().toLowerCase();
      const addr = String(row.address || '').toLowerCase();
      const cityOk = rowCity === city || addr.includes(`, ${city},`) || addr.startsWith(`${city},`);
      if (!cityOk) return false;
      if (!stateAliases.size) return true;
      if (stateAliases.has(rowState)) return true;
      for (const alias of stateAliases) {
        if (addr.includes(`, ${alias}`) || addr.endsWith(` ${alias}`)) return true;
      }
      return false;
    }

    const { scope, session } = backups.loadSessionForRequest(req);
    const base = finalizeSession(session) || {};
    const records = Array.isArray(base.records) ? base.records : [];
    const results = Array.isArray(base.results) ? base.results : [];
    const keptRecords = records.filter((r) => !matches(r));
    const keptResults = results.filter((r) => !matches(r));
    const removedRecords = records.length - keptRecords.length;
    const removedResults = results.length - keptResults.length;

    if (!removedRecords && !removedResults) {
      sendJson(res, 200, {
        ok: true,
        removedRecords: 0,
        removedResults: 0,
        records: records.length,
        results: results.length,
        scope: scope.kind,
        storageKey: scope.storageKey,
        message: 'No matching leads found'
      });
      return true;
    }

    const next = {
      ...base,
      records: keptRecords,
      results: keptResults,
      savedAt: Date.now()
    };
    if (Array.isArray(base.importBatches)) {
      next.importBatches = base.importBatches.filter((b) => {
        const bCity = String(b.city || '').trim().toLowerCase();
        const bState = String(b.state || '').trim().toLowerCase();
        if (bCity !== city) return true;
        if (!stateAliases.size) return false;
        return !stateAliases.has(bState);
      });
    }
    if (typeof next.processed === 'number') {
      next.processed = Math.min(next.processed, keptResults.length);
    }

    // Free disk before rewrite (Railway ephemeral volumes fill up with rejected backups).
    const freed = freeSessionDiskSpace(fs, path, config);

    try {
      backups.writeLatestSessionFileForScope(scope, next);
    } catch (err) {
      if (err && (err.code === 'ENOSPC' || /no space left/i.test(String(err.message || '')))) {
        freeSessionDiskSpace(fs, path, config, { aggressive: true });
        backups.writeLatestSessionFileForScope(scope, next);
      } else {
        throw err;
      }
    }
    try {
      safety.writeMirrorLatest(next);
    } catch (_) {}

    console.log(
      `[Session] purge-location ${city}/${stateRaw || '*'} ` +
      `(${scope.storageKey}): -${removedRecords} records, -${removedResults} results, freed~${freed.files} files`
    );

    sendJson(res, 200, {
      ok: true,
      removedRecords,
      removedResults,
      records: keptRecords.length,
      results: keptResults.length,
      scope: scope.kind,
      storageKey: scope.storageKey,
      city: body.city,
      state: body.state || '',
      diskFreedFiles: freed.files,
      diskFreedBytes: freed.bytes
    });
    return true;
  });

  /** Lightweight disk cleanup for full volumes (does not touch live session). */
  router.post('/api/disk-cleanup', async (req, res) => {
    const freed = freeSessionDiskSpace(fs, path, config, { aggressive: true });
    sendJson(res, 200, { ok: true, ...freed });
    return true;
  });

  /** Requeue satellite-only fallbacks so Street View can be retried after lookup fixes. */
  router.post('/api/repair-streetview-fallbacks', async (req, res) => {
    let body;
    try {
      body = JSON.parse(await readBody(req) || '{}');
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
      return true;
    }
    const imageryCache = require('../imagery-cache');
    const {
      collectStreetViewRepairCandidates,
      requeueStreetViewRepairs
    } = require('../lib/streetview-repair');
    const from = body.from || '2026-07-12';
    const to = body.to || '2026-07-13';
    const dryRun = body.dryRun === true;
    const { scope, session } = backups.loadSessionForRequest(req);
    const base = finalizeSession(session) || {};
    const candidates = collectStreetViewRepairCandidates(base.results, { from, to });
    let cacheCleared = 0;
    for (const row of candidates) {
      const cleared = imageryCache.clearImageryUnavailable(row.address, 'streetview');
      if (cleared.cleared) cacheCleared += 1;
    }
    if (dryRun || !candidates.length) {
      sendJson(res, 200, {
        ok: true,
        dryRun,
        matched: candidates.length,
        cacheCleared,
        addresses: candidates.map((r) => r.address).slice(0, 50)
      });
      return true;
    }
    const repaired = requeueStreetViewRepairs(base, candidates);
    backups.writeLatestSessionFileForScope(scope, repaired.session);
    if (typeof backups.invalidateSessionCaches === 'function') backups.invalidateSessionCaches();
    sendJson(res, 200, {
      ok: true,
      matched: candidates.length,
      removed: repaired.removed,
      cacheCleared,
      addresses: repaired.addresses.slice(0, 50),
      scope: scope.storageKey
    });
    return true;
  });

  router.post('/api/manual-backup', async (req, res, url) => {
    const fromServer = url.searchParams.get('fromServer') === '1';
    let raw = await readBody(req);
    let session;
    if (fromServer || !String(raw || '').trim()) {
      const { session: diskSession } = backups.loadSessionForRequest(req);
      session = finalizeSession(diskSession);
    } else {
      try {
        session = JSON.parse(raw);
      } catch (e) {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
        return true;
      }
    }
    if (!session || (!Array.isArray(session.records) && !Array.isArray(session.results))) {
      sendJson(res, 400, { ok: false, error: 'Missing session records/results' });
      return true;
    }
    const results = Array.isArray(session.results) ? session.results.length : 0;
    const progress = backups.countSessionProgress(session);
    const manualFile = backups.writeTieredBackup(session, 'manual_download', 'manual');
    sendJson(res, 200, {
      ok: true,
      file: manualFile ? path.basename(manualFile) : null,
      homeCopy: manualFile ? path.basename(manualFile) : null,
      results,
      progress
    });
    return true;
  });

  /**
   * Admin: hard-reset New Analyzer Leads — remove from results + records, scrub JSONL,
   * optionally inject fresh unscanned queue rows from CSV.
   * Body: {
   *   confirmReset: true,
   *   geoKeys?: string[],
   *   freshRecords?: object[],
   *   importBatches?: object[],
   *   fileName?: string
   * }
   */
  router.post('/api/reset-new-analyzer-leads', async (req, res) => {
    let body = {};
    try {
      const raw = await readBody(req);
      if (String(raw || '').trim()) body = JSON.parse(raw);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
      return true;
    }
    if (body.confirmReset !== true) {
      sendJson(res, 400, {
        ok: false,
        error: 'confirmReset: true is required — this permanently removes New Analyzer Leads scan results'
      });
      return true;
    }

    const { resetNewAnalyzerLeadsSession } = require('../lib/reset-new-analyzer-leads');
    const { scope, session } = backups.loadSessionForRequest(req);
    // Do NOT finalize/merge JSONL first — we are about to scrub those keys.
    const base = session && typeof session === 'object' ? session : {};
    const hasFresh = Array.isArray(body.freshRecords) && body.freshRecords.length > 0;
    const prepared = resetNewAnalyzerLeadsSession(base, {
      geoKeys: body.geoKeys || [],
      freshRecords: hasFresh ? body.freshRecords : [],
      importBatches: hasFresh ? (body.importBatches || []) : [],
      // Purge-only: clear the sheet filename so Ready-to-scan waits for a fresh upload.
      fileName: hasFresh
        ? (body.fileName || 'New Analyzer Leads.csv')
        : (body.fileName != null ? String(body.fileName) : '')
    });

    let scrub = { files: 0, removed: 0, kept: 0 };
    try {
      scrub = backups.scrubIncrementalScanResults({
        recordKeys: prepared.stats.scrubRecordKeys,
        geoKeys: prepared.stats.scrubGeoKeys
      });
    } catch (err) {
      console.warn('[Reset] JSONL scrub failed:', err.message);
    }

    backups.ensureArchiveDirs?.();
    try {
      backups.writeRollingAutoBackup(prepared.session, 'reset_new_analyzer_leads', 'milestone');
    } catch (_) {}

    backups.writeLatestSessionFileForScope(scope, prepared.session);
    backups.invalidateSessionCaches?.();
    try {
      safety.writeMirrorLatest(prepared.session);
      safety.writeSafetyStatus(prepared.session, {
        reason: 'reset-new-analyzer-leads',
        tier: 'milestone'
      });
    } catch (_) {}

    // Count pending against results (fresh rows should all be pending)
    const pending = backups.countPendingUnscanned
      ? backups.countPendingUnscanned(prepared.session)
      : prepared.stats.addedFresh;

    sendJson(res, 200, {
      ok: true,
      scope: scope.kind,
      storageKey: scope.storageKey,
      ...prepared.stats,
      pendingUnscanned: pending,
      jsonlScrub: scrub,
      message:
        `Removed ${prepared.stats.removedResults} scanned New Analyzer Leads. ` +
        `Queued ${prepared.stats.addedFresh} fresh leads for Start Scan. ` +
        `Older inventory kept (${prepared.stats.resultsAfter} results).`
    });
    return true;
  });

  /**
   * Admin: open New Analyzer Leads for manual review + requeue unavailable for Start Scan.
   * Runs on the server volume (no giant client round-trip).
   * Body: { requeueUnavailable?: true }
   */
  router.post('/api/prepare-new-analyzer-leads', async (req, res) => {
    let body = {};
    try {
      const raw = await readBody(req);
      if (String(raw || '').trim()) body = JSON.parse(raw);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
      return true;
    }

    const { prepareNewAnalyzerLeadsSession } = require('../lib/prepare-new-analyzer-leads');
    const { scope, session } = backups.loadSessionForRequest(req);
    const base = finalizeSession(session) || {};
    const prepared = prepareNewAnalyzerLeadsSession(base, {
      requeueUnavailable: body.requeueUnavailable !== false
    });

    backups.ensureArchiveDirs?.();
    backups.writeLatestSessionFileForScope(scope, prepared.session);
    backups.invalidateSessionCaches?.();
    try {
      backups.writeRollingAutoBackup(prepared.session, 'prepare_new_analyzer_leads', 'milestone');
    } catch (_) {}
    try {
      safety.writeMirrorLatest(prepared.session);
      safety.writeSafetyStatus(prepared.session, {
        reason: 'prepare-new-analyzer-leads',
        tier: 'milestone'
      });
    } catch (_) {}

    sendJson(res, 200, {
      ok: true,
      scope: scope.kind,
      storageKey: scope.storageKey,
      ...prepared.stats,
      message:
        prepared.stats.requeuedUnavailable > 0
          ? `Opened review for sheet leads. Re-queued ${prepared.stats.requeuedUnavailable} unavailable/failed for Start Scan.`
          : 'Opened New Analyzer Leads for Distressed / Well Maintained / Vacant review. Nothing left that needs a full rescan.'
    });
    return true;
  });
}

module.exports = { register, freeSessionDiskSpace, isDiskSpaceError };