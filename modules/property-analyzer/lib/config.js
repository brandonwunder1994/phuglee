const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

module.exports = {
  PORT: 3456,
  LOCAL_HOSTNAME: 'distressos.local',
  ROOT,
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
  GEMINI_AUDIT_DIR: path.join(ROOT, 'gemini_audit'),
  SCAN_RESULTS_DIR: path.join(ROOT, 'scan_results'),
  AUTO_BACKUPS_DIR: path.join(ROOT, 'backups', 'auto'),
  MILESTONE_BACKUPS_DIR: path.join(ROOT, 'backups', 'milestones'),
  MANUAL_BACKUPS_DIR: path.join(ROOT, 'backups', 'manual'),
  ARCHIVE_DIR: path.join(ROOT, 'backups', 'archive'),
  ARCHIVE_REJECTED_DIR: path.join(ROOT, 'backups', 'archive', 'rejected'),
  AUTH_TOKEN_FILE: path.join(ROOT, 'logs', 'pda-auth.token'),
  MAPS_KEY_FILE: path.join(ROOT, 'maps-api-key.txt'),
  OFFSITE_MIN_INTERVAL_MS: 5 * 60 * 1000,
  MAX_EPHEMERAL_BACKUPS: 12,
  MAX_MILESTONE_BACKUPS: 80,
  MAX_MANUAL_BACKUPS: 30,
  AUTO_SAFETY_TICK_MS: 60 * 1000,
  AUTO_SNAPSHOT_MIN_MS: 5 * 60 * 1000,
  TIME_SNAPSHOT_MIN_MS: 5 * 60 * 1000,
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