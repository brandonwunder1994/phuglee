const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { resolveSessionScope } = require('./phuglee-user');
const { rowsToCsv, rowsToXlsxBuffer, rowsToFullCsv, rowsToFullXlsxBuffer } = require('./bridge-export');
const { uploadTypeLabel } = require('./bridge-intake-schema');
const { summarizeLandRoute } = require('./leads-platform/land/filter-route');

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

/**
 * @param {string} filePath
 * @param {*} data
 * @param {{ pretty?: boolean }} [opts] pretty=false for large rows.json (compact = less disk/RAM)
 */
function writeJsonAtomic(filePath, data, opts = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const pretty = opts.pretty !== false;
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  fs.writeFileSync(tmp, text, 'utf8');
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
  const typeLabel = uploadTypeLabel(uploadType) || 'List';
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
    downloadedAt: meta.downloadedAt || null,
    landRoute: meta.landRoute && typeof meta.landRoute === 'object' ? meta.landRoute : null
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
    landRoute: summarizeLandRoute(rows, uploadType),
    downloadedAt: null
  };

  const dir = listDir(scope, id);
  fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(metaPath(scope, id), meta, { pretty: true });
  // Compact rows — pretty-print doubles size on 10k–100k lead lists
  writeJsonAtomic(rowsPath(scope, id), rows, { pretty: false });

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
  return setListStatus(listId, 'downloaded', scopeMeta);
}

/**
 * Set list status to ready | downloaded. Clears downloadedAt when returning to ready.
 */
function setListStatus(listId, status, scopeMeta = {}) {
  const next = String(status || '').trim();
  if (!isValidStatus(next)) {
    const err = new Error('status must be ready or downloaded');
    err.code = 'INVALID_STATUS';
    throw err;
  }
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
  meta.status = next;
  if (next === 'downloaded') {
    meta.downloadedAt = now;
  } else {
    meta.downloadedAt = null;
  }
  meta.updatedAt = now;
  writeJsonAtomic(file, meta);

  const index = readIndex(scope).map((entry) => (
    entry.id === id ? toSummary(meta) : entry
  ));
  writeIndex(scope, index);
  return { scope, meta: toSummary(meta) };
}

/** Walk every storage-key directory under FILTER_LISTS_ROOT. */
function forEachListScopeKey(fn) {
  const root = listsRoot();
  if (!fs.existsSync(root)) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (String(ent.name).startsWith('.')) continue;
    fn(ent.name);
  }
}

/**
 * Ops helper: set status=ready for lists whose city (or name) matches any needle.
 * When onceKey is set, writes a marker under FILTER_LISTS_ROOT and no-ops on later boots.
 *
 * @param {string[]} cityNames e.g. ['Cheyenne', 'Midlothian']
 * @param {{ onceKey?: string }} opts
 * @returns {{ updated: number, skipped: boolean, matches: string[] }}
 */
function resetCitiesStatusToReady(cityNames, opts = {}) {
  const onceKey = opts.onceKey ? String(opts.onceKey).replace(/[^a-zA-Z0-9._-]/g, '') : '';
  if (onceKey) {
    const marker = path.join(listsRoot(), `.ops-${onceKey}`);
    if (fs.existsSync(marker)) {
      return { updated: 0, skipped: true, matches: [] };
    }
  }

  const needles = (cityNames || [])
    .map((c) => String(c || '').trim().toLowerCase())
    .filter(Boolean);
  if (!needles.length) {
    return { updated: 0, skipped: false, matches: [] };
  }

  const matches = [];
  let updated = 0;

  forEachListScopeKey((storageKey) => {
    const scope = { storageKey };
    const index = readIndex(scope);
    let dirty = false;
    const nextIndex = index.map((entry) => {
      if (!entry || !entry.id) return entry;
      const city = String(entry.city || '').toLowerCase();
      const name = String(entry.name || '').toLowerCase();
      const hit = needles.some((n) => city.includes(n) || name.includes(n));
      if (!hit || entry.status === 'ready') return entry;
      const file = metaPath(scope, sanitizeListId(entry.id));
      const meta = readJson(file, null);
      if (!meta || !meta.id) return entry;
      meta.status = 'ready';
      meta.downloadedAt = null;
      meta.updatedAt = new Date().toISOString();
      writeJsonAtomic(file, meta);
      dirty = true;
      updated += 1;
      matches.push(`${storageKey}/${meta.id}:${meta.city || meta.name}`);
      return toSummary(meta);
    });
    if (dirty) writeIndex(scope, nextIndex);
  });

  if (onceKey) {
    try {
      fs.mkdirSync(listsRoot(), { recursive: true });
      fs.writeFileSync(
        path.join(listsRoot(), `.ops-${onceKey}`),
        JSON.stringify({ at: new Date().toISOString(), updated, matches }, null, 2),
        'utf8'
      );
    } catch (err) {
      console.warn('[Filter lists] Could not write ops marker:', err.message);
    }
  }

  return { updated, skipped: false, matches };
}

