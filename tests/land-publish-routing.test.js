const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.VERCEL = '1';

let tmpRoot;
let analyzerUsersRoot;
let store;
let analyzerSync;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'land-publish-'));
  analyzerUsersRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'land-analyzer-'));
  const adminDir = path.join(analyzerUsersRoot, 'users', 'admin');
  fs.mkdirSync(adminDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'fixtures', 'analyzer', 'admin-session.json'),
    path.join(adminDir, 'distressAnalyzerSession_LATEST.json')
  );
  process.env.LEADS_CATALOG_ROOT = tmpRoot;
  process.env.PDA_DATA_ROOT = analyzerUsersRoot;
  delete require.cache[require.resolve('../lib/config')];
  delete require.cache[require.resolve('../lib/leads-platform/store')];
  delete require.cache[require.resolve('../lib/leads-platform/analyzer-sync')];
  store = require('../lib/leads-platform/store');
  analyzerSync = require('../lib/leads-platform/analyzer-sync');
});

after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(analyzerUsersRoot, { recursive: true, force: true });
  } catch (_) {}
  delete process.env.LEADS_CATALOG_ROOT;
  delete process.env.PDA_DATA_ROOT;
});

test('reviewed vacant lots publish to land surface only', () => {
  const stats = analyzerSync.syncAnalyzerSessions({ force: true });
  assert.ok(stats.published >= 1);

  const land = store.queryLeads({ surface: 'land', leadType: 'all', limit: 50 });
  assert.ok(land.leads.some((l) => l.leadType === 'land'));

  const home = store.queryLeads({ surface: 'home', leadType: 'all', limit: 200 });
  assert.ok(home.leads.every((l) => l.leadType !== 'land'));

  const landLead = land.leads.find((l) => l.leadId);
  assert.ok(landLead);
  assert.equal(
    home.leads.filter((l) => l.leadId === landLead.leadId).length,
    0
  );
  assert.ok(
    store.queryLeads({ surface: 'land', leadType: 'all' }).leads
      .some((l) => l.leadId === landLead.leadId)
  );
});
