'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isDiskSpaceError,
  pruneGeminiAudit,
  pruneBackupsToLimits,
  runStartupVolumeMaintenance
} = require('../lib/disk-cleanup');

describe('disk-cleanup', () => {
  it('detects ENOSPC and no-space-left messages', () => {
    assert.equal(isDiskSpaceError({ code: 'ENOSPC', message: 'write' }), true);
    assert.equal(isDiskSpaceError('ENOSPC: no space left on device, write'), true);
    assert.equal(isDiskSpaceError('Street View rate limit'), false);
  });
});

describe('volume maintenance', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pda-volume-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('prunes old gemini audit files but keeps the newest', () => {
    const auditDir = path.join(tmpRoot, 'gemini_audit');
    fs.mkdirSync(auditDir, { recursive: true });
    const oldFile = path.join(auditDir, 'gemini_audit_2020-01-01.jsonl');
    const newFile = path.join(auditDir, 'gemini_audit_2026-07-13.jsonl');
    fs.writeFileSync(oldFile, 'x'.repeat(100));
    fs.writeFileSync(newFile, 'y'.repeat(50));
    const oldTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
    fs.utimesSync(oldFile, oldTime / 1000, oldTime / 1000);

    const config = {
      GEMINI_AUDIT_DIR: auditDir,
      GEMINI_AUDIT_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
      GEMINI_AUDIT_KEEP_MIN: 1
    };
    const result = pruneGeminiAudit(fs, path, config);
    assert.equal(result.files, 1);
    assert.ok(!fs.existsSync(oldFile));
    assert.ok(fs.existsSync(newFile));
  });

  it('enforces milestone backup cap on startup maintenance', () => {
    const milestoneDir = path.join(tmpRoot, 'backups', 'milestones');
    fs.mkdirSync(milestoneDir, { recursive: true });
    for (let i = 0; i < 4; i += 1) {
      const file = path.join(milestoneDir, `session_${i}.json`);
      fs.writeFileSync(file, JSON.stringify({ i }));
      const t = Date.now() - i * 1000;
      fs.utimesSync(file, t / 1000, t / 1000);
    }

    const config = {
      AUTO_BACKUPS_DIR: path.join(tmpRoot, 'backups', 'auto'),
      MILESTONE_BACKUPS_DIR: milestoneDir,
      MANUAL_BACKUPS_DIR: path.join(tmpRoot, 'backups', 'manual'),
      ARCHIVE_DIR: path.join(tmpRoot, 'backups', 'archive'),
      ARCHIVE_REJECTED_DIR: path.join(tmpRoot, 'backups', 'archive', 'rejected'),
      MAX_EPHEMERAL_BACKUPS: 4,
      MAX_MILESTONE_BACKUPS: 2,
      MAX_MANUAL_BACKUPS: 3,
      MAX_REJECTED_QUARANTINE: 8,
      REJECTED_QUARANTINE_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
      DATA_ROOT: tmpRoot,
      GEMINI_AUDIT_DIR: path.join(tmpRoot, 'gemini_audit'),
      GEMINI_AUDIT_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
      GEMINI_AUDIT_KEEP_MIN: 1
    };

    const result = runStartupVolumeMaintenance(fs, path, config);
    const remaining = fs.readdirSync(milestoneDir).filter((f) => f.endsWith('.json'));
    assert.equal(remaining.length, 2);
    assert.ok(result.files >= 2);
  });
});
