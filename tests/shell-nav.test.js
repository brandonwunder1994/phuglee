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

function labelOrder(nav, labels) {
  const idxs = labels.map((lab) => {
    const re = new RegExp(`shell-link-label">${lab}<`);
    return nav.search(re);
  });
  for (let i = 0; i < idxs.length; i++) {
    assert.ok(idxs[i] >= 0, `missing label ${labels[i]}`);
    if (i > 0) assert.ok(idxs[i] > idxs[i - 1], `${labels[i - 1]} should precede ${labels[i]}`);
  }
}

test('shell rail Data order: Request, Filter, Review, Government Lists (no Pre-liens)', () => {
  const api = loadShellNavApi();
  const nav = api.buildNav('/collect');
  assert.ok(nav.includes('shell-data-trigger'));
  assert.ok(nav.includes('Data'));
  assert.ok(nav.includes('shell-rail'));
  assert.ok(!nav.includes('shell-topbar'));
  assert.ok(!nav.includes('shell-cmd-palette-btn'));
  labelOrder(nav, ['Request', 'Filter', 'Review', 'Government Lists']);
  assert.ok(!nav.includes('shell-link-label">Pre-liens<'));
  assert.ok(!nav.includes('href="/pre-liens"'));
  assert.ok(!nav.includes('City Tracker'));
  assert.ok(!nav.includes('>Properties<'));
  assert.equal(api.activeId('/collect'), 'collect');
  assert.equal(api.activeId('/bridge'), 'bridge');
  assert.equal(api.activeId('/analyzer/'), 'analyzer');
  assert.equal(api.activeId('/government-lists'), 'government-lists');
  assert.equal(api.activeId('/pre-liens'), 'pre-liens');
  assert.ok(api.isDataSectionActive('collect'));
  assert.ok(api.isDataSectionActive('pre-liens'));
  assert.ok(!api.isDataSectionActive('command'));
});

test('shell rail: Dashboard → Leads → Dispo → Data (admin)', () => {
  const api = loadShellNavApi('admin');
  const nav = api.buildNav('/command');
  assert.ok(nav.includes('shell-link-label">Dashboard<'));
  assert.ok(nav.includes('shell-vault-trigger'));
  assert.ok(nav.includes('>Leads<'));
  assert.ok(nav.includes('>Dispo<'));
  assert.ok(nav.includes('shell-data-trigger'));
  assert.match(nav, /shell-link-label">Houses</);
  assert.match(nav, /shell-link-label">Land</);
  assert.ok(!nav.includes('Home Vault'));
  assert.ok(!nav.includes('Land Vault'));
  const leadsIdx = nav.indexOf('shell-vault-trigger');
  const dispoIdx = nav.indexOf('shell-pipeline-trigger');
  const dataIdx = nav.indexOf('shell-data-trigger');
  assert.ok(leadsIdx > -1 && dispoIdx > -1 && dataIdx > -1);
  assert.ok(leadsIdx < dispoIdx, 'Leads before Dispo');
  assert.ok(dispoIdx < dataIdx, 'Dispo before Data');
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

test('government-lists page has Pre-liens open button', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'government-lists.html'),
    'utf8'
  );
  assert.ok(html.includes('href="/pre-liens"'));
  assert.ok(html.includes('gl-pre-liens-btn') || html.includes('Pre-liens'));
});
