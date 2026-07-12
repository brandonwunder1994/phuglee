/**
 * Server-side Filter Process drafts.
 * Full kept / not-distressed rows stay on disk; the browser pages through them.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { resolveSessionScope } = require('./phuglee-user');
const {
  buildReviewGroups,
  resolveRowIdsForGroup,
  slimReviewGroups,
  findGroupInReviewGroups
} = require('./bridge-review-groups');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function draftsRoot() {
  return config.FILTER_DRAFTS_ROOT;
}

function resolveDraftScope(meta = {}) {
  return resolveSessionScope({
    username: meta.username || '',
    plan: meta.plan || ''
  });
}

function scopeDir(scope) {
  const key = scope?.storageKey || '_anonymous';
  return path.join(draftsRoot(), key);
}

function draftDir(scope, draftId) {
  return path.join(scopeDir(scope), sanitizeDraftId(draftId));
}

function metaPath(scope, draftId) {
  return path.join(draftDir(scope, draftId), 'meta.json');
}

function rowsPath(scope, draftId) {
  return path.join(draftDir(scope, draftId), 'rows.json');
}

function fnPath(scope, draftId) {
  return path.join(draftDir(scope, draftId), 'not-distressed.json');
}

function groupsPath(scope, draftId) {
  return path.join(draftDir(scope, draftId), 'review-groups.json');
}

function sanitizeDraftId(id) {
  return String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function createDraftId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(4).toString('hex');
  return `dft_${stamp}_${rand}`;
}

function writeJsonAtomic(filePath, data, pretty = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn('[Filter drafts] could not read', filePath, err.message);
    return fallback;
  }
}

/**
 * Persist a full process payload as a draft; return slim client view + first page.
 * @param {object} payload - process result (rows, notDistressedRows, reviewGroups, stats, …)
 * @param {object} scopeMeta
 * @param {{ pageSize?: number }} [opts]
 */
function saveProcessDraft(payload, scopeMeta = {}, opts = {}) {
  const scope = resolveDraftScope(scopeMeta);
  const id = createDraftId();
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(opts.pageSize) || DEFAULT_PAGE_SIZE))
  );

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const notDistressedRows = Array.isArray(payload.notDistressedRows)
    ? payload.notDistressedRows
    : [];
  const reviewGroups = payload.reviewGroups || {
    distressed: buildReviewGroups(rows, 'distressed'),
    notDistressed: buildReviewGroups(notDistressedRows, 'not_distressed')
  };

  const meta = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    city: payload.city || null,
    uploadType: payload.uploadType || '',
    sourceFile: payload.sourceFile || '',
    sourceFiles: payload.sourceFiles || null,
    fileCount: payload.fileCount || 1,
    processedAt: payload.processedAt || new Date().toISOString(),
    stats: payload.stats || {},
    processingMeta: payload.processingMeta || {},
    brainMeta: payload.brainMeta || {},
    discardedTotal: payload.discardedTotal != null
      ? payload.discardedTotal
      : (Array.isArray(payload.discarded) ? payload.discarded.length : 0),
    rowsTotal: rows.length,
    notDistressedTotal: notDistressedRows.length,
    pageSize
  };

  const dir = draftDir(scope, id);
  fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(metaPath(scope, id), meta, true);
  writeJsonAtomic(rowsPath(scope, id), rows, false);
  writeJsonAtomic(fnPath(scope, id), notDistressedRows, false);
  writeJsonAtomic(groupsPath(scope, id), reviewGroups, false);

  return buildClientPayload(scope, id, meta, reviewGroups, rows, {
    page: 1,
    pageSize,
    discardedSample: Array.isArray(payload.discarded) ? payload.discarded : []
  });
}

