/**
 * DESK-03 — Filter kept + inventory dark-glass tables (Phase 79-02)
 * Static CSS/HTML greps — sticky header, zebra, hover, min-width scroll, frozen IDs.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'bridge.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');

// ── Kept results table ─────────────────────────────────────────────────────

test('DESK-03: kept results table sticky dark header', () => {
  assert.match(css, /\.bridge-results-table th\s*\{[^}]*position:\s*sticky/s);
});

test('DESK-03: kept results table zebra striping', () => {
  assert.ok(
    /\.bridge-results-table[^{]*tbody[^{]*tr:nth-child\(even\)|\.bridge-results-table tbody tr:nth-child\(even\)/.test(css),
    'expected even-row zebra on .bridge-results-table'
  );
});

test('DESK-03: kept results table row hover', () => {
  assert.match(css, /\.bridge-results-table tbody tr:hover/);
});

test('DESK-03: kept table wrap overflow-x auto', () => {
  assert.match(css, /\.bridge-table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
});

test('DESK-03: kept results table min-width for 390 scroll', () => {
  assert.match(css, /\.bridge-results-table\s*\{[^}]*min-width/s);
});

// ── Inventory lists table ──────────────────────────────────────────────────

test('DESK-03: lists table sticky dark header', () => {
  assert.match(css, /\.bridge-lists-table th\s*\{[^}]*position:\s*sticky/s);
});

test('DESK-03: lists table zebra striping', () => {
  assert.ok(
    /\.bridge-lists-table[^\n]*tbody[^\n]*tr:nth-child\(even\)|\.bridge-lists-table tbody tr:nth-child\(even\)/.test(css),
    'expected even-row zebra on .bridge-lists-table'
  );
});

test('DESK-03: lists table row hover', () => {
  assert.match(css, /\.bridge-lists-table tbody tr:hover/);
});

test('DESK-03: lists wrap overflow-x auto', () => {
  assert.match(css, /\.bridge-lists-wrap\s*\{[^}]*overflow-x:\s*auto/s);
});

test('DESK-03: lists table min-width for 390 scroll', () => {
  assert.match(css, /\.bridge-lists-table\s*\{[^}]*min-width/s);
});

// ── Frozen DOM contracts ───────────────────────────────────────────────────

test('DESK-03: table structure IDs frozen', () => {
  assert.match(html, /id="bridge-results-table"/);
  assert.match(html, /id="bridge-table-wrap"/);
  assert.match(html, /id="bridge-results-body"/);
  assert.match(html, /id="bridge-lists-table"/);
  assert.match(html, /id="bridge-lists-wrap"/);
  assert.match(html, /id="bridge-lists-body"/);
});

test('DESK-03: kept thead data-sort keys unchanged', () => {
  const keys = [
    'streetAddress',
    'violationIssueType',
    'category',
    'distressedSignalTag',
    'confidenceLevel',
    'violationDate'
  ];
  for (const key of keys) {
    assert.match(html, new RegExp(`data-sort="${key}"`), `missing data-sort="${key}"`);
  }
});
