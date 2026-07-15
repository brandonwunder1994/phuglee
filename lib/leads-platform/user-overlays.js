const fs = require('fs');
const path = require('path');
const config = require('../config');

function sanitizeUsername(username) {
  return String(username || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'anonymous';
}

function overlayPath(username) {
  return path.join(config.LEADS_CATALOG_ROOT, '_users', sanitizeUsername(username), 'overlays.json');
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function defaultOverlays() {
  return {
    favorites: [],
    notes: {},
    dispositions: {},
    presets: []
  };
}

function readOverlays(username) {
  const data = readJson(overlayPath(username), defaultOverlays());
  return {
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    notes: data.notes && typeof data.notes === 'object' ? data.notes : {},
    dispositions: data.dispositions && typeof data.dispositions === 'object' ? data.dispositions : {},
    presets: Array.isArray(data.presets) ? data.presets : []
  };
}

function writeOverlays(username, data) {
  writeJsonAtomic(overlayPath(username), data);
}

function toggleFavorite(username, leadId) {
  const overlays = readOverlays(username);
  const id = String(leadId || '').trim();
  const set = new Set(overlays.favorites);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  overlays.favorites = [...set];
  writeOverlays(username, overlays);
  return overlays.favorites.includes(id);
}

function upsertNote(username, leadId, text) {
  const overlays = readOverlays(username);
  const id = String(leadId || '').trim();
  const note = String(text || '').trim();
  if (!note) delete overlays.notes[id];
  else overlays.notes[id] = note;
  writeOverlays(username, overlays);
  return overlays.notes[id] || '';
}

const DISPOSITIONS = new Set(['', 'contacted', 'vm', 'callback', 'interested', 'dead']);

function upsertDisposition(username, leadId, disposition) {
  const overlays = readOverlays(username);
  const id = String(leadId || '').trim();
  const value = String(disposition || '').trim().toLowerCase();
  if (!DISPOSITIONS.has(value)) {
    const err = new Error('Invalid disposition');
    err.code = 'INVALID_DISPOSITION';
    throw err;
  }
  if (!value) delete overlays.dispositions[id];
  else overlays.dispositions[id] = value;
  writeOverlays(username, overlays);
  return overlays.dispositions[id] || '';
}

function savePresets(username, presets) {
  const overlays = readOverlays(username);
  const now = new Date().toISOString();
  overlays.presets = (Array.isArray(presets) ? presets : []).slice(0, 40).map((p, i) => {
    const name = String(p?.name || '').trim().slice(0, 48) || `Pull ${i + 1}`;
    return {
      id: String(p?.id || '').trim() || `pull-${Date.now().toString(36)}-${i}`,
      name,
      createdAt: p?.createdAt || now,
      updatedAt: now,
      filters: p?.filters && typeof p.filters === 'object' ? p.filters : {}
    };
  });
  writeOverlays(username, overlays);
  return overlays.presets;
}

function bulkSetFavorites(username, ids = [], favorite = true) {
  const overlays = readOverlays(username);
  const set = new Set(overlays.favorites);
  const list = Array.isArray(ids) ? ids : [];
  list.forEach((id) => {
    const key = String(id || '').trim();
    if (!key) return;
    if (favorite) set.add(key);
    else set.delete(key);
  });
  overlays.favorites = [...set];
  writeOverlays(username, overlays);
  return overlays.favorites;
}

module.exports = {
  DISPOSITIONS,
  readOverlays,
  toggleFavorite,
  bulkSetFavorites,
  upsertNote,
  upsertDisposition,
  savePresets
};
