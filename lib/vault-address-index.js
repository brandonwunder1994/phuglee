/**
 * Vault (Home + Land leads catalog) address index for Filter hard-skip.
 * Always applied on process — operators should not re-scrub properties already
 * published to The Vault.
 */
const { normalizeAddressKey } = require('./analyzer-import-index');

const CACHE_TTL_MS = 2 * 60 * 1000;
let cache = null;

function emptyIndex() {
  return {
    addresses: new Set(),
    count: 0,
    sources: { vault: 0 },
    loadedAt: Date.now()
  };
}

function addVaultEntryKeys(addresses, entry) {
  if (!entry || typeof entry !== 'object') return false;
  let added = false;
  const full = [
    entry.address || entry.street || '',
    entry.city || '',
    entry.state || '',
    entry.zip || entry.postal || ''
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
  const fullKey = normalizeAddressKey(full);
  if (fullKey) {
    addresses.add(fullKey);
    added = true;
  }
  const streetOnly = normalizeAddressKey(
    entry.address
      ? String(entry.address).split(',')[0]
      : entry.street || ''
  );
  if (streetOnly) {
    addresses.add(streetOnly);
    added = true;
  }
  return added;
}

/**
 * Build address Set from Vault catalog index (synchronous, disk).
 */
function buildVaultAddressIndexFromCatalog(leads = []) {
  const addresses = new Set();
  let vault = 0;
  for (const entry of leads || []) {
    if (addVaultEntryKeys(addresses, entry)) vault += 1;
  }
  return {
    addresses,
    count: addresses.size,
    sources: { vault },
    loadedAt: Date.now()
  };
}

function loadVaultAddressIndex({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache?.loadedAt && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }
  try {
    const { readIndex } = require('./leads-platform/store');
    const leads = readIndex() || [];
    cache = buildVaultAddressIndexFromCatalog(leads);
  } catch (err) {
    console.warn('[Bridge] Vault address index unavailable:', err.message);
    cache = emptyIndex();
  }
  return cache;
}

function clearVaultAddressIndexCache() {
  cache = null;
}

module.exports = {
  emptyIndex,
  buildVaultAddressIndexFromCatalog,
  loadVaultAddressIndex,
  clearVaultAddressIndexCache,
  addVaultEntryKeys
};
