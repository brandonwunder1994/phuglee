/**
 * Embedded Analyze must not prefix shell Vault/auth/health under /analyzer.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const configSrc = fs.readFileSync(
  path.join(__dirname, '..', 'modules/property-analyzer/public/js/config.js'),
  'utf8'
);

test('config.js defines shell API allowlist and isShellApiUrl', () => {
  assert.match(configSrc, /SHELL_API_PREFIXES/);
  assert.match(configSrc, /isShellApiUrl/);
  assert.match(configSrc, /\/api\/leads/);
  assert.match(configSrc, /Never rewrite shell Vault/);
});

test('resolveModuleApiUrl keeps /api/leads on shell root when embedded', () => {
  const R = {};
  R.MODULE_PREFIX = '/analyzer';
  R.SHELL_API_PREFIXES = ['/api/leads', '/api/health', '/api/auth', '/api/me'];
  R.isShellApiUrl = function isShellApiUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const pathOnly = (url.startsWith('/') ? url : `/${url}`).split('?')[0];
    return R.SHELL_API_PREFIXES.some(
      (p) => pathOnly === p || pathOnly.startsWith(`${p}/`)
    );
  };
  R.resolveModuleApiUrl = function resolveModuleApiUrl(url) {
    if (typeof url !== 'string' || !url.startsWith('/')) return url;
    if (typeof R.isShellApiUrl === 'function' && R.isShellApiUrl(url)) return url;
    const prefix = R.MODULE_PREFIX;
    if (!prefix || url.startsWith(prefix + '/')) return url;
    if (url.startsWith('/api/') || url === '/api') return `${prefix}${url}`;
    return url;
  };

  assert.equal(R.resolveModuleApiUrl('/api/leads/publish-from-analyzer'), '/api/leads/publish-from-analyzer');
  assert.equal(R.resolveModuleApiUrl('/api/leads/meta'), '/api/leads/meta');
  assert.equal(R.resolveModuleApiUrl('/api/health'), '/api/health');
  assert.equal(R.resolveModuleApiUrl('/api/status'), '/analyzer/api/status');
  assert.equal(R.isShellApiUrl('/api/leads/publish-from-analyzer'), true);
  assert.equal(R.isShellApiUrl('/api/status'), false);
});

test('session.js no longer drops vault publish queue at 40', () => {
  const sessionSrc = fs.readFileSync(
    path.join(__dirname, '..', 'modules/property-analyzer/public/js/session.js'),
    'utf8'
  );
  assert.doesNotMatch(sessionSrc, /splice\(0,\s*R\._vaultPublishQueue\.length - 40\)/);
  assert.match(sessionSrc, /NEVER drop Keep\/Change publishes/);
  assert.match(sessionSrc, /_VAULT_PUBLISH_STORAGE_KEY/);
});
