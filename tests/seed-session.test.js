const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureSeededSession, sessionResultCount } = require('../modules/property-analyzer/lib/seed-session');

const ROOT = path.join(__dirname, '..', 'modules', 'property-analyzer');
const SEED = path.join(__dirname, '..', 'scripts', 'seed-data', 'distressAnalyzerSession_LATEST.json');
const SESSION_FILE = 'distressAnalyzerSession_LATEST.json';

test('sessionResultCount reads analyzed property count', () => {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  assert.ok(sessionResultCount(seed) > 10000);
});

test('ensureSeededSession seeds admin and vault when global is an empty stub', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pda-seed-'));
  const globalPath = path.join(tmp, SESSION_FILE);
  const adminPath = path.join(tmp, 'users', 'admin', SESSION_FILE);
  const vaultPath = path.join(tmp, 'users', '_vault', SESSION_FILE);

  fs.writeFileSync(globalPath, JSON.stringify({ records: [], results: [], savedAt: Date.now() }));

  const result = ensureSeededSession({
    config: {
      ROOT,
      DATA_ROOT: tmp,
      SESSION_LATEST_FILE: SESSION_FILE
    }
  });

  assert.equal(result.seeded, true);
  assert.ok(fs.existsSync(adminPath));
  assert.ok(fs.existsSync(vaultPath));

  const admin = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
  const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
  const global = JSON.parse(fs.readFileSync(globalPath, 'utf8'));

  assert.ok(sessionResultCount(admin) > 10000);
  assert.ok(sessionResultCount(vault) > 10000);
  assert.equal(sessionResultCount(global), 0);

  fs.rmSync(tmp, { recursive: true, force: true });
});