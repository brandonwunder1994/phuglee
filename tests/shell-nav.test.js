const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const shellNavPath = path.join(__dirname, '..', 'public', 'js', 'shell-nav.js');
const shellNavSrc = fs.readFileSync(shellNavPath, 'utf8');

function loadShellNavApi() {
  const sandbox = {
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      body: { classList: { add() {} }, style: {}, insertAdjacentHTML() {} },
      documentElement: { style: { setProperty() {} } }
    },
    sessionStorage: {
      getItem: () => null,
      setItem() {}
    },
    location: { pathname: '/collect', replace() {} }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(shellNavSrc, sandbox);
  return sandbox.window.DistressOSShellNav;
}

test('shell nav groups Collect, Filter, and Analyze under Properties', () => {
  const api = loadShellNavApi();
  const nav = api.buildNav('/collect');
  assert.ok(nav.includes('shell-properties-trigger'));
  assert.match(nav, /Properties/);
  assert.match(nav, /shell-nav-dropdown-icon[^>]*>📬</);
  assert.match(nav, /shell-nav-dropdown-icon[^>]*>🧹</);
  assert.match(nav, /shell-nav-dropdown-icon[^>]*>🔥</);
  assert.match(nav, /shell-nav-dropdown-label">Request Instead</);
  assert.match(nav, /shell-nav-dropdown-label">Filter</);
  assert.match(nav, /shell-nav-dropdown-label">Analyze</);
  assert.ok(!nav.match(/shell-links[\s\S]*>Collect</) || nav.includes('shell-nav-dropdown-menu'));
  assert.equal(api.activeId('/collect'), 'collect');
  assert.equal(api.activeId('/bridge'), 'bridge');
  assert.equal(api.activeId('/analyzer/'), 'analyzer');
  assert.ok(api.isPropertiesSectionActive('collect'));
  assert.ok(!api.isPropertiesSectionActive('command'));
});

test('shell nav keeps Dashboard and The Vault as top-level links', () => {
  const api = loadShellNavApi();
  const nav = api.buildNav('/command');
  assert.ok(nav.includes('>Dashboard<'));
  assert.ok(nav.includes('>The Vault<'));
  assert.ok(!nav.includes('href="/collect" class="shell-link'));
});