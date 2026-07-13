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
    presets: []
  };
}

function readOverlays(username) {
  const data = readJson(overlayPath(username), defaultOverlays());
  return {
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    notes: data.notes && typeof data.notes === 'object' ? data.notes : {},
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

function savePresets(username, presets) {
  const overlays = readOverlays(username);
  overlays.presets = Array.isArray(presets) ? presets : [];
  writeOverlays(username, overlays);
  return overlays.presets;
}

module.exports = {
  readOverlays,
  toggleFavorite,
  upsertNote,
  savePresets
};
