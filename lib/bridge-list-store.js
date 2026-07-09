const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { resolveSessionScope } = require('./phuglee-user');
const { rowsToCsv, rowsToXlsxBuffer } = require('./bridge-export');

const MAX_ROWS = 100000;
const MAX_NAME_LEN = 120;
const VALID_STATUSES = new Set(['ready', 'downloaded']);

function listsRoot() {
  return config.FILTER_LISTS_ROOT;
}

function resolveListScope(meta = {}) {
  return resolveSessionScope({
    username: meta.username || '',
    plan: meta.plan || ''
  });
}

function scopeDir(scope) {
  const key = scope?.storageKey || '_anonymous';
  return path.join(listsRoot(), key);
}

function indexPath(scope) {
  return path.join(scopeDir(scope), 'index.json');
}

function listDir(scope, listId) {
  return path.join(scopeDir(scope), listId);
}

function metaPath(scope, listId) {
  return path.join(listDir(scope, listId), 'meta.json');
}

function rowsPath(scope, listId) {
  return path.join(listDir(scope, listId), 'rows.json');
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
  } catch (err) {
    console.warn('[Filter lists] Could not read', filePath, err.message);
    return fallback;
  }
}

function readIndex(scope) {
  const index = readJson(indexPath(scope), { lists: [] });
  return Array.isArray(index.lists) ? index.lists : [];
}

function writeIndex(scope, lists) {
  writeJsonAtomic(indexPath(scope), { lists, updatedAt: new Date().toISOString() });
}

function sanitizeListId(id) {
  const cleaned = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned.slice(0, 64);
}

function createListId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  return `lst_${stamp}_${rand}`;
}

function defaultListName({ city, uploadType, sourceFile, createdAt }) {
  const typeLabel = uploadType === 'water_shut_off' ? 'Water Shut Off' : 'Code Violation';
  const when = createdAt ? new Date(createdAt) : new Date();
  const datePart = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  const cityPart = String(city || 'List').trim() || 'List';
  const filePart = sourceFile ? ` · ${path.basename(String(sourceFile))}` : '';
  return `${cityPart} · ${typeLabel}${datePart ? ` · ${datePart}` : ''}${filePart}`.slice(0, MAX_NAME_LEN);
}

function sanitizeName(name, fallback) {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LEN);
  return cleaned || fallback;
}

function toSummary(meta) {
  return {
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    status: meta.status || 'ready',
    cityId: meta.cityId || '',
    city: meta.city || '',
    state: meta.state || '',
    uploadType: meta.uploadType || '',
    sourceFile: meta.sourceFile || '',
    recordCount: Number(meta.recordCount) || 0,
    downloadedAt: meta.downloadedAt || null
  };
}

function listSummaries(scopeMeta = {}) {
  const scope = resolveListScope(scopeMeta);
  const lists = readIndex(scope)
    .map((entry) => toSummary(entry))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { scope, lists };
}

function getList(listId, scopeMeta = {}, { includeRows = false } = {}) {
  const scope = resolveListScope(scopeMeta);
  const id = sanitizeListId(listId);
  if (!id) {
    const err = new Error('listId is required');
    err.code = 'MISSING_LIST_ID';
    throw err;
  }
  const meta = readJson(metaPath(scope, id), null);
  if (!meta || !meta.id) {
    const err = new Error('List not found');
    err.code = 'LIST_NOT_FOUND';
    throw err;
  }
  const result = { scope, meta: toSummary(meta), stats: meta.stats || {} };
  if (includeRows) {
    result.rows = readJson(rowsPath(scope, id), []);
    if (!Array.isArray(result.rows)) result.rows = [];
  }
  return result;
}

