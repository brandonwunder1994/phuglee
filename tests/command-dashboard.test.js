const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

function read(rel) {
  return fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
}

test('command.html is coverage snapshot with live count IDs', () => {
  const html = read('command.html');
  assert.ok(html.includes('id="main"'));
  assert.ok(html.includes('id="command-city-count"'));
  assert.ok(html.includes('id="command-state-count"'));
  assert.ok(html.includes('id="command-coverage-map"'));
  assert.ok(html.includes('id="command-map-summary"'));
  assert.ok(html.includes('home-coverage.js'));
  assert.ok(html.includes('href="/collect"'));
  assert.ok(html.includes('href="/filter"'));
  assert.ok(html.includes('href="/analyzer/"'));
  assert.ok(html.includes('href="/under-contract"'));
  assert.ok(html.includes('data-admin-only'));
  assert.ok(html.includes('meta name="description"'));
  assert.ok(html.includes('id="main"'));
});

test('command.html has no mission board / pulse / checklist / tools farm', () => {
  const html = read('command.html');
  assert.ok(!html.includes('command-mission-title'));
  assert.ok(!html.includes('command-first-run'));
  assert.ok(!html.includes('command-pulse'));
  assert.ok(!html.includes('command-tools'));
  assert.ok(!html.includes('command-forge-status'));
  assert.ok(!html.includes('Mission Board'));
  assert.ok(!html.includes('btn-how-it-works-dashboard'));
});

test('command-center.js is slim (no health poll / mission focus)', () => {
  const js = read('js/command-center.js');
  assert.ok(js.includes('hideShellLoading') || js.includes('PhugleeStates'));
  assert.ok(js.includes('data-admin-only') || js.includes('revealAdminTools') || js.includes('isContractDesk'));
  assert.ok(!js.includes('pollHealth'));
  assert.ok(!js.includes('updateMissionFocus'));
  assert.ok(!js.includes('initFirstRunChecklist'));
  assert.ok(!js.includes('/api/health'));
});

test('command-center.css targets snapshot classes', () => {
  const css = read('css/command-center.css');
  assert.ok(css.includes('command-snapshot') || css.includes('command-metrics'));
  assert.ok(css.includes('command-city-count') || css.includes('command-metric'));
  assert.ok(css.includes('command-coverage-map'));
  assert.ok(css.includes('command-map-svg'));
  assert.ok(!css.includes('command-pulse-node'));
  assert.ok(!css.includes('command-mission-focus'));
});

test('home-coverage.js renders command map host', () => {
  const js = read('js/home-coverage.js');
  assert.ok(js.includes('command-coverage-map'));
  assert.ok(js.includes('renderCommandMap'));
  assert.ok(js.includes("return '—'") || js.includes('return "—"'));
});

test('coverage bootstrap has full live state footprint', () => {
  const boot = JSON.parse(
    fs.readFileSync(path.join(PUBLIC, 'data', 'coverage-map-bootstrap.json'), 'utf8')
  );
  assert.ok(boot.total_states >= 15, `expected >=15 states, got ${boot.total_states}`);
  assert.ok(Array.isArray(boot.states) && boot.states.length === boot.total_states);
  assert.ok(boot.total_cities > 500);
});
