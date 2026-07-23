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

  /**
   * Temporary Process drafts (full kept/FN rows for paging + Train + Save-by-id).
   * Prefer FILTER_DRAFTS_ROOT; else nest under PDA_DATA_ROOT; else data/filter-drafts.
   * Short-lived working set — not the durable inventory (filter-lists).
   */
  FILTER_DRAFTS_ROOT: process.env.FILTER_DRAFTS_ROOT
    ? path.resolve(process.env.FILTER_DRAFTS_ROOT)
    : (process.env.PDA_DATA_ROOT
      ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'filter-drafts')
      : path.join(ROOT, 'data', 'filter-drafts')),

  /**
   * Global Filter brain (type/phrase rules). Volume-safe like filter lists.
   * Prefer BRIDGE_BRAIN_ROOT; else nest under PDA_DATA_ROOT; else data/bridge-brain.
   */
  BRIDGE_BRAIN_ROOT: process.env.BRIDGE_BRAIN_ROOT
    ? path.resolve(process.env.BRIDGE_BRAIN_ROOT)
    : (process.env.PDA_DATA_ROOT
      ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'bridge-brain')
      : path.join(ROOT, 'data', 'bridge-brain')),

  /**
   * Per-city Type-column format memory (fingerprint + confirmed typeHeader).
   * Separate from global-brain.json. Volume-safe like brain/lists.
   * Prefer BRIDGE_CITY_FORMATS_ROOT; else nest under PDA_DATA_ROOT; else data/bridge-city-formats.
   */
  BRIDGE_CITY_FORMATS_ROOT: process.env.BRIDGE_CITY_FORMATS_ROOT
    ? path.resolve(process.env.BRIDGE_CITY_FORMATS_ROOT)
    : (process.env.PDA_DATA_ROOT
      ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'bridge-city-formats')
      : path.join(ROOT, 'data', 'bridge-city-formats')),

  /**
   * Published Vault leads catalog (Max plan).
   * Prefer LEADS_CATALOG_ROOT; else nest under PDA_DATA_ROOT; else data/leads-catalog.
   */
  LEADS_CATALOG_ROOT: process.env.LEADS_CATALOG_ROOT
    ? path.resolve(process.env.LEADS_CATALOG_ROOT)
    : (process.env.PDA_DATA_ROOT
      ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'leads-catalog')
      : path.join(ROOT, 'data', 'leads-catalog')),

  REALESTATE_API_KEY: String(process.env.REALESTATE_API_KEY || '').trim(),
  REALESTATE_API_BASE: String(process.env.REALESTATE_API_BASE || 'https://api.realestateapi.com').replace(/\/$/, ''),
  LEADS_COMP_REPORTS_ROOT: process.env.LEADS_COMP_REPORTS_ROOT
    ? path.resolve(process.env.LEADS_COMP_REPORTS_ROOT)
    : path.join(
      process.env.LEADS_CATALOG_ROOT
        ? path.resolve(process.env.LEADS_CATALOG_ROOT)
        : (process.env.PDA_DATA_ROOT
          ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'leads-catalog')
          : path.join(ROOT, 'data', 'leads-catalog')),
      'comp-reports'
    ),

  /**
   * Operating Costs rate card + GHL import ledger (admin).
   * Prefer OPERATING_COSTS_ROOT; else nest under PDA_DATA_ROOT; else data/operating-costs.
   */
  OPERATING_COSTS_ROOT: process.env.OPERATING_COSTS_ROOT
    ? path.resolve(process.env.OPERATING_COSTS_ROOT)
    : (process.env.PDA_DATA_ROOT
      ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'operating-costs')
      : path.join(ROOT, 'data', 'operating-costs')),

  /**
   * Buyers catalog (known cash buyers / fund boxes).
   * Prefer BUYERS_ROOT; else nest under PDA_DATA_ROOT; else data/buyers.
   */
  BUYERS_ROOT: process.env.BUYERS_ROOT
    ? path.resolve(process.env.BUYERS_ROOT)
    : (process.env.PDA_DATA_ROOT
      ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'buyers')
      : path.join(ROOT, 'data', 'buyers')),

  /**
   * County government-list playbooks (SOPs).
   * Prefer GOV_PLAYBOOKS_ROOT; else nest under PDA_DATA_ROOT; else data/gov-playbooks.
   */
  GOV_PLAYBOOKS_ROOT: process.env.GOV_PLAYBOOKS_ROOT
    ? path.resolve(process.env.GOV_PLAYBOOKS_ROOT)
    : (process.env.PDA_DATA_ROOT
      ? path.join(path.resolve(process.env.PDA_DATA_ROOT), 'gov-playbooks')
      : path.join(ROOT, 'data', 'gov-playbooks')),

  DISTRESS_ROUTES: {
    '/': 'index.html', // Logo Page
    '/command': 'command.html',
    '/heat': 'heat.html',
    '/filter': 'bridge.html',
    '/bridge': 'bridge.html', // legacy alias (nav prefers /filter)
    '/collect': 'collect.html',
    '/government-lists': 'government-lists.html',
    '/pre-liens': 'pre-liens.html',
    '/vault': 'vault.html',
    '/land-vault': 'land-vault.html',
    '/under-contract': 'under-contract.html',
    '/pipeline': 'pipeline.html',
    '/buyers': 'buyers.html',
    // /trust-funds → HTTP 302 /buyers in server.js (Buyers is the canonical desk)
    '/operating-costs': 'operating-costs.html',
    '/photo-upload': 'photo-upload.html'
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