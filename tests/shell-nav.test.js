const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const shellNavPath = path.join(__dirname, '..', 'public', 'js', 'shell-nav.js');
const shellNavSrc = fs.readFileSync(shellNavPath, 'utf8');

function loadShellNavApi(sessionUser) {
  const sandbox = {
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      body: { classList: { add() {} }, style: {}, insertAdjacentHTML() {} },
      documentElement: { style: { setProperty() {} } },
      addEventListener() {}
    },
    sessionStorage: {
      getItem: (key) => (key === 'phuglee_session' ? sessionUser || null : null),
      setItem() {}
    },
    location: { pathname: '/collect', replace() {} }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(shellNavSrc, sandbox);
  return sandbox.window.DistressOSShellNav;
}

test('shell nav groups Collect, Filter, and Analyze under Data', () => {
  const api = loadShellNavApi();
  const nav = api.buildNav('/collect');
  assert.ok(nav.includes('shell-data-trigger'));
  assert.ok(nav.includes('Data'));
  assert.match(nav, /shell-nav-dropdown-label">Collect</);
  assert.match(nav, /shell-nav-dropdown-label">Filter</);
  assert.match(nav, /shell-nav-dropdown-label">Analyze</);
  assert.ok(!nav.includes('City Tracker'));
  assert.ok(!nav.includes('>Properties<'));
  assert.equal(api.activeId('/collect'), 'collect');
  assert.equal(api.activeId('/bridge'), 'bridge');
  assert.equal(api.activeId('/analyzer/'), 'analyzer');
  assert.ok(api.isDataSectionActive('collect'));
  assert.ok(!api.isDataSectionActive('command'));
});

test('shell nav keeps Dashboard and The Vault as top-level links', () => {
  const api = loadShellNavApi();
  const nav = api.buildNav('/command');
  assert.ok(nav.includes('>Dashboard<'));
  assert.ok(nav.includes('>The Vault<'));
  assert.ok(!nav.includes('href="/collect" class="shell-link'));
});

test('admin shell nav groups Under Contract and All Leads under Pipeline', () => {
  const api = loadShellNavApi('admin');
  const nav = api.buildNav('/pipeline');
  assert.ok(nav.includes('shell-pipeline-trigger'));
  assert.ok(nav.includes('Pipeline'));
  assert.match(nav, /shell-nav-dropdown-label">Under Contract</);
  assert.match(nav, /shell-nav-dropdown-label">All Leads</);
  assert.ok(!nav.includes('Contract Tracker'));
  assert.ok(!nav.includes('Sales Pipeline'));
  assert.ok(!nav.includes('Operating Costs'));
  assert.ok(api.isPipelineSectionActive('pipeline'));
  assert.ok(api.isPipelineSectionActive('under-contract'));
});
