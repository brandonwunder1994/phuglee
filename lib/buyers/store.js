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
  if (config.BUYERS_ROOT) return config.BUYERS_ROOT;
  if (process.env.BUYERS_ROOT) return path.resolve(process.env.BUYERS_ROOT);
  if (process.env.PDA_DATA_ROOT) {
    return path.join(path.resolve(process.env.PDA_DATA_ROOT), 'buyers');
  }
  return path.join(config.ROOT, 'data', 'buyers');
}

function catalogPath() {
  return path.join(rootDir(), 'catalog.json');
}

function seedPath() {
  return path.join(config.ROOT, 'data', 'buyers', 'catalog.json');
}

function emptyCatalog() {
  return {
    version: 3,
    updatedAt: new Date().toISOString().slice(0, 10),
    title: 'Buyers',
    description: 'Known cash buyers — cross-referenced on Under Contract.',
    maoReminder: 'Our MAO stays ARV × 90% − (Repairs × 2). Buyer exit % notes are intel only.',
    funds: [],
    buyers: [],
    presets: []
  };
}

function ensureSeeded() {
  const dest = catalogPath();
  if (fs.existsSync(dest)) return;
  const seed = seedPath();
  fs.mkdirSync(rootDir(), { recursive: true });
  if (fs.existsSync(seed)) {
    fs.copyFileSync(seed, dest);
  } else {
    writeJsonAtomic(dest, emptyCatalog());
  }
}

function normalizeCatalog(raw) {
  const data = raw && typeof raw === 'object' ? raw : emptyCatalog();
  const list = Array.isArray(data.funds)
    ? data.funds
    : (Array.isArray(data.buyers) ? data.buyers : []);
  data.funds = list;
  data.buyers = list;
  if (!data.version) data.version = 3;
  if (!data.title) data.title = 'Buyers';
  return data;
}

function readCatalog() {
  ensureSeeded();
  try {
    const raw = JSON.parse(fs.readFileSync(catalogPath(), 'utf8'));
    return normalizeCatalog(raw);
  } catch (_) {
    return emptyCatalog();
  }
}

function writeCatalog(catalog) {
  const next = normalizeCatalog(catalog);
  next.updatedAt = new Date().toISOString().slice(0, 10);
  next.buyers = next.funds;
  writeJsonAtomic(catalogPath(), next);
  // Never mirror live buyer intel under public/ — that was served unauthenticated at /data/buyers/.
  // Repo seed (data/buyers/catalog.json) is only updated when writing the default non-PDA path.
  try {
    const defaultRoot = path.resolve(path.join(config.ROOT, 'data', 'buyers'));
    const repoMirror = path.join(config.ROOT, 'data', 'buyers', 'catalog.json');
    if (path.resolve(rootDir()) !== defaultRoot && fs.existsSync(path.dirname(repoMirror))) {
      // Optional: keep git seed in sync only when operators explicitly use a separate BUYERS_ROOT
      // and still want the committed seed updated — skip in production PDA volumes.
    }
  } catch (err) {
    console.warn('[buyers] catalog write post-hook:', err.message);
  }
  return next;
}

function slugId(name) {
  const base = String(name || 'buyer')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'buyer';
  return base;
}