function saveList({
  name,
  rows,
  stats = {},
  cityId = '',
  city = '',
  state = '',
  uploadType = '',
  sourceFile = '',
  processingMeta = {},
  username = '',
  plan = ''
} = {}) {
  if (!Array.isArray(rows) || !rows.length) {
    const err = new Error('rows must be a non-empty array');
    err.code = 'MISSING_ROWS';
    throw err;
  }
  if (rows.length > MAX_ROWS) {
    const err = new Error(`Too many rows (max ${MAX_ROWS})`);
    err.code = 'TOO_MANY_ROWS';
    throw err;
  }

  const scope = resolveListScope({ username, plan });
  const createdAt = new Date().toISOString();
  const id = createListId();
  const listName = sanitizeName(
    name,
    defaultListName({ city, uploadType, sourceFile, createdAt })
  );

  const meta = {
    id,
    name: listName,
    createdAt,
    updatedAt: createdAt,
    status: 'ready',
    cityId: String(cityId || '').trim(),
    city: String(city || '').trim(),
    state: String(state || '').trim(),
    uploadType: String(uploadType || '').trim(),
    sourceFile: String(sourceFile || '').trim(),
    recordCount: rows.length,
    stats: stats && typeof stats === 'object' ? stats : {},
    processingMeta: processingMeta && typeof processingMeta === 'object' ? processingMeta : {},
    downloadedAt: null
  };

  const dir = listDir(scope, id);
  fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(metaPath(scope, id), meta);
  writeJsonAtomic(rowsPath(scope, id), rows);

  const index = readIndex(scope);
  index.unshift(toSummary(meta));
  writeIndex(scope, index);

  return { scope, meta: toSummary(meta) };
}

function renameList(listId, name, scopeMeta = {}) {
  const scope = resolveListScope(scopeMeta);
  const id = sanitizeListId(listId);
  const file = metaPath(scope, id);
  const meta = readJson(file, null);
  if (!meta || !meta.id) {
    const err = new Error('List not found');
    err.code = 'LIST_NOT_FOUND';
    throw err;
  }
  meta.name = sanitizeName(name, meta.name);
  meta.updatedAt = new Date().toISOString();
  writeJsonAtomic(file, meta);

  const index = readIndex(scope).map((entry) => (
    entry.id === id ? toSummary(meta) : entry
  ));
  writeIndex(scope, index);
  return { scope, meta: toSummary(meta) };
}

function markDownloaded(listId, scopeMeta = {}) {
  const scope = resolveListScope(scopeMeta);
  const id = sanitizeListId(listId);
  const file = metaPath(scope, id);
  const meta = readJson(file, null);
  if (!meta || !meta.id) {
    const err = new Error('List not found');
    err.code = 'LIST_NOT_FOUND';
    throw err;
  }
  const now = new Date().toISOString();
  meta.status = 'downloaded';
  meta.downloadedAt = now;
  meta.updatedAt = now;
  writeJsonAtomic(file, meta);

  const index = readIndex(scope).map((entry) => (
    entry.id === id ? toSummary(meta) : entry
  ));
  writeIndex(scope, index);
  return { scope, meta: toSummary(meta) };
}

function deleteList(listId, scopeMeta = {}) {
  const scope = resolveListScope(scopeMeta);
  const id = sanitizeListId(listId);
  const dir = listDir(scope, id);
  if (!fs.existsSync(dir)) {
    const err = new Error('List not found');
    err.code = 'LIST_NOT_FOUND';
    throw err;
  }

  fs.rmSync(dir, { recursive: true, force: true });
  const index = readIndex(scope).filter((entry) => entry.id !== id);
  writeIndex(scope, index);
  return { scope, ok: true, id };
}

