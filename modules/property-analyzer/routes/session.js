const { writeFileAtomic } = require('../lib/fs-atomic');
const backupLogic = require('../lib/backup-logic');
const { scopeSessionPath } = require('../lib/user-session');
const { freeSessionDiskSpace, pruneRejectedQuarantine, isDiskSpaceError } = require('../lib/disk-cleanup');

function register(ctx) {
  const { router, sendJson, readBody, backups, safety, config, fs, path } = ctx;
  const { DATA_ROOT, SESSION_BACKUP_FILES, SESSION_LATEST_FILE, ARCHIVE_REJECTED_DIR } = config;

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
      const {
        addressMatchKey,
        addressMatchKeyLoose,
        buildKnownAddressKeySet
      } = require('../lib/address-match');
      const recordKeyOf = (r) => `${r?.email || ''}|${r?.phone || ''}|${r?.address || ''}`;
      const known = buildKnownAddressKeySet(results, []);
      const existingRecordKeys = new Set();
      for (const r of results) {
        const rk = recordKeyOf(r);
        if (rk && rk !== '||') existingRecordKeys.add(rk);
      }
      const isScanned = (r) => {
        const rk = recordKeyOf(r);
        if (rk && rk !== '||' && existingRecordKeys.has(rk)) return true;
        const k = addressMatchKey(r);
        if (k && known.exact.has(k)) return true;
        const l = addressMatchKeyLoose(r);
        if (l && known.loose.has(l) && !String(r.postal || r.zip || '').trim()) return true;
        return false;
      };
      source = allRecords.filter((r) => !isScanned(r));
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
    backups.rememberActiveScope(req);
    let raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON: ' + e.message });
      return true;
    }
    if (body?.type === 'meta') {
      backups.appendScanResult({
        type: 'meta',
        records: body.records || 0,
        processed: body.processed || 0,
        fileName: body.fileName || '',
        savedAt: body.savedAt || Date.now()
      });
      sendJson(res, 200, { ok: true, type: 'meta' });
      return true;
    }
    const key = body?.key || backups.recordKeyFromResult(body?.result);
    if (!key || !body?.result) {
      sendJson(res, 400, { ok: false, error: 'Missing result key' });
      return true;
    }
    backups.appendScanResult({
      key,
      result: body.result,
      processed: body.processed || 0,
      savedAt: body.savedAt || Date.now()
    });
    backups.schedulePromoteAfterScanResult(req);
    sendJson(res, 200, { ok: true, key });
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
   * Server-side dedupe against full results DB so already-scanned addresses never re-queue.
   * Body: { replaceQueue?: true, records: [], importBatches?: [], fileName?: string }
   */
  router.post('/api/session-scan-queue', async (req, res, url) => {
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

    // Authoritative dedupe vs full scanned results (and non-replace append vs existing queue)
    const known = buildKnownAddressKeySet(
      results,
      replaceQueue ? [] : (Array.isArray(base.records) ? base.records : [])
    );
    const deduped = dedupeIncomingAgainstKnown(lean, known);

    const next = {
      ...base,
      records: replaceQueue
        ? deduped.kept
        : [...(Array.isArray(base.records) ? base.records : []), ...deduped.kept],
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
      dedupe: {
        incoming: lean.length,
        kept: deduped.kept.length,
        skippedExact: deduped.skippedExact,
        skippedLoose: deduped.skippedLoose,
        skippedInFile: deduped.skippedInFile,
        skippedTotal: deduped.skippedTotal
      }
    });
    return true;
  });

  router.post('/api/session-backup', async (req, res, url) => {
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
    const incomingWorse = backupLogic.isIncomingSessionWorse(
      { existingResults, existingProcessed, existingProgress, existingBytes, existingSavedAt },
      { results, processed, incomingProgress, incomingBytes, incomingSavedAt }
    );
    if (!allowDowngrade && existingResults > 0 && incomingWorse) {
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
    backups.writeLatestSessionFileForScope(scope, session);
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
      if (id.includes('new_analyzer_leads')) return true;
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
}

module.exports = { register, freeSessionDiskSpace, isDiskSpaceError };