function uniqueId(name, existing) {
  let id = slugId(name);
  const ids = new Set((existing || []).map((b) => b.id));
  if (!ids.has(id)) return id;
  let n = 2;
  while (ids.has(`${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

function parseList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean);
  }
  return String(raw || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseStates(raw) {
  return parseList(raw)
    .map((s) => String(s).trim().toUpperCase())
    .map((s) => (s.length === 2 ? s : s.slice(0, 2)))
    .filter((s) => /^[A-Z]{2}$/.test(s));
}

/**
 * Create a buyer from a simple form payload.
 */
function addBuyer(input = {}) {
  const catalog = readCatalog();
  const name = String(input.name || '').trim();
  if (!name) {
    const err = new Error('Buyer name is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const id = uniqueId(name, catalog.funds);
  const today = new Date().toISOString().slice(0, 10);
  const markets = parseList(input.markets || input.cities);
  const states = parseStates(input.states || input.state);
  const assetTypes = parseList(input.assetTypes || input.assetType || 'sfh');
  const clusters = parseList(input.strategyClusters || input.cluster || 'fix-flip');
  if (!clusters.length) clusters.push('opportunistic');

  const minArv = input.minArv != null && input.minArv !== '' ? Number(input.minArv) : null;
  const maxArv = input.maxArv != null && input.maxArv !== '' ? Number(input.maxArv) : null;
  const maxPurchase = input.maxPurchase != null && input.maxPurchase !== '' ? Number(input.maxPurchase) : null;
  const maxRehab = input.maxRehab != null && input.maxRehab !== '' ? Number(input.maxRehab) : null;
  const exitMin = input.exitPctArvMin != null && input.exitPctArvMin !== '' ? Number(input.exitPctArvMin) : null;
  const exitMax = input.exitPctArvMax != null && input.exitPctArvMax !== '' ? Number(input.exitPctArvMax) : null;

  const box = {
    id: 'primary',
    label: String(input.boxLabel || 'Primary box').trim() || 'Primary box',
    states: states.length ? states : [],
    markets,
    zipPrefixes: [],
    assetTypes: assetTypes.length ? assetTypes : ['sfh'],
    minSqft: null,
    maxSqft: null,
    minBeds: input.minBeds != null && input.minBeds !== '' ? Number(input.minBeds) : null,
    minBaths: null,
    minYear: null,
    maxYear: null,
    maxPurchase: Number.isFinite(maxPurchase) ? maxPurchase : null,
    minArv: Number.isFinite(minArv) ? minArv : null,
    maxArv: Number.isFinite(maxArv) ? maxArv : null,
    minRehab: null,
    maxRehab: Number.isFinite(maxRehab) ? maxRehab : null,
    brickPreferred: false,
    garageRequired: false,
    anyCondition: true,
    conditionBand: '',
    offMarketPreferred: false,
    leasebackPreferred: false,
    waterfrontPreferred: false,
    landOnly: clusters.includes('land') || assetTypes.includes('land'),
    criteriaSummary: [
      markets.length ? `Markets: ${markets.slice(0, 12).join(', ')}` : null,
      states.length ? `States: ${states.join(', ')}` : null,
      Number.isFinite(maxPurchase) ? `Max purchase ~$${Math.round(maxPurchase).toLocaleString()}` : null,
      String(input.criteriaNotes || '').trim() || null
    ].filter(Boolean),
    marketAliases: []
  };

  const speed = String(input.speed || 'normal').toLowerCase();
  const buyer = {
    id,
    name,
    oneLiner: String(input.oneLiner || input.notes || `${name} — custom buyer`).trim(),
    type: String(input.type || input.buyerTypeLabel || 'Known buyer').trim(),
    strategy: String(input.strategy || '').trim(),
    buyerStyle: String(input.buyerStyle || 'Cash').trim(),
    strategyClusters: clusters,
    pitchNotes: String(input.pitchNotes || input.notes || '').trim(),
    notBuying: parseList(input.notBuying).map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase())),
    sourcePath: null,
    buyerType: String(input.buyerType || 'local').trim() || 'local',
    kind: 'known-buyer',
    source: 'manual',
    updatedAt: today,
    contact: {
      name: String(input.contactName || '').trim(),
      phone: String(input.contactPhone || '').trim(),
      email: String(input.contactEmail || '').trim(),
      notes: String(input.contactNotes || '').trim()
    },
    exitPctArvMin: Number.isFinite(exitMin) ? exitMin : null,
    exitPctArvMax: Number.isFinite(exitMax) ? exitMax : null,
    exitFormula: (Number.isFinite(exitMin) || Number.isFinite(exitMax)) ? 'arv_pct_minus_rehab' : null,
    buyBoxes: [box],
    personality: {
      speed: ['hours', 'fast', 'weekly', 'normal', 'process'].includes(speed) ? speed : 'normal',
      pay: 'cash',
      dd: 'normal',
      emd: null,
      tags: ['custom']
    }
  };

  catalog.funds = [buyer].concat(catalog.funds || []);
  return { catalog: writeCatalog(catalog), buyer };
}

function findBuyer(id) {
  const catalog = readCatalog();
  return (catalog.funds || []).find((b) => b.id === id) || null;
}

module.exports = {
  rootDir,
  catalogPath,
  readCatalog,
  writeCatalog,
  addBuyer,
  findBuyer,
  ensureSeeded
};