/**
 * Ops helper: set status=ready for every list currently marked downloaded.
 * When onceKey is set, writes a marker under FILTER_LISTS_ROOT and no-ops on later boots.
 *
 * @param {{ onceKey?: string }} opts
 * @returns {{ updated: number, skipped: boolean, matches: string[] }}
 */
function resetAllDownloadedStatusToReady(opts = {}) {
  const onceKey = opts.onceKey ? String(opts.onceKey).replace(/[^a-zA-Z0-9._-]/g, '') : '';
  if (onceKey) {
    const marker = path.join(listsRoot(), `.ops-${onceKey}`);
    if (fs.existsSync(marker)) {
      return { updated: 0, skipped: true, matches: [] };
    }
  }

  const matches = [];
  let updated = 0;

  forEachListScopeKey((storageKey) => {
    const scope = { storageKey };
    const index = readIndex(scope);
    let dirty = false;
    const nextIndex = index.map((entry) => {
      if (!entry || !entry.id) return entry;
      if (String(entry.status || 'ready') !== 'downloaded') return entry;
      const file = metaPath(scope, sanitizeListId(entry.id));
      const meta = readJson(file, null);
      if (!meta || !meta.id) return entry;
      meta.status = 'ready';
      meta.downloadedAt = null;
      meta.updatedAt = new Date().toISOString();
      writeJsonAtomic(file, meta);
      dirty = true;
      updated += 1;
      matches.push(`${storageKey}/${meta.id}:${meta.city || meta.name || meta.id}`);
      return toSummary(meta);
    });
    if (dirty) writeIndex(scope, nextIndex);
  });

  if (onceKey) {
    try {
      fs.mkdirSync(listsRoot(), { recursive: true });
      fs.writeFileSync(
        path.join(listsRoot(), `.ops-${onceKey}`),
        JSON.stringify({ at: new Date().toISOString(), updated, matches }, null, 2),
        'utf8'
      );
    } catch (err) {
      console.warn('[Filter lists] Could not write ops marker:', err.message);
    }
  }

  return { updated, skipped: false, matches };
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

/**
 * @param {object} scopeMeta
 * @param {{ listIds?: string[] }} [opts] — when listIds set, only those lists (filtered bulk download)
 */
function collectAllRows(scopeMeta = {}, opts = {}) {
  const scope = resolveListScope(scopeMeta);
  let lists = readIndex(scope);
  const idFilter = Array.isArray(opts.listIds)
    ? new Set(
      opts.listIds
        .map((id) => sanitizeListId(id))
        .filter(Boolean)
    )
    : null;
  if (idFilter && idFilter.size) {
    lists = lists.filter((entry) => idFilter.has(sanitizeListId(entry.id)));
  }
  if (!lists.length) {
    const err = new Error(
      idFilter && idFilter.size
        ? 'No matching saved lists to download'
        : 'No saved lists to download'
    );
    err.code = 'NO_LISTS';
    throw err;
  }

  const combined = [];
  let totalRecords = 0;
  const usedLists = [];
  for (const summary of lists) {
    const id = sanitizeListId(summary.id);
    if (!id) continue;
    const meta = readJson(metaPath(scope, id), null) || summary;
    const rows = readJson(rowsPath(scope, id), []);
    if (!Array.isArray(rows)) continue;
    totalRecords += rows.length;
    usedLists.push(toSummary(meta));
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
    lists: usedLists,
    listCount: usedLists.length,
    recordCount: totalRecords,
    rows: combined
  };
}

/** Bulk inventory CSV — address-only enrichment columns. */
function combinedRowsToCsv(rows) {
  return rowsToCsv(rows);
}

/** Bulk inventory XLSX — address-only enrichment columns. */
function combinedRowsToXlsx(rows) {
  return rowsToXlsxBuffer(rows, 'All Filter Lists');
}

/** Bulk FULL CSV — all normalized columns (pre-enrichment shape). */
function combinedRowsToFullCsv(rows) {
  return rowsToFullCsv(rows);
}

/** Bulk FULL XLSX — all normalized columns (pre-enrichment shape). */
function combinedRowsToFullXlsx(rows) {
  return rowsToFullXlsxBuffer(rows, 'Full Filter Export');
}

/**
 * @param {string} format
 * @param {object} scopeMeta
 * @param {{ listIds?: string[] }} [opts]
 */
function buildDownloadAll(format, scopeMeta = {}, opts = {}) {
  const collected = collectAllRows(scopeMeta, opts);
  const fmt = String(format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
  const stamp = new Date().toISOString().slice(0, 10);
  const filtered = Array.isArray(opts.listIds) && opts.listIds.length > 0;
  const filenameBase = filtered
    ? `filter-lists-filtered-${stamp}`
    : `filter-lists-all-${stamp}`;

  // Mark only included lists downloaded
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

/**
 * Bulk FULL export — every normalized Filter column (tags, types, notes, etc.).
 * Does NOT collapse to Street/City/State/Postal. Does not mark lists downloaded
 * (enrichment handoff still uses the address-only downloads).
 *
 * @param {string} format
 * @param {object} scopeMeta
 * @param {{ listIds?: string[] }} [opts]
 */
function buildDownloadAllFull(format, scopeMeta = {}, opts = {}) {
  const collected = collectAllRows(scopeMeta, opts);
  const fmt = String(format || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
  const stamp = new Date().toISOString().slice(0, 10);
  const filtered = Array.isArray(opts.listIds) && opts.listIds.length > 0;
  const filenameBase = filtered
    ? `filter-lists-full-filtered-${stamp}`
    : `filter-lists-full-${stamp}`;

  if (fmt === 'csv') {
    return {
      listCount: collected.listCount,
      recordCount: collected.recordCount,
      buffer: Buffer.from(combinedRowsToFullCsv(collected.rows), 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      filename: `${filenameBase}.csv`
    };
  }

  return {
    listCount: collected.listCount,
    recordCount: collected.recordCount,
    buffer: combinedRowsToFullXlsx(collected.rows),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${filenameBase}.xlsx`
  };
}

/** Default enrichment batch size (5,000 leads per sheet/file). */
const EXPORT_BATCH_SIZE = 5000;

/**
 * Split rows into fixed-size batches (last batch may be smaller).
 * @param {Array} rows
 * @param {number} [batchSize]
 * @returns {Array<{ index: number, start: number, end: number, rows: Array }>}
 */
function chunkRowsForExport(rows, batchSize = EXPORT_BATCH_SIZE) {
  const size = Math.max(1, Math.floor(Number(batchSize) || EXPORT_BATCH_SIZE));
  const list = Array.isArray(rows) ? rows : [];
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    const slice = list.slice(i, i + size);
    chunks.push({
      index: chunks.length + 1,
      start: i + 1,
      end: i + slice.length,
      rows: slice
    });
  }
  return chunks;
}

function batchSheetName(chunk, totalBatches) {
  // Excel sheet name max 31 chars
  const n = chunk.rows.length;
  const raw = `Batch ${chunk.index} of ${totalBatches} (${n})`;
  return raw.length <= 31 ? raw : `Batch ${chunk.index} (${n})`.slice(0, 31);
}

function combinedRowsToXlsxBatched(rows, batchSize = EXPORT_BATCH_SIZE) {
  const XLSX = require('xlsx');
  const { ADDRESS_EXPORT_HEADERS, toAddressExportRow } = require('./bridge-export');
  const headers = ADDRESS_EXPORT_HEADERS;
  const chunks = chunkRowsForExport(rows, batchSize);
  const workbook = XLSX.utils.book_new();
  const total = chunks.length || 1;

  if (!chunks.length) {
    const sheet = XLSX.utils.json_to_sheet([], { header: [...headers] });
    XLSX.utils.book_append_sheet(workbook, sheet, 'Batch 1 (0)');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  for (const chunk of chunks) {
    const data = chunk.rows.map(toAddressExportRow);
    const sheet = XLSX.utils.json_to_sheet(data, { header: [...headers] });
    XLSX.utils.book_append_sheet(workbook, sheet, batchSheetName(chunk, total));
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function combinedRowsToCsvZip(rows, batchSize = EXPORT_BATCH_SIZE) {
  const JSZip = require('jszip');
  const chunks = chunkRowsForExport(rows, batchSize);
  const zip = new JSZip();
  const total = chunks.length || 1;
  if (!chunks.length) {
    zip.file('batch-01-of-01-0rows.csv', combinedRowsToCsv([]));
  } else {
    for (const chunk of chunks) {
      const pad = String(chunk.index).padStart(2, '0');
      const totalPad = String(total).padStart(2, '0');
      const name = `batch-${pad}-of-${totalPad}-${chunk.rows.length}rows.csv`;
      zip.file(name, combinedRowsToCsv(chunk.rows));
    }
  }
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  return buffer;
}

/**
 * Walk inventory lists in order without building one mega array first.
 * Yields raw row objects (same shape as rows.json).
 * @param {object} scopeMeta
 * @param {{ listIds?: string[] }} [opts]
 * @returns {{ lists: object[], listCount: number, recordCount: number, iterate: function(): Generator }}
 */
function openInventoryRowSource(scopeMeta = {}, opts = {}) {
  const scope = resolveListScope(scopeMeta);
  let lists = readIndex(scope);
  const idFilter = Array.isArray(opts.listIds)
    ? new Set(
      opts.listIds
        .map((id) => sanitizeListId(id))
        .filter(Boolean)
    )
    : null;
  if (idFilter && idFilter.size) {
    lists = lists.filter((entry) => idFilter.has(sanitizeListId(entry.id)));
  }
  if (!lists.length) {
    const err = new Error(
      idFilter && idFilter.size
        ? 'No matching saved lists to download'
        : 'No saved lists to download'
    );
    err.code = 'NO_LISTS';
    throw err;
  }

  /** Only meta + path ids here; rows re-read during iterate so peak RAM is one list + one batch. */
  const usedLists = [];
  let recordCount = 0;
  for (const summary of lists) {
    const id = sanitizeListId(summary.id);
    if (!id) continue;
    const meta = readJson(metaPath(scope, id), null) || summary;
    const rows = readJson(rowsPath(scope, id), []);
    if (!Array.isArray(rows) || !rows.length) continue;
    recordCount += rows.length;
    usedLists.push(toSummary(meta));
  }

  if (!usedLists.length) {
    const err = new Error('Saved lists have no rows to download');
    err.code = 'NO_LISTS';
    throw err;
  }

  function* iterate() {
    for (const meta of usedLists) {
      const id = sanitizeListId(meta.id);
      if (!id) continue;
      const rows = readJson(rowsPath(scope, id), []);
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        yield row;
      }
    }
  }

  return {
    scope,
    lists: usedLists,
    listCount: usedLists.length,
    recordCount,
    iterate
  };
}

/**
 * Build batched XLSX from a row iterator (one sheet per batchSize).
 * Only holds one batch of rows in memory at a time for sheet build.
 */
function xlsxBatchedFromIterator(iterate, batchSize, recordCount) {
  const XLSX = require('xlsx');
  const { ADDRESS_EXPORT_HEADERS, toAddressExportRow } = require('./bridge-export');
  const headers = ADDRESS_EXPORT_HEADERS;
  const size = Math.max(1, Math.floor(Number(batchSize) || EXPORT_BATCH_SIZE));
  const totalBatches = Math.max(1, Math.ceil((Number(recordCount) || 0) / size));
  const workbook = XLSX.utils.book_new();

  let batch = [];
  let index = 0;
  let sheets = 0;

  const flush = () => {
    if (!batch.length) return;
    index += 1;
    const data = batch.map(toAddressExportRow);
    const sheet = XLSX.utils.json_to_sheet(data, { header: [...headers] });
    const chunk = { index, rows: batch };
    XLSX.utils.book_append_sheet(workbook, sheet, batchSheetName(chunk, totalBatches));
    sheets += 1;
    batch = [];
  };

  for (const row of iterate()) {
    batch.push(row);
    if (batch.length >= size) flush();
  }
  flush();

  if (!sheets) {
    const sheet = XLSX.utils.json_to_sheet([], { header: [...headers] });
    XLSX.utils.book_append_sheet(workbook, sheet, 'Batch 1 (0)');
    sheets = 1;
  }

  return {
    buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    batchCount: sheets
  };
}

async function csvZipFromIterator(iterate, batchSize, recordCount) {
  const JSZip = require('jszip');
  const size = Math.max(1, Math.floor(Number(batchSize) || EXPORT_BATCH_SIZE));
  const totalBatches = Math.max(1, Math.ceil((Number(recordCount) || 0) / size));
  const zip = new JSZip();

  let batch = [];
  let index = 0;
  let files = 0;

  const flush = () => {
    if (!batch.length) return;
    index += 1;
    const pad = String(index).padStart(2, '0');
    const totalPad = String(totalBatches).padStart(2, '0');
    const name = `batch-${pad}-of-${totalPad}-${batch.length}rows.csv`;
    zip.file(name, combinedRowsToCsv(batch));
    files += 1;
    batch = [];
  };

  for (const row of iterate()) {
    batch.push(row);
    if (batch.length >= size) flush();
  }
  flush();

  if (!files) {
    zip.file('batch-01-of-01-0rows.csv', combinedRowsToCsv([]));
    files = 1;
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  return { buffer, batchCount: files };
}

/**
 * Bulk export of all (or filtered) inventory rows in batches of 5,000.
 * - xlsx: one workbook, one sheet per batch
 * - csv: zip of one CSV per batch
 * Streams list files so we never build one giant combined[] of every lead.
 *
 * @param {string} format
 * @param {object} scopeMeta
 * @param {{ listIds?: string[], batchSize?: number }} [opts]
 */
async function buildDownloadAllBatched(format, scopeMeta = {}, opts = {}) {
  const source = openInventoryRowSource(scopeMeta, opts);
  const batchSize = Math.max(
    1,
    Math.min(50000, Math.floor(Number(opts.batchSize) || EXPORT_BATCH_SIZE))
  );
  const fmt = String(format || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
  const stamp = new Date().toISOString().slice(0, 10);
  const filtered = Array.isArray(opts.listIds) && opts.listIds.length > 0;
  const filenameBase = filtered
    ? `filter-lists-batched-filtered-${stamp}`
    : `filter-lists-batched-${stamp}`;

  for (const list of source.lists) {
    try {
      markDownloaded(list.id, scopeMeta);
    } catch (_) {}
  }

  if (fmt === 'csv') {
    const { buffer, batchCount } = await csvZipFromIterator(
      source.iterate,
      batchSize,
      source.recordCount
    );
    return {
      listCount: source.listCount,
      recordCount: source.recordCount,
      batchCount,
      batchSize,
      buffer,
      contentType: 'application/zip',
      filename: `${filenameBase}.zip`
    };
  }

  const { buffer, batchCount } = xlsxBatchedFromIterator(
    source.iterate,
    batchSize,
    source.recordCount
  );
  return {
    listCount: source.listCount,
    recordCount: source.recordCount,
    batchCount,
    batchSize,
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${filenameBase}.xlsx`
  };
}

/**
 * Delete many lists by id (bulk inventory delete). Unknown ids skipped.
 * @returns {{ scope: object, ok: true, deleted: number, remaining: number }}
 */
function deleteLists(listIds, scopeMeta = {}) {
  const scope = resolveListScope(scopeMeta);
  const ids = (Array.isArray(listIds) ? listIds : [])
    .map((id) => sanitizeListId(id))
    .filter(Boolean);
  let deleted = 0;
  for (const id of ids) {
    try {
      deleteList(id, scopeMeta);
      deleted += 1;
    } catch (_) {
      /* skip missing */
    }
  }
  const remaining = readIndex(scope).length;
  return { scope, ok: true, deleted, remaining };
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
  EXPORT_BATCH_SIZE,
  defaultListName,
  listSummaries,
  getList,
  saveList,
  renameList,
  markDownloaded,
  setListStatus,
  resetCitiesStatusToReady,
  resetAllDownloadedStatusToReady,
  deleteList,
  deleteLists,
  clearAllLists,
  buildDownload,
  buildDownloadAll,
  buildDownloadAllFull,
  buildDownloadAllBatched,
  chunkRowsForExport,
  collectAllRows,
  resolveListScope,
  isValidStatus
};
