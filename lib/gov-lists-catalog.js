/**
 * Government lists research catalog — meta + per-state sources (Wave 1).
 * Full catalog stays on disk; browser never needs the full 6k-row dump on open.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const CATALOG_REL = path.join('data', 'government-lists', 'catalog.json');

let cache = {
  mtimeMs: 0,
  catalog: null
};

function catalogPath() {
  return path.join(config.PUBLIC, CATALOG_REL);
}

function loadCatalog() {
  const file = catalogPath();
  if (!fs.existsSync(file)) {
    const err = new Error('Government lists catalog not found');
    err.code = 'CATALOG_MISSING';
    throw err;
  }
  const stat = fs.statSync(file);
  if (cache.catalog && cache.mtimeMs === stat.mtimeMs) {
    return cache.catalog;
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  cache = { mtimeMs: stat.mtimeMs, catalog: raw };
  return raw;
}

function normalizeStateCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

/**
 * Meta payload — no full sources array.
 * Includes small howto/playbook rows and per-state counts for the UI.
 */
function getMeta() {
  const catalog = loadCatalog();
  const sources = Array.isArray(catalog.sources) ? catalog.sources : [];
  const stateCounts = {};
  const listTypeCounts = {};
  const howto = [];
  let nonPlaybook = 0;

  for (const s of sources) {
    if (s && s.isPlaybook) {
      howto.push(s);
      continue;
    }
    nonPlaybook += 1;
    const st = normalizeStateCode(s && s.state);
    if (st) stateCounts[st] = (stateCounts[st] || 0) + 1;
    const lt = String((s && s.listType) || '').trim();
    if (lt) listTypeCounts[lt] = (listTypeCounts[lt] || 0) + 1;
  }

  return {
    version: catalog.version || null,
    updatedAt: catalog.updatedAt || null,
    title: catalog.title || null,
    description: catalog.description || null,
    listTypes: catalog.listTypes || [],
    methods: catalog.methods || [],
    researchProgress: catalog.researchProgress || null,
    stats: catalog.stats || null,
    sourceCount: nonPlaybook,
    totalSourceRows: sources.length,
    stateCounts,
    listTypeCounts,
    howto
  };
}

/**
 * @param {{ state?: string, listType?: string }} query
 * @returns {{ sources: object[], total: number, state: string }}
 */
function getSources(query = {}) {
  const state = normalizeStateCode(query.state);
  if (!state || state.length < 2) {
    const err = new Error('Query parameter "state" is required (e.g. TX)');
    err.code = 'STATE_REQUIRED';
    throw err;
  }

  const catalog = loadCatalog();
  const all = Array.isArray(catalog.sources) ? catalog.sources : [];
  const listType = String(query.listType || '').trim();

  const sources = all.filter((s) => {
    if (!s || s.isPlaybook) return false;
    if (normalizeStateCode(s.state) !== state) return false;
    if (listType && s.listType !== listType) return false;
    return true;
  });

  return { sources, total: sources.length, state };
}

function getSourceById(id) {
  const want = String(id || '').trim();
  if (!want) return null;
  const catalog = loadCatalog();
  const all = Array.isArray(catalog.sources) ? catalog.sources : [];
  return all.find((s) => s && s.id === want) || null;
}

module.exports = {
  catalogPath,
  loadCatalog,
  getMeta,
  getSources,
  getSourceById,
  normalizeStateCode
};
