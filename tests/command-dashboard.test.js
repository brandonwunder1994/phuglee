const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

function read(rel) {
  return fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
}

test('command.html is pipeline momentum KPIs + map', () => {
  const html = read('command.html');
  assert.ok(html.includes('id="main"'));
  assert.ok(html.includes('id="command-uc-count"'));
  assert.ok(html.includes('id="command-projected-funding"'));
  assert.ok(html.includes('id="command-total-funded"'));
  assert.ok(!html.includes('id="command-city-count"'));
  assert.ok(!html.includes('id="command-state-count"'));
  assert.ok(html.includes('under contract'));
  assert.ok(html.includes('projected fundings'));
  assert.ok(html.includes('total funded'));
  assert.ok(html.includes('id="command-coverage-map"'));
  assert.ok(html.includes('home-coverage.js'));
  assert.ok(!html.includes('command-quiet-links'));
  assert.ok(!html.includes('command-quiet-link'));
  assert.ok(!html.includes('>Request</'));
  assert.ok(!html.includes('>Filter</a>'));
  assert.ok(!html.includes('>Analyze</a>'));
  assert.ok(!html.includes('>Contracts</'));
});

test('command.html has no Pipeline header / snapshot lead copy', () => {
  const html = read('command.html');
  assert.ok(!html.includes('command-snapshot-head'));
  assert.ok(!html.includes('command-snapshot-title'));
  assert.ok(!html.includes('command-snapshot-lead'));
  assert.ok(!html.includes('>Pipeline</'));
  assert.ok(!html.includes('Under contract · projected · funded'));
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

test('command-center.js loads contract totals for pipeline KPIs', () => {
  const js = read('js/command-center.js');
  assert.ok(js.includes('/api/leads/admin/contracts'));
  assert.ok(js.includes('command-uc-count'));
  assert.ok(js.includes('command-projected-funding'));
  assert.ok(js.includes('command-total-funded'));
  assert.ok(js.includes('openAssignmentFees'));
  assert.ok(js.includes('closedAssignmentFees') || js.includes('totalAssignmentFees'));
  assert.ok(js.includes('loadDealKpis') || js.includes('applyDealTotals'));
  assert.ok(!js.includes('pollHealth'));
  assert.ok(!js.includes('updateMissionFocus'));
  assert.ok(!js.includes('initFirstRunChecklist'));
});

test('command-center.css is centered no-scroll snapshot layout', () => {
  const css = read('css/command-center.css');
  assert.ok(css.includes('command-metrics'));
  assert.ok(css.includes('command-metric'));
  assert.ok(css.includes('command-metrics--pipeline') || css.includes('command-metric-value'));
  assert.ok(css.includes('command-metric-value--money'));
  assert.ok(css.includes('--phuglee-success') || css.includes('#3dd68c'));
  assert.ok(css.includes('command-coverage-map'));
  assert.ok(css.includes('command-map-svg'));
  assert.ok(css.includes('align-items: center'));
  assert.ok(css.includes('justify-content: center'));
  assert.ok(css.includes('100dvh') || css.includes('min-height'));
  assert.ok(css.includes('overflow: hidden'));
  assert.ok(css.includes('#distress-os-footer-mount'));
  assert.ok(!css.includes('command-quiet-links'));
  assert.ok(!css.includes('command-pulse-node'));
  assert.ok(!css.includes('command-mission-focus'));
});

test('total funded uses money green, not gold', () => {
  const html = read('command.html');
  const fundedLine = html.split('\n').find((l) => l.includes('id="command-total-funded"'));
  assert.ok(fundedLine, 'total funded element present');
  assert.ok(fundedLine.includes('command-metric-value--money'), 'money green class on total funded');
  assert.ok(!fundedLine.includes('command-metric-value--gold'), 'total funded not gold');
});

test('home-coverage.js still renders command map host (not city/state KPIs)', () => {
  const js = read('js/home-coverage.js');
  assert.ok(js.includes('command-coverage-map'));
  assert.ok(js.includes('renderCommandMap'));
  assert.ok(!js.includes("['command-city-count'"));
  assert.ok(!js.includes("['command-state-count'"));
});

test('coverage pending wording is Coming Soon not states not yet', () => {
  const html = read('command.html');
  const js = read('js/home-coverage.js');
  assert.ok(html.includes('Coming Soon'));
  assert.ok(!html.includes('Not yet'));
  assert.ok(js.includes("Coming Soon"));
  assert.ok(!js.includes('states not yet'));
});

test('command cache-bust after snapshot layout', () => {
  const html = read('command.html');
  const jsV = html.match(/command-center\.js\?v=(\d+)/);
  const cssV = html.match(/command-center\.css\?v=(\d+)/);
  assert.ok(jsV && Number(jsV[1]) >= 7, 'command-center.js cache');
  assert.ok(cssV && Number(cssV[1]) >= 14, 'command-center.css cache');
});
