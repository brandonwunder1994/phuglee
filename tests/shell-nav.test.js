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

test('shell nav groups Request, Filter, and Review under Data', () => {
  const api = loadShellNavApi();
  const nav = api.buildNav('/collect');
  assert.ok(nav.includes('shell-data-trigger'));
  assert.ok(nav.includes('Data'));
  assert.match(nav, /shell-nav-dropdown-label">Request</);
  assert.match(nav, /shell-nav-dropdown-label">Filter</);
  assert.match(nav, /shell-nav-dropdown-label">Review</);
  assert.ok(!nav.includes('shell-nav-dropdown-label">Government Lists<'));
  assert.ok(!nav.includes('shell-nav-dropdown-label">Pre-liens<'));
  assert.ok(!nav.includes('City Tracker'));
  assert.ok(!nav.includes('>Properties<'));
  assert.equal(api.activeId('/collect'), 'collect');
  assert.equal(api.activeId('/government-lists'), 'collect');
  assert.equal(api.activeId('/pre-liens'), 'collect');
  assert.equal(api.activeId('/bridge'), 'bridge');
  assert.equal(api.activeId('/analyzer/'), 'analyzer');
  assert.ok(api.isDataSectionActive('collect'));
  assert.ok(!api.isDataSectionActive('command'));
});

test('shell nav groups Homes and Land under Leads dropdown', () => {
  const api = loadShellNavApi();
  const nav = api.buildNav('/command');
  assert.ok(nav.includes('>Dashboard<'));
  assert.ok(nav.includes('shell-vaults-trigger'));
  assert.ok(nav.includes('Leads'));
  assert.ok(!nav.includes('>Vaults<'));
  assert.match(nav, /shell-nav-dropdown-label">Homes</);
  assert.match(nav, /shell-nav-dropdown-label">Land</);
  assert.ok(!nav.includes('>Home Vault<'));
  assert.ok(!nav.includes('>Land Vault<'));
  assert.ok(!nav.includes('>The Vault<'));
  assert.ok(!nav.includes('href="/collect" class="shell-link'));
  assert.ok(api.isVaultsSectionActive('vault'));
  assert.ok(api.isVaultsSectionActive('land-vault'));
  assert.equal(api.activeId('/vault'), 'vault');
  assert.equal(api.activeId('/land-vault'), 'land-vault');
});

test('matt vault-only shell nav shows Leads dropdown only', () => {
  const api = loadShellNavApi('matt');
  const nav = api.buildNav('/vault');
  assert.ok(nav.includes('shell-vaults-trigger'));
  assert.match(nav, /shell-nav-dropdown-label">Homes</);
  assert.match(nav, /shell-nav-dropdown-label">Land</);
  assert.ok(!nav.includes('>Dashboard<'));
  assert.ok(!nav.includes('shell-data-trigger'));
});

test('admin shell nav groups Under Contract, All Leads, and Buyers under Pipeline', () => {
  const api = loadShellNavApi('admin');
  const nav = api.buildNav('/pipeline');
  assert.ok(nav.includes('shell-pipeline-trigger'));
  assert.ok(nav.includes('Pipeline'));
  assert.match(nav, /shell-nav-dropdown-label">Under Contract</);
  assert.match(nav, /shell-nav-dropdown-label">All Leads</);
  assert.match(nav, /shell-nav-dropdown-label">Buyers</);
  assert.ok(!nav.includes('Contract Tracker'));
  assert.ok(!nav.includes('Sales Pipeline'));
  assert.ok(!nav.includes('Operating Costs'));
  assert.ok(api.isPipelineSectionActive('pipeline'));
  assert.ok(api.isPipelineSectionActive('under-contract'));
  assert.ok(api.isPipelineSectionActive('buyers'));
  assert.equal(api.activeId('/buyers'), 'buyers');
  assert.equal(api.activeId('/trust-funds'), 'buyers');
});

test('brad shell nav includes Buyers under Pipeline', () => {
  const api = loadShellNavApi('brad');
  const nav = api.buildNav('/buyers');
  assert.ok(nav.includes('shell-pipeline-trigger'));
  assert.match(nav, /shell-nav-dropdown-label">Buyers</);
  assert.ok(nav.includes('href="/buyers"'));
  assert.equal(api.activeId('/buyers'), 'buyers');
});

test('brad shell nav uses Request instead of Government Lists', () => {
  const api = loadShellNavApi('brad');
  const nav = api.buildNav('/collect');
  assert.ok(nav.includes('href="/collect"'));
  assert.ok(nav.includes('>Request<'));
  assert.ok(nav.includes('aria-current="page"'));
  assert.ok(!nav.includes('>Government Lists<'));
  assert.ok(!nav.includes('href="/government-lists"'));
  assert.equal(api.activeId('/government-lists'), 'collect');
  const footer = api.buildFooter('/government-lists');
  assert.ok(footer.includes('href="/collect"'));
  assert.ok(!footer.includes('href="/government-lists"'));
});

test('non-desk shell nav hides Pipeline and Buyers', () => {
  const api = loadShellNavApi(null);
  const nav = api.buildNav('/collect');
  assert.ok(!nav.includes('shell-pipeline-trigger'));
  assert.ok(!nav.includes('Buyers'));
});
