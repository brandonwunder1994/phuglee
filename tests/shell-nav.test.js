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

test('shell rail groups Request, Filter, and Review under Data', () => {
  const api = loadShellNavApi();
  const nav = api.buildNav('/collect');
  assert.ok(nav.includes('shell-data-trigger'));
  assert.ok(nav.includes('Data'));
  assert.ok(nav.includes('shell-rail'));
  assert.ok(!nav.includes('shell-topbar'));
  assert.ok(!nav.includes('shell-cmd-palette-btn'));
  assert.match(nav, /shell-link-label">Request</);
  assert.match(nav, /shell-link-label">Filter</);
  assert.match(nav, /shell-link-label">Review</);
  assert.ok(!nav.includes('City Tracker'));
  assert.ok(!nav.includes('>Properties<'));
  assert.equal(api.activeId('/collect'), 'collect');
  assert.equal(api.activeId('/bridge'), 'bridge');
  assert.equal(api.activeId('/analyzer/'), 'analyzer');
  assert.ok(api.isDataSectionActive('collect'));
  assert.ok(!api.isDataSectionActive('command'));
});

test('shell rail: Dashboard then Leads (Houses/Land), then Data', () => {
  const api = loadShellNavApi();
  const nav = api.buildNav('/command');
  assert.ok(nav.includes('shell-link-label">Dashboard<'));
  assert.ok(nav.includes('shell-vault-trigger'));
  assert.ok(nav.includes('>Leads<'));
  assert.match(nav, /shell-link-label">Houses</);
  assert.match(nav, /shell-link-label">Land</);
  assert.ok(!nav.includes('Home Vault'));
  assert.ok(!nav.includes('Land Vault'));
  // Leads section appears before Data section
  const leadsIdx = nav.indexOf('shell-vault-trigger');
  const dataIdx = nav.indexOf('shell-data-trigger');
  assert.ok(leadsIdx > -1 && dataIdx > -1 && leadsIdx < dataIdx);
  assert.ok(nav.includes('href="/collect"'));
  assert.ok(!nav.includes('shell-topbar'));
  assert.ok(!nav.includes('Jump'));
});

test('admin shell rail: Dispo has Under Contract + Buyers, not All Leads', () => {
  const api = loadShellNavApi('admin');
  const nav = api.buildNav('/under-contract');
  assert.ok(nav.includes('shell-pipeline-trigger'));
  assert.ok(nav.includes('>Dispo<'));
  assert.ok(!nav.includes('>Pipeline<'));
  assert.match(nav, /shell-link-label">Under Contract</);
  assert.match(nav, /shell-link-label">Buyers</);
  assert.ok(!nav.includes('All Leads'));
  assert.ok(!nav.includes('href="/pipeline"'));
  assert.ok(!nav.includes('Contract Tracker'));
  assert.ok(!nav.includes('Operating Costs'));
  assert.ok(api.isPipelineSectionActive('under-contract'));
  assert.ok(api.isPipelineSectionActive('buyers'));
  assert.ok(!api.isPipelineSectionActive('pipeline'));
  assert.equal(api.activeId('/buyers'), 'buyers');
  assert.equal(api.activeId('/trust-funds'), 'buyers');
});

test('brad shell rail includes Leads then Dispo', () => {
  const api = loadShellNavApi('brad');
  const nav = api.buildNav('/under-contract');
  assert.ok(nav.includes('shell-pipeline-trigger'));
  assert.ok(nav.includes('>Dispo<'));
  assert.ok(nav.includes('>Leads<'));
  assert.match(nav, /shell-link-label">Buyers</);
  assert.ok(nav.includes('href="/buyers"'));
  assert.ok(!nav.includes('shell-data-trigger'));
  assert.ok(!nav.includes('All Leads'));
  assert.equal(api.activeId('/under-contract'), 'under-contract');
});

test('non-desk shell rail hides Dispo', () => {
  const api = loadShellNavApi(null);
  const nav = api.buildNav('/collect');
  assert.ok(!nav.includes('shell-pipeline-trigger'));
  assert.ok(!nav.includes('shell-link-label">Buyers<'));
});

test('vault-only shell rail is Leads section only', () => {
  const api = loadShellNavApi('matt');
  const nav = api.buildNav('/vault');
  assert.ok(nav.includes('shell-vault-trigger'));
  assert.ok(nav.includes('>Leads<'));
  assert.match(nav, /shell-link-label">Houses</);
  assert.ok(!nav.includes('shell-data-trigger'));
  assert.ok(!nav.includes('shell-link-label">Dashboard<'));
});
