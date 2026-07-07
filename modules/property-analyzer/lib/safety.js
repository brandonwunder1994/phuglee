const { writeFileAtomic, writeFileAtomicBuffer } = require('./fs-atomic');

module.exports = function createSafety(deps) {
  const { config, fs, path, crypto, backups } = deps;
  const {
    DATA_ROOT,
    SESSION_LATEST_FILE,
    AUTO_BACKUPS_DIR,
    MILESTONE_BACKUPS_DIR,
    MANUAL_BACKUPS_DIR,
    ARCHIVE_DIR,
    OFFSITE_MIN_INTERVAL_MS
  } = config;

  let lastMirrorContentHash = '';
  let lastOffsiteCopyAt = 0;
  let lastOffsiteCopyHash = '';

  const safetyState = {
    lastAutoSnapshotAt: 0,
    lastPromoteAt: 0,
    lastSnapshotResults: 0,
    lastPromoteResults: 0,
    lastStartupPromote: null
  };

  function resolveOffsiteDir() {
    const enabled = String(process.env.PDA_OFFSITE_ENABLED || '1').trim() !== '0';
    if (!enabled) return null;
    let dir = String(process.env.PDA_OFFSITE_DIR || '').trim();
    if (!dir) {
      const oneDrive = path.join(process.env.USERPROFILE || ROOT, 'OneDrive', 'PropertyDistressAnalyzer-backups');
      if (fs.existsSync(path.dirname(oneDrive)) || fs.existsSync(path.join(process.env.USERPROFILE || '', 'OneDrive'))) {
        dir = oneDrive;
      }
    }
    if (!dir) return null;
    return path.resolve(dir);
  }

  function newestMilestoneFile() {
    try {
      const files = fs.readdirSync(MILESTONE_BACKUPS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, mtime: fs.statSync(path.join(MILESTONE_BACKUPS_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      return files[0]?.f || null;
    } catch (_) {
      return null;
    }
  }

  function copySessionOffsite() {
    const offsiteDir = resolveOffsiteDir();
    if (!offsiteDir) return { ok: false, skipped: true, reason: 'offsite_disabled' };
    if (Date.now() - lastOffsiteCopyAt < OFFSITE_MIN_INTERVAL_MS) {
      return { ok: true, skipped: true, reason: 'throttled' };
    }
    const latestPath = path.join(DATA_ROOT, SESSION_LATEST_FILE);
    if (!fs.existsSync(latestPath)) return { ok: false, error: 'no_latest' };

    const latestBuf = fs.readFileSync(latestPath);
    const hash = crypto.createHash('sha256').update(latestBuf).digest('hex').slice(0, 16);
    if (hash === lastOffsiteCopyHash) {
      return { ok: true, skipped: true, reason: 'unchanged' };
    }

    try {
      fs.mkdirSync(offsiteDir, { recursive: true });
      fs.mkdirSync(path.join(offsiteDir, 'milestones'), { recursive: true });
      writeFileAtomicBuffer(path.join(offsiteDir, 'distressAnalyzerSession_LATEST.json'), latestBuf);
      const milestone = newestMilestoneFile();
      const copied = ['distressAnalyzerSession_LATEST.json'];
      if (milestone) {
        fs.copyFileSync(
          path.join(MILESTONE_BACKUPS_DIR, milestone),
          path.join(offsiteDir, 'milestones', milestone)
        );
        copied.push(`milestones/${milestone}`);
      }
      const meta = { copiedAt: Date.now(), files: copied, results: JSON.parse(latestBuf).results?.length || 0 };
      writeFileAtomic(path.join(offsiteDir, 'OFFSITE_MANIFEST.json'), JSON.stringify(meta, null, 2));
      lastOffsiteCopyAt = Date.now();
      lastOffsiteCopyHash = hash;
      console.log(`[Offsite] Copied ${copied.length} file(s) to ${offsiteDir}`);
      return { ok: true, dir: offsiteDir, files: copied, at: lastOffsiteCopyAt };
    } catch (err) {
      console.warn('[Offsite] Copy failed:', err.message);
      return { ok: false, error: err.message };
    }
  }

  function writeSafetyStatus(session, extra = {}) {
    backups.ensureAutoBackupsDir();
    const results = Array.isArray(session?.results) ? session.results.length : 0;
    const payload = {
      updatedAt: Date.now(),
      results,
      records: Array.isArray(session?.records) ? session.records.length : 0,
      processed: session?.processed || 0,
      fileName: session?.fileName || '',
      ...extra
    };
    try {
      writeFileAtomic(path.join(AUTO_BACKUPS_DIR, 'SAFETY_STATUS.json'), JSON.stringify(payload, null, 2));
    } catch (_) {}
    return payload;
  }

  function writeMirrorLatest(session) {
    if (!session) return false;
    const hash = backups.sessionContentHash(session);
    if (hash === lastMirrorContentHash) return false;
    const json = JSON.stringify(session);
    try {
      writeFileAtomic(path.join(AUTO_BACKUPS_DIR, 'MIRROR_LATEST.json'), json);
      lastMirrorContentHash = hash;
      return true;
    } catch (err) {
      console.warn('[Safety] Mirror update failed:', err.message);
      return false;
    }
  }

  function runAutoSafetyTick() {
    try {
      const inc = backups.readIncrementalScanResults();
      backups.promoteIncrementalToLatest('interval');
      const session = backups.readLatestSessionFile();
      writeMirrorLatest(session);
      writeSafetyStatus(session, {
        incrementalCount: inc.count,
        lastPromoteAt: safetyState.lastPromoteAt || null,
        lastAutoSnapshotAt: safetyState.lastAutoSnapshotAt || null,
        progress: backups.countSessionProgress(session)
      });
      copySessionOffsite();
    } catch (err) {
      console.warn('[Safety] Auto tick failed:', err.message);
    }
  }

  function getSafetyStatus() {
    const latest = backups.readLatestSessionFile();
    const inc = backups.readIncrementalScanResults();
    backups.ensureAutoBackupsDir();
    let autoBackupCount = 0;
    try {
      autoBackupCount = fs.readdirSync(AUTO_BACKUPS_DIR)
        .filter((f) => f.endsWith('.json') && f !== 'SAFETY_STATUS.json' && f !== 'MIRROR_LATEST.json').length;
    } catch (_) {}
    let milestoneBackupCount = 0;
    let manualBackupCount = 0;
    try {
      milestoneBackupCount = fs.readdirSync(MILESTONE_BACKUPS_DIR).filter((f) => f.endsWith('.json')).length;
      manualBackupCount = fs.readdirSync(MANUAL_BACKUPS_DIR).filter((f) => f.endsWith('.json')).length;
    } catch (_) {}
    return {
      ok: true,
      latestResults: Array.isArray(latest.results) ? latest.results.length : 0,
      latestRecords: Array.isArray(latest.records) ? latest.records.length : 0,
      latestSavedAt: Number(latest.savedAt) || null,
      latestProgress: backups.countSessionProgress(latest),
      incrementalCount: inc.count,
      incrementalProcessed: inc.meta.processed,
      lastPromoteAt: safetyState.lastPromoteAt || null,
      lastAutoSnapshotAt: safetyState.lastAutoSnapshotAt || null,
      autoBackupCount,
      milestoneBackupCount,
      manualBackupCount,
      autoBackupsDir: AUTO_BACKUPS_DIR,
      milestoneBackupsDir: MILESTONE_BACKUPS_DIR,
      manualBackupsDir: MANUAL_BACKUPS_DIR,
      mirrorFile: path.join(AUTO_BACKUPS_DIR, 'MIRROR_LATEST.json'),
      canonicalLatest: path.join(DATA_ROOT, SESSION_LATEST_FILE),
      archiveDir: ARCHIVE_DIR,
      archiveManifest: path.join(ARCHIVE_DIR, 'ARCHIVE_MANIFEST.json'),
      lastStartupPromote: safetyState.lastStartupPromote,
      autoSnapshotsDeprecated: true,
      offsiteDir: resolveOffsiteDir(),
      offsiteEnabled: !!resolveOffsiteDir(),
      lastOffsiteCopyAt: lastOffsiteCopyAt || null,
      lastOffsiteCopyHash: lastOffsiteCopyHash || null
    };
  }

  return {
    safetyState,
    writeSafetyStatus,
    writeMirrorLatest,
    runAutoSafetyTick,
    getSafetyStatus,
    resolveOffsiteDir,
    copySessionOffsite,
    newestMilestoneFile,
    get lastMirrorContentHash() { return lastMirrorContentHash; },
    set lastMirrorContentHash(v) { lastMirrorContentHash = v; },
    get lastOffsiteCopyAt() { return lastOffsiteCopyAt; },
    set lastOffsiteCopyAt(v) { lastOffsiteCopyAt = v; },
    get lastOffsiteCopyHash() { return lastOffsiteCopyHash; },
    set lastOffsiteCopyHash(v) { lastOffsiteCopyHash = v; }
  };
};