function loadDraftMeta(draftId, scopeMeta = {}) {
  const scope = resolveDraftScope(scopeMeta);
  const id = sanitizeDraftId(draftId);
  if (!id) {
    const err = new Error('draftId is required');
    err.code = 'MISSING_DRAFT_ID';
    throw err;
  }
  const meta = readJson(metaPath(scope, id), null);
  if (!meta || !meta.id) {
    const err = new Error('Process draft not found or expired — re-process the file');
    err.code = 'DRAFT_NOT_FOUND';
    throw err;
  }
  // Soft TTL: warn via still serving; purge only if very old
  const created = Date.parse(meta.createdAt || '') || 0;
  if (created && Date.now() - created > DRAFT_TTL_MS * 2) {
    const err = new Error('Process draft expired — re-process the file');
    err.code = 'DRAFT_EXPIRED';
    throw err;
  }
  return { scope, meta, id };
}

function loadDraftFull(draftId, scopeMeta = {}) {
  const { scope, meta, id } = loadDraftMeta(draftId, scopeMeta);
  const rows = readJson(rowsPath(scope, id), []);
  const notDistressedRows = readJson(fnPath(scope, id), []);
  let reviewGroups = readJson(groupsPath(scope, id), null);
  if (!reviewGroups) {
    reviewGroups = {
      distressed: buildReviewGroups(Array.isArray(rows) ? rows : [], 'distressed'),
      notDistressed: buildReviewGroups(
        Array.isArray(notDistressedRows) ? notDistressedRows : [],
        'not_distressed'
      )
    };
  }
  return {
    scope,
    id,
    meta,
    rows: Array.isArray(rows) ? rows : [],
    notDistressedRows: Array.isArray(notDistressedRows) ? notDistressedRows : [],
    reviewGroups
  };
}

function persistDraftLists(scope, id, { rows, notDistressedRows, reviewGroups, stats }) {
  if (Array.isArray(rows)) writeJsonAtomic(rowsPath(scope, id), rows, false);
  if (Array.isArray(notDistressedRows)) {
    writeJsonAtomic(fnPath(scope, id), notDistressedRows, false);
  }
  if (reviewGroups) writeJsonAtomic(groupsPath(scope, id), reviewGroups, false);
  const meta = readJson(metaPath(scope, id), null) || { id };
  meta.updatedAt = new Date().toISOString();
  if (Array.isArray(rows)) meta.rowsTotal = rows.length;
  if (Array.isArray(notDistressedRows)) meta.notDistressedTotal = notDistressedRows.length;
  if (stats && typeof stats === 'object') meta.stats = { ...(meta.stats || {}), ...stats };
  writeJsonAtomic(metaPath(scope, id), meta, true);
  return meta;
}

/**
 * Filter + sort + page kept rows from a draft.
 */