function buildDownload(listId, format, scopeMeta = {}) {
  const { meta, rows } = getList(listId, scopeMeta, { includeRows: true });
  const fmt = String(format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
  const safeName = String(meta.name || meta.id || 'filter-list')
    .replace(/[^\w.\- ]+/g, '_')
    .trim()
    .slice(0, 80) || meta.id;

  if (fmt === 'xlsx') {
    return {
      meta,
      buffer: rowsToXlsxBuffer(rows),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${safeName}.xlsx`
    };
  }

  return {
    meta,
    buffer: Buffer.from(rowsToCsv(rows), 'utf8'),
    contentType: 'text/csv; charset=utf-8',
    filename: `${safeName}.csv`
  };
}

function collectAllRows(scopeMeta = {}) {
  const scope = resolveListScope(scopeMeta);
  const lists = readIndex(scope);
  if (!lists.length) {
    const err = new Error('No saved lists to download');
    err.code = 'NO_LISTS';
    throw err;
  }

  const combined = [];
  let totalRecords = 0;
  for (const summary of lists) {
    const id = sanitizeListId(summary.id);
    if (!id) continue;
    const meta = readJson(metaPath(scope, id), null) || summary;
    const rows = readJson(rowsPath(scope, id), []);
    if (!Array.isArray(rows)) continue;
    totalRecords += rows.length;
    for (const row of rows) {
      combined.push({
        ...row,
        savedListName: meta.name || summary.name || id,
        savedListId: id,
        savedListCity: meta.city || summary.city || row.city || '',
        savedListState: meta.state || summary.state || row.state || ''
      });
    }
  }

  if (!combined.length) {
    const err = new Error('Saved lists have no rows to download');
    err.code = 'NO_LISTS';
    throw err;
  }

  return {
    scope,
    lists: lists.map((entry) => toSummary(entry)),
    listCount: lists.length,
    recordCount: totalRecords,
    rows: combined
  };
}

function combinedRowsToCsv(rows) {
  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const { toExportRow, EXPORT_COLUMN_ORDER } = require('./bridge-intake-schema');
  const headers = ['List Name', 'List City', 'List State', ...EXPORT_COLUMN_ORDER];
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => {
      const exported = toExportRow(row);
      const cells = [
        row.savedListName || '',
        row.savedListCity || '',
        row.savedListState || '',
        ...EXPORT_COLUMN_ORDER.map((h) => exported[h] ?? '')
      ];
      return cells.map(escape).join(',');
    })
  ];
  return `${lines.join('\n')}\n`;
}

function combinedRowsToXlsx(rows) {
  const XLSX = require('xlsx');
  const { toExportRow, EXPORT_COLUMN_ORDER } = require('./bridge-intake-schema');
  const headers = ['List Name', 'List City', 'List State', ...EXPORT_COLUMN_ORDER];
  const data = rows.map((row) => {
    const exported = toExportRow(row);
    const out = {
      'List Name': row.savedListName || '',
      'List City': row.savedListCity || '',
      'List State': row.savedListState || ''
    };
    for (const h of EXPORT_COLUMN_ORDER) out[h] = exported[h] ?? '';
    return out;
  });
  const sheet = XLSX.utils.json_to_sheet(data, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'All Filter Lists');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function buildDownloadAll(format, scopeMeta = {}) {
  const collected = collectAllRows(scopeMeta);
  const fmt = String(format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
  const stamp = new Date().toISOString().slice(0, 10);
  const filenameBase = `filter-lists-all-${stamp}`;

  // Mark every list downloaded
  for (const list of collected.lists) {
    try {
      markDownloaded(list.id, scopeMeta);
    } catch (_) {}
  }

  if (fmt === 'xlsx') {
    return {
      listCount: collected.listCount,
      recordCount: collected.recordCount,
      buffer: combinedRowsToXlsx(collected.rows),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${filenameBase}.xlsx`
    };
  }

  return {
    listCount: collected.listCount,
    recordCount: collected.recordCount,
    buffer: Buffer.from(combinedRowsToCsv(collected.rows), 'utf8'),
    contentType: 'text/csv; charset=utf-8',
    filename: `${filenameBase}.csv`
  };
}

function clearAllLists(scopeMeta = {}) {
  const scope = resolveListScope(scopeMeta);
  const lists = readIndex(scope);
  let deleted = 0;
  for (const entry of lists) {
    const id = sanitizeListId(entry.id);
    if (!id) continue;
    const dir = listDir(scope, id);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      deleted += 1;
    }
  }
  writeIndex(scope, []);
  return { scope, ok: true, deleted, remaining: 0 };
}

function isValidStatus(status) {
  return VALID_STATUSES.has(String(status || ''));
}

module.exports = {
  MAX_ROWS,
  defaultListName,
  listSummaries,
  getList,
  saveList,
  renameList,
  markDownloaded,
  deleteList,
  clearAllLists,
  buildDownload,
  buildDownloadAll,
  collectAllRows,
  resolveListScope,
  isValidStatus
};
