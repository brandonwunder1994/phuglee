'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('gov playbook store upsert + get + delete', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-pb-'));
  process.env.GOV_PLAYBOOKS_ROOT = tmp;
  // Reload config + store with temp root
  delete require.cache[require.resolve('../lib/config')];
  delete require.cache[require.resolve('../lib/gov-playbooks/store')];
  const store = require('../lib/gov-playbooks/store');

  const saved = store.upsertPlaybook({
    county: 'Dallas',
    state: 'TX',
    preLien: {
      courtUrl: 'https://example.gov/cases',
      caseTypes: 'Small claims',
      whatWorked: 'Free PDF downloads'
    },
    assessor: { url: 'https://example.gov/cad' }
  }, { username: 'admin' });

  assert.equal(saved.state, 'TX');
  assert.equal(saved.county, 'Dallas');
  assert.match(saved.id, /tx-dallas/);
  assert.equal(saved.preLien.courtUrl, 'https://example.gov/cases');

  const got = store.getPlaybook(saved.id);
  assert.ok(got);
  assert.equal(got.preLien.whatWorked, 'Free PDF downloads');

  const listed = store.listPlaybooks();
  assert.ok(listed.some((p) => p.id === saved.id));

  assert.equal(store.deletePlaybook(saved.id), true);
  assert.equal(store.getPlaybook(saved.id), null);

  delete process.env.GOV_PLAYBOOKS_ROOT;
  delete require.cache[require.resolve('../lib/config')];
  delete require.cache[require.resolve('../lib/gov-playbooks/store')];
});

test('government lists page has playbooks tab', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'government-lists.html'), 'utf8');
  assert.ok(html.includes('County playbooks'));
  assert.ok(html.includes('gl-tab-playbooks'));
  assert.ok(html.includes('gl-pb-form'));
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'government-lists-app.js'), 'utf8');
  assert.ok(app.includes('/api/gov-playbooks'));
});

test('seed catalog exists', () => {
  const seed = path.join(__dirname, '..', 'data', 'gov-playbooks', 'seed-catalog.json');
  assert.ok(fs.existsSync(seed));
  const json = JSON.parse(fs.readFileSync(seed, 'utf8'));
  assert.ok(Array.isArray(json.playbooks) && json.playbooks.length >= 1);
});
