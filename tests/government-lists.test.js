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
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'government-lists-app.js'), 'utf8');
  assert.ok(app.includes('/data/government-lists/catalog.json'));
});
