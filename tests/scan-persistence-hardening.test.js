'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const createBackups = require('../modules/property-analyzer/lib/backups');

function makeTempConfig(root) {
  const scanDir = path.join(root, 'scan_results');
  const autoDir = path.join(root, 'backups', 'auto');
  const milestoneDir = path.join(root, 'backups', 'milestones');
  const manualDir = path.join(root, 'backups', 'manual');
  const archiveDir = path.join(root, 'backups', 'archive');
  const rejectedDir = path.join(archiveDir, 'rejected');
  for (const dir of [root, scanDir, autoDir, milestoneDir, manualDir, archiveDir, rejectedDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return {
    DATA_ROOT: root,
    SESSION_LATEST_FILE: 'distressAnalyzerSession_LATEST.json',
    SCAN_RESULTS_DIR: scanDir,
    AUTO_BACKUPS_DIR: autoDir,
    MILESTONE_BACKUPS_DIR: milestoneDir,
    MANUAL_BACKUPS_DIR: manualDir,
    ARCHIVE_DIR: archiveDir,
    ARCHIVE_REJECTED_DIR: rejectedDir,
    MAX_EPHEMERAL_BACKUPS: 4,
    MAX_MILESTONE_BACKUPS: 2,
    MAX_MANUAL_BACKUPS: 3,
    AUTO_SNAPSHOT_MIN_MS: 5 * 60 * 1000,
    PROMOTE_BATCH_MIN: 5,
    PROMOTE_DEBOUNCE_MS: 5000,
    ROLLING_BACKUP_MIN_MS: 60000,
    ROLLING_BACKUP_MIN_NEW_RESULTS: 25,
    MILESTONE_SAVE_REASONS: new Set(['manual', 'scan-complete'])
  };
}

describe('scan persistence hardening (source guards)', () => {
  it('pushIncrementalScanResult uses notifyScanIssue and retries', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../modules/property-analyzer/public/js/state.js'),
      'utf8'
    );
    assert.match(src, /notifyScanIssue\s*\(/);
    assert.doesNotMatch(src, /noteScanIssue|showScanIssueAlert/);
    assert.match(src, /tryNumber < 2/);
    assert.match(src, /Scan results are not saving/);
  });

  it('loadSession recovers incremental before summary', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../modules/property-analyzer/public/js/state.js'),
      'utf8'
    );
    const recoverIdx = src.indexOf("/api/recover-incremental");
    const summaryIdx = src.indexOf('fetchSessionSummary()');
    assert.ok(recoverIdx > 0, 'recover-incremental call missing');
    assert.ok(summaryIdx > recoverIdx, 'recover must run before fetchSessionSummary');
  });

  it('session routes await durable writes and expose recovery APIs', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../modules/property-analyzer/routes/session.js'),
      'utf8'
    );
    assert.match(src, /await backups\.appendScanResult/);
    assert.match(src, /\/api\/persistence-status/);
    assert.match(src, /\/api\/recover-incremental/);
    assert.match(src, /SCAN_RESULT_WRITE_FAILED/);
  });

  it('promote cadence is credit-safe (batch 5 / debounce 5s)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../modules/property-analyzer/lib/config.js'),
      'utf8'
    );
    assert.match(src, /PROMOTE_BATCH_MIN:\s*5/);
    assert.match(src, /PROMOTE_DEBOUNCE_MS:\s*5000/);
  });

  it('backups exports recoverIncrementalIntoScope and getPersistenceStatus', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../modules/property-analyzer/lib/backups.js'),
      'utf8'
    );
    assert.match(src, /recoverIncrementalIntoScope,/);
    assert.match(src, /getPersistenceStatus,/);
  });
});

describe('scan persistence hardening (backups API)', () => {
  let tempRoot;
  let backups;
  let config;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pda-persist-'));
    config = makeTempConfig(tempRoot);
    backups = createBackups({
      config,
      fs,
      path,
      crypto,
      getSafety: () => null
    });
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (_) {}
  });

  it('appendScanResult returns a promise and writes JSONL', async () => {
    const result = {
      address: '100 Test St',
      score: 8,
      tier: 'distressed',
      analyzedAt: Date.now()
    };
    const out = await backups.appendScanResult({
      key: '100|test|st',
      result,
      processed: 1,
      savedAt: Date.now()
    });
    assert.equal(out.ok, true);
    assert.ok(fs.existsSync(out.file));
    const body = fs.readFileSync(out.file, 'utf8');
    assert.match(body, /100 Test St/);
  });

  it('recoverIncrementalIntoScope promotes JSONL into empty LATEST', async () => {
    const scope = { storageKey: '_anonymous' };
    const before = backups.readLatestSessionFileForScope(scope);
    assert.equal((before.results || []).length, 0);

    await backups.appendScanResult({
      key: '200|oak|ave',
      result: {
        address: '200 Oak Ave',
        score: 7,
        tier: 'distressed',
        analyzedAt: Date.now()
      },
      processed: 2,
      savedAt: Date.now()
    });

    const recovered = backups.recoverIncrementalIntoScope(scope);
    assert.ok(recovered.incremental >= 1);
    assert.ok(recovered.results >= 1);
    const after = backups.readLatestSessionFileForScope(scope);
    assert.ok((after.results || []).length >= 1);
  });

  it('getPersistenceStatus reports writable root and incremental count', () => {
    const scope = { storageKey: '_anonymous' };
    const status = backups.getPersistenceStatus(scope);
    assert.equal(status.ok, true);
    assert.equal(status.writable, true);
    assert.equal(status.dataRoot, tempRoot);
    assert.ok(status.incrementalCount >= 1);
    assert.equal(typeof status.looksEphemeral, 'boolean');
  });
});
