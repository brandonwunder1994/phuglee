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
  HOST: process.env.DISTRESS_OS_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1'),
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

  DISTRESS_ROUTES: {
    '/': 'index.html', // Logo Page
    '/command': 'command.html',
    '/heat': 'heat.html',
    '/bridge': 'bridge.html',
    '/collect': 'collect.html',
    '/vault': 'vault.html'
  },

  /** Set PHUGLEE_AUTH_DISABLED=1 to skip client login (dev/staging only). */
  AUTH_DISABLED: ['1', 'true', 'yes'].includes(
    String(process.env.PHUGLEE_AUTH_DISABLED || '').trim().toLowerCase()
  )
};