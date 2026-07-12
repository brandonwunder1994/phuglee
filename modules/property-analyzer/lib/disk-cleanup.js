'use strict';

/**
 * Keep newest rejected-save quarantines; drop old ones (downgrade_blocked 409 bodies).
 */
function pruneRejectedQuarantine(fs, path, config, opts = {}) {
  const dir = config.ARCHIVE_REJECTED_DIR;
  const maxFiles = Number(opts.maxFiles ?? config.MAX_REJECTED_QUARANTINE) || 8;
  const maxAgeMs = Number(opts.maxAgeMs ?? config.REJECTED_QUARANTINE_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  let files = 0;
  let bytes = 0;
  if (!dir || !fs.existsSync(dir)) return { files, bytes };

  let entries = [];
  try {
    entries = fs.readdirSync(dir)
      .filter((n) => /^distressAnalyzerSession_REJECTED_/i.test(n) && n.endsWith('.json'))
      .map((name) => {
        const full = path.join(dir, name);
        try {
          const st = fs.statSync(full);
          return { full, mtimeMs: st.mtimeMs, size: st.size || 0 };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (_) {
    return { files, bytes };
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (i < maxFiles && entry.mtimeMs >= cutoff) continue;
    try {
      fs.unlinkSync(entry.full);
      files += 1;
      bytes += entry.size;
    } catch (_) {}
  }
  return { files, bytes };
}

/**
 * Free disk space for session saves, imagery cache, and scan logs.
 * Never deletes live distressAnalyzerSession_LATEST.json files.
 */
function freeSessionDiskSpace(fs, path, config, { aggressive = false } = {}) {
  const dirs = [
    config.AUTO_BACKUPS_DIR,
    config.ARCHIVE_DIR
  ];
  if (aggressive) {
    dirs.push(
      config.MILESTONE_BACKUPS_DIR,
      config.MANUAL_BACKUPS_DIR,
      config.GEMINI_AUDIT_DIR
    );
  }
  let files = 0;
  let bytes = 0;

  function rmFile(full) {
    try {
      const st = fs.statSync(full);
      fs.unlinkSync(full);
      files += 1;
      bytes += st.size || 0;
      return true;
    } catch (_) {
      return false;
    }
  }

  function rmTree(dir, depth = 0) {
    if (!dir || !fs.existsSync(dir)) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          if (depth === 0 && /archive$/i.test(dir) && entry.name !== 'rejected') {
            continue;
          }
          rmTree(full, depth + 1);
          try {
            fs.rmdirSync(full);
          } catch (_) {}
        } else {
          if (/distressAnalyzerSession_LATEST\.json$/i.test(entry.name)) continue;
          rmFile(full);
        }
      } catch (_) {}
    }
  }

  for (const dir of dirs) rmTree(dir, 0);

  const rejectedPrune = pruneRejectedQuarantine(fs, path, config);
  files += rejectedPrune.files;
  bytes += rejectedPrune.bytes;

  // Session .bak / .tmp beside live files in users/*
  try {
    const usersDir = path.join(config.DATA_ROOT, 'users');
    if (fs.existsSync(usersDir)) {
      for (const user of fs.readdirSync(usersDir)) {
        const uDir = path.join(usersDir, user);
        let entries = [];
        try {
          entries = fs.readdirSync(uDir);
        } catch (_) {
          continue;
        }
        for (const name of entries) {
          if (
            !/\.tmp$/i.test(name)
            && !/\.bak/i.test(name)
            && !/^distressAnalyzerSession_.*\.json\.bak/i.test(name)
          ) {
            continue;
          }
          rmFile(path.join(uDir, name));
        }
      }
    }
  } catch (_) {}

  // Imagery cache temp files + oversized log
  try {
    const imageryRoot = path.join(config.DATA_ROOT, 'property_imagery');
    const logFile = path.join(config.DATA_ROOT || path.join(__dirname, '..'), 'logs', 'imagery-cache.log');
    if (fs.existsSync(logFile)) {
      try {
        const st = fs.statSync(logFile);
        if (st.size > 2 * 1024 * 1024) {
          fs.writeFileSync(logFile, `[${new Date().toISOString()}] log truncated after ${st.size} bytes\n`);
          files += 1;
          bytes += st.size;
        }
      } catch (_) {}
    }
    if (fs.existsSync(imageryRoot)) {
      for (const type of ['streetview', 'satellite']) {
        const typeDir = path.join(imageryRoot, type);
        if (!fs.existsSync(typeDir)) continue;
        for (const name of fs.readdirSync(typeDir)) {
          if (!/\.tmp$/i.test(name)) continue;
          rmFile(path.join(typeDir, name));
        }
      }
    }
  } catch (_) {}

  // Old incremental scan logs (merged into session — safe after 3 days)
  try {
    const scanDir = path.join(config.DATA_ROOT, 'scan_results');
    if (fs.existsSync(scanDir)) {
      const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
      for (const name of fs.readdirSync(scanDir)) {
        if (!/^scan_results_.*\.jsonl$/i.test(name)) continue;
        const full = path.join(scanDir, name);
        try {
          const st = fs.statSync(full);
          if (st.mtimeMs < cutoff) rmFile(full);
        } catch (_) {}
      }
    }
  } catch (_) {}

  return { files, bytes };
}

function isDiskSpaceError(err) {
  const code = String(err?.code || '').toUpperCase();
  const msg = String(err?.message || err || '').toLowerCase();
  return code === 'ENOSPC' || /no space left on device|disk full|not enough space/.test(msg);
}

module.exports = { freeSessionDiskSpace, pruneRejectedQuarantine, isDiskSpaceError };