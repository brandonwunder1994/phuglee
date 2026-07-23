const fs = require('fs');
const path = require('path');

/**
 * Atomic JSON write that works on Windows (rename cannot overwrite existing files).
 * @param {string} filePath
 * @param {string|object} data - objects are JSON.stringify(..., null, 2)
 * @param {{ pretty?: boolean }} [opts]
 */
function writeJsonAtomic(filePath, data, opts = {}) {
  const pretty = opts.pretty !== false;
  const body = typeof data === 'string'
    ? data
    : JSON.stringify(data, null, pretty ? 2 : 0);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, body, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Windows cannot rename over an existing file; Linux can.
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      fs.renameSync(tmp, filePath);
    } catch (err2) {
      try { fs.copyFileSync(tmp, filePath); } catch (_) { /* fall through */ }
      try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
      if (!fs.existsSync(filePath)) throw err2 || err;
    }
  }
  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  } catch (_) { /* ignore */ }
}

/**
 * Remove orphan write temps under a catalog root (e.g. index.json.PID.TS.tmp).
 * Never deletes non-tmp JSON lead/index files.
 * @param {string} rootDir
 * @returns {number} count removed
 */
function cleanupStaleJsonTemps(rootDir) {
  let removed = 0;
  if (!rootDir || !fs.existsSync(rootDir)) return 0;

  function isOrphanTemp(name) {
    // index.json.11124.1783961249708.tmp  or  leadId.json.pid.ts.tmp
    return /\.json\.\d+\.\d+\.tmp$/i.test(name);
  }

  function sweep(dir, depth) {
    if (depth > 3) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'leads' || ent.name === 'contracts') sweep(full, depth + 1);
        continue;
      }
      if (!ent.isFile() || !isOrphanTemp(ent.name)) continue;
      try {
        fs.unlinkSync(full);
        removed += 1;
      } catch (_) { /* locked */ }
    }
  }

  sweep(rootDir, 0);
  return removed;
}

module.exports = { writeJsonAtomic, cleanupStaleJsonTemps };
