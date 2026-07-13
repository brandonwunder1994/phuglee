const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DATA_ROOT = process.env.PDA_DATA_ROOT
  ? path.resolve(process.env.PDA_DATA_ROOT)
  : ROOT;

function intEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const GEMINI_AUDIT_MAX_AGE_DAYS = intEnv('PDA_GEMINI_AUDIT_MAX_AGE_DAYS', 7);

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

for (const dir of [
  DATA_ROOT,
  path.join(DATA_ROOT, 'backups', 'auto'),
  path.join(DATA_ROOT, 'backups', 'milestones'),
  path.join(DATA_ROOT, 'backups', 'manual'),
  path.join(DATA_ROOT, 'backups', 'archive', 'rejected'),
  path.join(DATA_ROOT, 'logs'),
  path.join(DATA_ROOT, 'gemini_audit'),
  path.join(DATA_ROOT, 'scan_results'),
  path.join(DATA_ROOT, 'property_imagery')
]) {
  ensureDir(dir);
}

module.exports = {
  PORT: 3456,
  LOCAL_HOSTNAME: 'distressos.local',
  ROOT,
  DATA_ROOT,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  PUBLIC_INDEX: path.join(ROOT, 'public', 'index.html'),
  HTML_FILE: path.join(ROOT, 'public', 'index.html'),
  PERSISTENCE_JS: path.join(ROOT, 'persistence.js'),
  SESSION_BACKUP_FILES: [
    'distressAnalyzerSession_LATEST.json',
    'distressAnalyzerSession_RECOVERED.json',
    'distressAnalyzerSession_BEFORE_PROMOTE_ALL.json',
    'distressAnalyzerSession_BEST.json',
    'distressAnalyzerSession_RESTORE.json',
    'distressAnalyzerSession_RECONSTRUCTED.json'
  ],
  SESSION_LATEST_FILE: 'distressAnalyzerSession_LATEST.json',
  GEMINI_AUDIT_DIR: path.join(DATA_ROOT, 'gemini_audit'),
  SCAN_RESULTS_DIR: path.join(DATA_ROOT, 'scan_results'),
  AUTO_BACKUPS_DIR: path.join(DATA_ROOT, 'backups', 'auto'),
  MILESTONE_BACKUPS_DIR: path.join(DATA_ROOT, 'backups', 'milestones'),
  MANUAL_BACKUPS_DIR: path.join(DATA_ROOT, 'backups', 'manual'),
  ARCHIVE_DIR: path.join(DATA_ROOT, 'backups', 'archive'),
  ARCHIVE_REJECTED_DIR: path.join(DATA_ROOT, 'backups', 'archive', 'rejected'),
  AUTH_TOKEN_FILE: path.join(DATA_ROOT, 'logs', 'pda-auth.token'),
  MAPS_KEY_FILE: path.join(DATA_ROOT, 'maps-api-key.txt'),
  OFFSITE_MIN_INTERVAL_MS: 5 * 60 * 1000,
  /** Railway 500MB volumes: keep few full-session copies (override via PDA_MAX_* env). */
  MAX_EPHEMERAL_BACKUPS: intEnv('PDA_MAX_EPHEMERAL_BACKUPS', 4),
  MAX_MILESTONE_BACKUPS: intEnv('PDA_MAX_MILESTONE_BACKUPS', 2),
  MAX_MANUAL_BACKUPS: intEnv('PDA_MAX_MANUAL_BACKUPS', 3),
  GEMINI_AUDIT_MAX_AGE_MS: GEMINI_AUDIT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  GEMINI_AUDIT_KEEP_MIN: intEnv('PDA_GEMINI_AUDIT_KEEP_MIN', 1),
  MAX_REJECTED_QUARANTINE: 8,
  REJECTED_QUARANTINE_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  AUTO_SAFETY_TICK_MS: 60 * 1000,
  AUTO_SNAPSHOT_MIN_MS: 5 * 60 * 1000,
  PROMOTE_BATCH_MIN: 45,
  PROMOTE_DEBOUNCE_MS: 35000,
  ROLLING_BACKUP_MIN_MS: 120000,
  ROLLING_BACKUP_MIN_NEW_RESULTS: 60,
  MILESTONE_SAVE_REASONS: new Set([
    'manual', 'load-backup', 'file-upload', 'scan-complete', 'scan-stop', 'restore',
    'review-change', 'review-exit', 'review-blurred', 'review-action', 'review-undo',
    'review-progress', 'review-milestone', 'review-metadata', 'review-metadata-merge', 'tier-edit', 'destructive-guard', 'flush-sync', 'beforeunload',
    'visibility-hidden', 'llm-result'
  ]),
  loadEnvFile() {
    const envPath = path.join(ROOT, '.env');
    if (!fs.existsSync(envPath)) return;
    try {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
    } catch (err) {
      console.warn('[Env] Could not read .env:', err.message);
    }
  }
};