'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('auth.js does not hardcode or ship bootstrap admin password', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../public/js/auth.js'),
    'utf8'
  );
  assert.equal(src.includes('wunderhaus'), false);
  assert.equal(src.includes('__PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD__'), false);
  assert.match(src, /\/api\/auth\/login/);
  assert.match(src, /password:\s*password/);
});

test('auth-config.js never embeds bootstrap password', () => {
  const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const block = src.slice(
    src.indexOf("pathname === '/js/auth-config.js'"),
    src.indexOf("pathname === '/js/bridge-schema.js'")
  );
  assert.ok(block.length > 50);
  assert.equal(block.includes('__PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD__'), false);
  assert.equal(block.includes('PHUGLEE_BOOTSTRAP_ADMIN_PASSWORD'), false);
});

test('analyzer landing links to /analyzer/', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../modules/property-analyzer/public/landing.html'),
    'utf8'
  );
  assert.match(html, /href=["']\/analyzer\/["']/);
  assert.equal(/href=["']\/["'][^>]*>\s*(Launch|Open)/i.test(html), false);
});

test('home-coverage writes collect-city-count-label', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../public/js/home-coverage.js'),
    'utf8'
  );
  assert.match(src, /collect-city-count-label/);
});

test('shell.js skips polling when status pills missing', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/js/shell.js'), 'utf8');
  assert.match(src, /if\s*\(\s*!forgePill\s*&&\s*!analyzerPill\s*\)\s*return/);
});

test('purge-import-source does not unconditionally match new_analyzer_leads', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../modules/property-analyzer/routes/session.js'),
    'utf8'
  );
  assert.equal(
    /if\s*\(\s*id\.includes\(\s*['"]new_analyzer_leads['"]\s*\)\s*\)\s*return\s+true/.test(
      src
    ),
    false
  );
});