function queryDraftRows(draftId, scopeMeta = {}, query = {}) {
  const draft = loadDraftFull(draftId, scopeMeta);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(query.pageSize) || draft.meta.pageSize || DEFAULT_PAGE_SIZE))
  );
  let page = Math.max(1, Math.floor(Number(query.page) || 1));
  const q = String(query.q || query.search || '').trim().toLowerCase();
  const category = String(query.category || '').trim();
  const tag = String(query.tag || '').trim();
  const confidence = String(query.confidence || '').trim();
  const reviewOnly = query.reviewOnly === true || query.reviewOnly === '1' || query.reviewOnly === 'true';
  const sortKey = String(query.sortKey || query.sort || 'streetAddress').trim() || 'streetAddress';
  const sortDir = String(query.sortDir || query.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

  let filtered = draft.rows.filter((row) => {
    if (reviewOnly && !row.needsReview) return false;
    if (category && row.category !== category) return false;
    if (tag && row.distressedSignalTag !== tag) return false;
    if (confidence && row.confidenceLevel !== confidence) return false;
    if (!q) return true;
    const haystack = [
      row.streetAddress,
      row.violationIssueType,
      row.category,
      row.distressedSignalTag,
      row.descriptionNotes
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });

  const dir = sortDir === 'desc' ? -1 : 1;
  filtered = filtered.slice().sort((a, b) => {
    const left = String(a[sortKey] || '').toLowerCase();
    const right = String(b[sortKey] || '').toLowerCase();
    if (left < right) return -1 * dir;
    if (left > right) return 1 * dir;
    return 0;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);

  return {
    draftId: draft.id,
    page,
    pageSize,
    total,
    totalPages,
    sortKey,
    sortDir,
    rows,
    stats: draft.meta.stats || {},
    rowsTotal: draft.rows.length
  };
}

function buildClientPayload(scope, id, meta, reviewGroups, allRows, opts = {}) {
  const pageSize = opts.pageSize || meta.pageSize || DEFAULT_PAGE_SIZE;
  const page = opts.page || 1;
  const start = (page - 1) * pageSize;
  const pageRows = (allRows || []).slice(start, start + pageSize);
  return {
    ok: true,
    stub: false,
    paged: true,
    draftId: id,
    page,
    pageSize,
    rowsTotal: Array.isArray(allRows) ? allRows.length : (meta.rowsTotal || 0),
    city: meta.city,
    uploadType: meta.uploadType,
    sourceFile: meta.sourceFile,
    sourceFiles: meta.sourceFiles,
    fileCount: meta.fileCount,
    processedAt: meta.processedAt,
    stats: meta.stats,
    processingMeta: meta.processingMeta,
    brainMeta: meta.brainMeta,
    rows: pageRows,
    notDistressedRows: [],
    reviewGroups: slimReviewGroups(reviewGroups),
    discarded: opts.discardedSample || [],
    discardedTotal: meta.discardedTotal || 0
  };
}

/**
 * Resolve rowIds for a train group from draft pools (by groupId or type keys).
 */
function resolveDraftGroupRowIds(draft, section, groupHint = {}) {
  const groups = draft.reviewGroups || {};
  const list =
    section === 'not_distressed'
      ? groups.notDistressed
      : groups.distressed;
  let group = null;
  if (groupHint.groupId) {
    group = findGroupInReviewGroups(groups, groupHint.groupId, section);
  }
  if (!group && groupHint.violationTypeKey) {
    group = {
      section,
      violationTypeKey: groupHint.violationTypeKey,
      descriptionKey: groupHint.descriptionKey ?? null
    };
  }
  if (!group) {
    const err = new Error('Train group not found on draft');
    err.code = 'GROUP_NOT_FOUND';
    throw err;
  }
  const pool =
    section === 'not_distressed' ? draft.notDistressedRows : draft.rows;
  const rowIds = resolveRowIdsForGroup(pool, group);
  return { group, rowIds, pool };
}

/**
 * Apply train list move on draft (server source of truth).
 */
function applyDraftTrainMove(draftId, scopeMeta, { action, section, groupId, violationTypeKey, descriptionKey }) {
  const draft = loadDraftFull(draftId, scopeMeta);
  const { group, rowIds } = resolveDraftGroupRowIds(draft, section, {
    groupId,
    violationTypeKey,
    descriptionKey
  });
  if (!rowIds.length) {
    const err = new Error('No rows matched this train group on the draft');
    err.code = 'ROW_IDS_NOT_FOUND';
    throw err;
  }

  const idSet = new Set(rowIds.map(String));
  let rows = draft.rows.slice();
  let notDistressedRows = draft.notDistressedRows.slice();
  const movedRows = [];

  if (action === 'deny' && section === 'distressed') {
    const nextKept = [];
    for (const r of rows) {
      if (r && idSet.has(String(r.rowId))) {
        movedRows.push(r);
        notDistressedRows.push({
          ...r,
          distressedSignalTag: 'Standard',
          brainDecision: 'demoted'
        });
      } else if (r) nextKept.push(r);
    }
    rows = nextKept;
  } else if (action === 'deny' && section === 'not_distressed') {
    const nextFn = [];
    for (const r of notDistressedRows) {
      if (r && idSet.has(String(r.rowId))) {
        movedRows.push(r);
        rows.push({
          ...r,
          distressedSignalTag: 'Strong Distressed Signal',
          confidenceLevel: r.confidenceLevel || 'high',
          brainDecision: 'promoted'
        });
      } else if (r) nextFn.push(r);
    }
    notDistressedRows = nextFn;
  }
  // approve = no list move

  const reviewGroups = {
    distressed: buildReviewGroups(rows, 'distressed'),
    notDistressed: buildReviewGroups(notDistressedRows, 'not_distressed')
  };
  const stats = {
    ...(draft.meta.stats || {}),
    kept: rows.length,
    notDistressed: notDistressedRows.length
  };
  if (action === 'deny' && section === 'distressed') {
    stats.noDistress = (Number(stats.noDistress) || 0) + movedRows.length;
  } else if (action === 'deny' && section === 'not_distressed') {
    stats.noDistress = Math.max(0, (Number(stats.noDistress) || 0) - movedRows.length);
  }

  const meta = persistDraftLists(draft.scope, draft.id, {
    rows,
    notDistressedRows,
    reviewGroups,
    stats
  });

  return {
    draftId: draft.id,
    movedCount: movedRows.length,
    movedRowIds: movedRows.map((r) => r.rowId).filter(Boolean),
    movedRows,
    stats,
    reviewGroups: slimReviewGroups(reviewGroups),
    group,
    meta
  };
}

/**
 * Reverse a train move using stored moved rows (undo).
 */
function restoreDraftMovedRows(draftId, scopeMeta, { action, section, movedRows }) {
  const draft = loadDraftFull(draftId, scopeMeta);
  const list = Array.isArray(movedRows) ? movedRows : [];
  if (!list.length) {
    return {
      draftId: draft.id,
      stats: draft.meta.stats || {},
      reviewGroups: slimReviewGroups(draft.reviewGroups)
    };
  }
  const idSet = new Set(list.map((r) => String(r.rowId || '')).filter(Boolean));
  let rows = draft.rows.slice();
  let notDistressedRows = draft.notDistressedRows.slice();

  if (action === 'deny' && section === 'distressed') {
    // was demoted kept→fn; undo: remove from fn, restore to kept
    notDistressedRows = notDistressedRows.filter((r) => !r || !idSet.has(String(r.rowId)));
    rows = rows.concat(list);
  } else if (action === 'deny' && section === 'not_distressed') {
    // was promoted fn→kept; undo: remove from kept, restore to fn
    rows = rows.filter((r) => !r || !idSet.has(String(r.rowId)));
    notDistressedRows = notDistressedRows.concat(list);
  }

  const reviewGroups = {
    distressed: buildReviewGroups(rows, 'distressed'),
    notDistressed: buildReviewGroups(notDistressedRows, 'not_distressed')
  };
  const stats = {
    ...(draft.meta.stats || {}),
    kept: rows.length,
    notDistressed: notDistressedRows.length
  };
  if (action === 'deny' && section === 'distressed') {
    stats.noDistress = Math.max(0, (Number(stats.noDistress) || 0) - list.length);
  } else if (action === 'deny' && section === 'not_distressed') {
    stats.noDistress = (Number(stats.noDistress) || 0) + list.length;
  }

  persistDraftLists(draft.scope, draft.id, {
    rows,
    notDistressedRows,
    reviewGroups,
    stats
  });

  return {
    draftId: draft.id,
    stats,
    reviewGroups: slimReviewGroups(reviewGroups)
  };
}

function getDraftRowsForSave(draftId, scopeMeta = {}) {
  const draft = loadDraftFull(draftId, scopeMeta);
  return {
    rows: draft.rows,
    stats: draft.meta.stats || {},
    city: draft.meta.city,
    uploadType: draft.meta.uploadType,
    sourceFile: draft.meta.sourceFile,
    processingMeta: draft.meta.processingMeta || {},
    meta: draft.meta
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  saveProcessDraft,
  loadDraftMeta,
  loadDraftFull,
  queryDraftRows,
  applyDraftTrainMove,
  restoreDraftMovedRows,
  getDraftRowsForSave,
  slimReviewGroups,
  sanitizeDraftId
};
