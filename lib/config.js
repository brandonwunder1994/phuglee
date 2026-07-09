const path = require('path');

const ROOT = path.join(__dirname, '..');

function loopbackHost(bindHost) {
  const host = String(bindHost || '').trim();
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') return '127.0.0.1';
  return host;
}

module.exports = {
  loopbackHost,
  PORT: Number(process.env.DISTRESS_OS_PORT || process.env.PORT || 3000),
  // Local default: omit bind host so Node accepts IPv4 + IPv6 (Windows "localhost" often hits ::1 first).
  // Production/Railway: PORT is set → bind 0.0.0.0. Override anytime with DISTRESS_OS_HOST.
  HOST: process.env.DISTRESS_OS_HOST || (process.env.PORT ? '0.0.0.0' : ''),
  ROOT,
  PUBLIC: path.join(ROOT, 'public'),

  FORGE_PREFIX: '/forge',
  FORGE_PORT: Number(process.env.FORM_FORGE_PORT || 8787),
  FORGE_HOST: process.env.FORM_FORGE_HOST || '127.0.0.1',
  FORGE_URL: process.env.FORM_FORGE_URL || '',
  FORGE_PATH: process.env.FORM_FORGE_PATH || path.join(ROOT, 'modules', 'form-forge'),

  ANALYZER_PREFIX: '/analyzer',
  ANALYZER_PORT: Number(process.env.PROPERTY_ANALYZER_PORT || 3456),
  ANALYZER_HOST: process.env.PROPERTY_ANALYZER_HOST || '127.0.0.1',
  ANALYZER_PATH: process.env.PROPERTY_ANALYZER_PATH || path.join(ROOT, 'modules', 'property-analyzer'),
  /** Canonical Property Analyzer data dir (session file, backups). */
  ANALYZER_DATA_ROOT: process.env.PDA_DATA_ROOT
    ? path.resolve(process.env.PDA_DATA_ROOT)
    : (process.env.PROPERTY_ANALYZER_PATH || path.join(ROOT, 'modules', 'property-analyzer')),

  /**
   * Filter page saved lists — durable staging area.
   * Prefer FILTER_LISTS_ROOT; else nest under PDA_DATA_ROOT (Railway volume) so
   * redeploys never wipe user-saved lists. Local fallback: data/filter-lists.
   */
  FILTER_LISTS_ROOT: process.env.FILTER_LISTS_ROOT
    ? path.resolve(process.env.FILTER_LISTS_ROOT)
    : (process.env.PDA_DATA_ROOT
      ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'filter-lists')
      : path.join(ROOT, 'data', 'filter-lists')),

  DISTRESS_ROUTES: {
    '/': 'index.html', // Logo Page
    '/command': 'command.html',
    '/heat': 'heat.html',
    '/bridge': 'bridge.html',
    '/collect': 'collect.html',
    '/vault': 'vault.html'
  },

  /**
   * Auth gate for client pages.
   * Production always requires login unless PHUGLEE_AUTH_OPEN=1 (temporary open staging).
   * Local/dev: set PHUGLEE_AUTH_DISABLED=1 to skip login for convenience.
   */
  AUTH_DISABLED: (() => {
    const flag = (name) =>
      ['1', 'true', 'yes'].includes(String(process.env[name] || '').trim().toLowerCase());
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (isProd && !flag('PHUGLEE_AUTH_OPEN')) return false;
    return flag('PHUGLEE_AUTH_DISABLED');
  })()
};