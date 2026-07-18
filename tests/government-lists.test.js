'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '..', 'public', 'data', 'government-lists', 'catalog.json');

test('government lists catalog exists with list types and sources', () => {
  assert.ok(fs.existsSync(catalogPath), 'catalog.json missing');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.ok(Array.isArray(catalog.listTypes) && catalog.listTypes.length >= 6);
  assert.ok(Array.isArray(catalog.sources) && catalog.sources.length > 100);
  const ids = new Set(catalog.listTypes.map((t) => t.id));
  assert.ok(ids.has('pre_lien'));
  assert.ok(ids.has('code_violation'));
  assert.ok(ids.has('tax_delinquent'));
  const code = catalog.sources.filter((s) => s.listType === 'code_violation' && !s.isPlaybook);
  assert.ok(code.length > 50, 'expected Form Forge code sources');
  for (const s of catalog.sources.slice(0, 20)) {
    assert.ok(s.id && s.listType && s.method);
  }
});

test('government lists page wires catalog and shell', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'government-lists.html'), 'utf8');
  assert.ok(html.includes('Government Lists'));
  assert.ok(html.includes('government-lists-app.js'));
  assert.ok(html.includes('government-lists.css'));
  assert.ok(html.includes('gov-lists-normalize.js'), 'normalize module not wired');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'government-lists-app.js'), 'utf8');
  assert.ok(app.includes('/data/government-lists/catalog.json'));
});

const { normalizeState, mergeSources } = require('../public/js/gov-lists-normalize.js');

test('normalizeState maps names and codes to 2-letter codes', () => {
  assert.equal(normalizeState('Texas'), 'TX');
  assert.equal(normalizeState('texas'), 'TX');
  assert.equal(normalizeState('tx'), 'TX');
  assert.equal(normalizeState('TX'), 'TX');
  assert.equal(normalizeState('North Carolina'), 'NC');
  assert.equal(normalizeState('  California '), 'CA');
  assert.equal(normalizeState('District of Columbia'), 'DC');
  assert.equal(normalizeState(''), '');
  assert.equal(normalizeState('Puerto Rico'), 'PR');
});

test('mergeSources collapses same place+listType and prefers verified', () => {
  const priority = { code_violation: 1 };
  const sources = [
    {
      id: 'a', listType: 'code_violation', city: 'Abilene', county: '', state: 'Texas',
      verifyStatus: 'email_only', contactEmail: 'clerk@abilene.gov', url: '', method: 'email'
    },
    {
      id: 'b', listType: 'code_violation', city: 'Abilene', county: 'Taylor', state: 'TX',
      verifyStatus: 'verified', contactEmail: '', url: 'https://abilene.gov/code', method: 'portal'
    }
  ];
  const merged = mergeSources(sources, priority);
  assert.equal(merged.length, 1, 'duplicate place+listType not merged');
  const row = merged[0];
  assert.equal(row.state, 'TX', 'state not normalized');
  assert.equal(row.verifyStatus, 'verified', 'did not prefer verified row');
  assert.equal(row.county, 'Taylor', 'county not backfilled');
  assert.equal(row.contactEmail, 'clerk@abilene.gov', 'email not backfilled');
  assert.equal(row.url, 'https://abilene.gov/code', 'url lost');
});

test('mergeSources keeps distinct list types and distinct places separate', () => {
  const priority = { code_violation: 1, water_shutoff: 2 };
  const sources = [
    { id: 'a', listType: 'code_violation', city: 'Abilene', state: 'TX', verifyStatus: 'verified' },
    { id: 'b', listType: 'water_shutoff', city: 'Abilene', state: 'TX', verifyStatus: 'verified' },
    { id: 'c', listType: 'code_violation', city: 'Austin', state: 'TX', verifyStatus: 'verified' }
  ];
  assert.equal(mergeSources(sources, priority).length, 3);
});
