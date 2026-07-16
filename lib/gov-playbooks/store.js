'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function rootDir() {
  return config.GOV_PLAYBOOKS_ROOT
    || path.join(config.ROOT, 'data', 'gov-playbooks');
}

function catalogPath() {
  return path.join(rootDir(), 'catalog.json');
}

function seedPath() {
  return path.join(config.ROOT, 'data', 'gov-playbooks', 'seed-catalog.json');
}

function emptyCatalog() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    title: 'County playbooks',
    description: 'Per-county SOPs for pulling government lists — clerk URLs, filters, fees, what worked.',
    playbooks: []
  };
}

function slugId(county, state) {
  const c = String(county || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const s = String(state || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 2);
  return `${s}-${c}`.replace(/^-|-$/g, '') || `pb-${Date.now()}`;
}

function emptyListSlot() {
  return { url: '', method: '', cadence: '', notes: '' };
}

function normalizePlaybook(raw = {}, meta = {}) {
  const county = String(raw.county || '').trim();
  const state = String(raw.state || '').trim().toUpperCase().slice(0, 2);
  const id = String(raw.id || '').trim() || slugId(county, state);
  const listsIn = raw.lists && typeof raw.lists === 'object' ? raw.lists : {};
  const listKeys = ['code_violation', 'tax_delinquent', 'lis_pendens', 'probate', 'fire', 'eviction', 'water_shutoff'];
  const lists = {};
  for (const key of listKeys) {
    const slot = listsIn[key] && typeof listsIn[key] === 'object' ? listsIn[key] : {};
    lists[key] = {
      url: String(slot.url || '').trim(),
      method: String(slot.method || '').trim(),
      cadence: String(slot.cadence || '').trim(),
      notes: String(slot.notes || '').trim()
    };
  }

  const pre = raw.preLien && typeof raw.preLien === 'object' ? raw.preLien : {};
  const assessor = raw.assessor && typeof raw.assessor === 'object' ? raw.assessor : {};

  return {
    id,
    county,
    state,
    stateName: String(raw.stateName || '').trim(),
    assetFocus: String(raw.assetFocus || 'houses').trim() || 'houses',
    lastVerified: String(raw.lastVerified || '').trim() || null,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    updatedBy: String(raw.updatedBy || meta.username || '').trim(),
    preLien: {
      courtUrl: String(pre.courtUrl || '').trim(),
      caseTypes: String(pre.caseTypes || '').trim(),
      filters: String(pre.filters || '').trim(),
      fees: String(pre.fees || '').trim(),
      loginNotes: String(pre.loginNotes || '').trim(),
      cadence: String(pre.cadence || 'weekly').trim() || 'weekly',
      whatWorked: String(pre.whatWorked || '').trim(),
      blockers: String(pre.blockers || '').trim()
    },
    assessor: {
      url: String(assessor.url || '').trim(),
      notes: String(assessor.notes || '').trim()
    },
    lists,
    notes: String(raw.notes || '').trim()
  };
}

function ensureSeeded() {
  const dest = catalogPath();
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(rootDir(), { recursive: true });
  const seed = seedPath();
  if (fs.existsSync(seed)) {
    fs.copyFileSync(seed, dest);
    return;
  }
  writeJsonAtomic(dest, emptyCatalog());
}

function readCatalog() {
  ensureSeeded();
  try {
    const raw = JSON.parse(fs.readFileSync(catalogPath(), 'utf8'));
    const playbooks = Array.isArray(raw.playbooks)
      ? raw.playbooks.map((p) => normalizePlaybook(p))
      : [];
    playbooks.sort((a, b) => {
      const sa = `${a.state} ${a.county}`.localeCompare(`${b.state} ${b.county}`);
      return sa;
    });
    return {
      version: Number(raw.version) || 1,
      updatedAt: raw.updatedAt || null,
      title: raw.title || 'County playbooks',
      description: raw.description || '',
      playbooks
    };
  } catch (_) {
    return emptyCatalog();
  }
}

function writeCatalog(catalog) {
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    title: catalog.title || 'County playbooks',
    description: catalog.description || '',
    playbooks: (catalog.playbooks || []).map((p) => normalizePlaybook(p))
  };
  writeJsonAtomic(catalogPath(), next);
  return next;
}

function listPlaybooks() {
  return readCatalog().playbooks;
}

function getPlaybook(id) {
  const key = String(id || '').trim();
  return listPlaybooks().find((p) => p.id === key) || null;
}

function upsertPlaybook(input, meta = {}) {
  const catalog = readCatalog();
  const normalized = normalizePlaybook(input, meta);
  if (!normalized.county || !normalized.state) {
    const err = new Error('county and state are required');
    err.code = 'MISSING_FIELDS';
    throw err;
  }
  normalized.updatedAt = new Date().toISOString();
  normalized.updatedBy = meta.username || normalized.updatedBy || '';

  const idx = catalog.playbooks.findIndex((p) => p.id === normalized.id);
  if (idx >= 0) catalog.playbooks[idx] = normalized;
  else catalog.playbooks.push(normalized);

  writeCatalog(catalog);
  return normalized;
}

function deletePlaybook(id) {
  const catalog = readCatalog();
  const before = catalog.playbooks.length;
  catalog.playbooks = catalog.playbooks.filter((p) => p.id !== id);
  if (catalog.playbooks.length === before) return false;
  writeCatalog(catalog);
  return true;
}

module.exports = {
  slugId,
  normalizePlaybook,
  emptyListSlot,
  readCatalog,
  listPlaybooks,
  getPlaybook,
  upsertPlaybook,
  deletePlaybook,
  catalogPath,
  rootDir
};
