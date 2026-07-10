const path = require('path');
const { parseSpreadsheet, isSpreadsheetFile } = require('./parsers/spreadsheet');
const { parseTextFile, isTextFile } = require('./parsers/text');
const { parsePdf, isPdfFile } = require('./parsers/pdf');
const { parseDocx, isDocxFile, isLegacyDocFile } = require('./parsers/docx');
const { parseImageOcr, isImageFile } = require('./parsers/image-ocr');
const { normalizeRawRows } = require('./normalizer');
const { dedupeRows, dedupeRowsByAddress } = require('../bridge-dedup');
const { loadImportAddressIndex } = require('../analyzer-import-index');
const { filterAlreadyImported } = require('./import-filter');
const { filterDistressOnly, STRONG_DISTRESSED_TAG } = require('../bridge-distress-tagger');
const { loadBrain } = require('../bridge-brain-store');
const { applyBrainToRows } = require('../bridge-brain-apply');
const {
  assignRowIds,
  buildReviewGroups,
  MAX_FN_REVIEW_ROWS
} = require('../bridge-review-groups');
const {
  DISCARD_REASONS,
  emptyProcessingStats,
  incrementTag,
  incrementConfidence
} = require('../bridge-intake-schema');
const {
  computeFormatFingerprint,
  loadCityFormat,
  saveCityFormat
} = require('../bridge-city-format-store');
const { scoreTypeColumns, pickTypeColumn } = require('../bridge-type-column-score');

function extension(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

function isTabularFile(filename) {
  return isSpreadsheetFile(filename) || isTextFile(filename);
}

function isDocumentFile(filename) {
  return isPdfFile(filename) || isDocxFile(filename) || isLegacyDocFile(filename) || isImageFile(filename);
}

async function parseTabularFile(buffer, filename) {
  if (isSpreadsheetFile(filename)) return parseSpreadsheet(buffer, filename);
  if (isTextFile(filename)) return parseTextFile(buffer, filename);
  throw new Error('Unsupported tabular format');
}

async function parseDocumentFile(buffer, filename) {
  if (isPdfFile(filename)) return parsePdf(buffer, filename);
  if (isDocxFile(filename) || isLegacyDocFile(filename)) return parseDocx(buffer, filename);
  if (isImageFile(filename)) return parseImageOcr(buffer, filename);
  throw new Error('Unsupported document format');
}

function tallyDiscardReasons(stats, discarded) {
  for (const item of discarded) {
    stats.discardReasons[item.reason] = (stats.discardReasons[item.reason] || 0) + 1;
  }
}

function mapDedupDiscards(removed) {
  return removed.map(({ row, duplicateOf }) => ({
    reason: DISCARD_REASONS.duplicate,
    rawPreview: row.streetAddress || '',
    duplicateOf: duplicateOf?.streetAddress || ''
  }));
}

function mapImportDiscards(removed) {
  return removed.map(({ reason, rawPreview }) => ({
    reason,
    rawPreview
  }));
}

function buildStats(kept, discarded, counters = {}) {
  const stats = emptyProcessingStats();
  stats.totalParsed = counters.totalParsed ?? (kept.length + discarded.length);
  stats.kept = kept.length;
  stats.discarded = discarded.length;
  stats.deduplicated = counters.deduplicated ?? 0;
  stats.alreadyImported = counters.alreadyImported ?? 0;
  stats.noDistress = counters.noDistress ?? 0;
  stats.lowConfidence = kept.filter((row) => row.confidenceLevel === 'low').length;
  stats.needsReview = kept.filter((row) => row.needsReview).length;

  tallyDiscardReasons(stats, discarded);
  for (const row of kept) {
    incrementTag(stats, row.distressedSignalTag);
    incrementConfidence(stats, row.confidenceLevel);
  }
  return stats;
}

function mapDistressDiscards(removed) {
  return removed.map(({ reason, rawPreview }) => ({
    reason: reason || 'no_distress_signal',
    rawPreview: rawPreview || ''
  }));
}

function summarizeDiscardBreakdown(discarded = [], counters = {}) {
  const counts = {};
  for (const item of discarded) {
    const reason = String(item?.reason || 'unknown').trim() || 'unknown';
    counts[reason] = (counts[reason] || 0) + 1;
  }
  if (counters.deduplicated > 0) {
    counts[DISCARD_REASONS.duplicate] =
      (counts[DISCARD_REASONS.duplicate] || 0) + counters.deduplicated;
  }
  if (counters.alreadyImported > 0) {
    counts[DISCARD_REASONS.already_imported] =
      (counts[DISCARD_REASONS.already_imported] || 0) + counters.alreadyImported;
  }
  if (counters.noDistress > 0) {
    counts[DISCARD_REASONS.no_distress_signal] =
      (counts[DISCARD_REASONS.no_distress_signal] || 0) + counters.noDistress;
  }
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${n} ${reason}`)
    .join(', ');
}

function noUsableRowsMessage({
  normalizedDiscarded,
  deduplicated,
  alreadyImported,
  noDistress,
  discarded
}) {
  const onlyImported = alreadyImported > 0 && !normalizedDiscarded && !deduplicated && !noDistress;
  if (onlyImported) {
    return 'Every record in this file is already in your Analyze session. Purge that city from Analyze to re-process it in Filter (saving a Filter list is not required).';
  }
  const onlyNoDistress = noDistress > 0 && !normalizedDiscarded && !deduplicated && !alreadyImported;
  if (onlyNoDistress) {
    return 'No distressed leads found — every code violation was generic (permits, parking, admin, etc.). Only weeds, trash, blight, junk vehicles, and similar distress signals are kept.';
  }
  const breakdown = summarizeDiscardBreakdown(discarded, {
    deduplicated,
    alreadyImported,
    noDistress
  });
  const previews = (discarded || [])
    .map((d) => String(d?.rawPreview || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const previewNote = previews.length
    ? ` Samples: ${previews.map((p) => `"${p.slice(0, 80)}"`).join('; ')}.`
    : '';
  if (breakdown) {
    return `No usable records found. Breakdown: ${breakdown}.${previewNote}`;
  }
  return `No usable records found — every row was missing a valid street address, not a distress signal, or duplicated.${previewNote}`;
}

/** Resolve admin confirm field: null / '' / '__none__' → no Type column. */
function resolveConfirmedHeader(value) {
  if (value === null || value === '' || value === '__none__') return null;
  return String(value);
}

function mapCandidates(ranked, limit = 8) {
  return (ranked || []).slice(0, limit).map((c) => ({
    header: c.header,
    score: typeof c.score === 'number' ? c.score : null,
    samples: Array.isArray(c.samples) ? c.samples : [],
    reasons: Array.isArray(c.reasons) ? c.reasons : []
  }));
}

/**
 * META-01 typeResolution shape for successful process.
 */
function buildTypeResolution({ header, ranked, source, fingerprint, formatMatched }) {
  let score = null;
  if (header != null && Array.isArray(ranked)) {
    const hit = ranked.find((r) => r.header === header);
    if (hit && typeof hit.score === 'number') score = hit.score;
  }
  let runnerUp = null;
  if (Array.isArray(ranked) && ranked.length >= 2) {
    const second = ranked[1];
    if (second && second.header != null) {
      runnerUp = {
        header: second.header,
        score: typeof second.score === 'number' ? second.score : null
      };
    }
  }
  return {
    header: header === undefined ? null : header,
    score,
    runnerUp,
    source,
    fingerprint: fingerprint || '',
    formatMatched: Boolean(formatMatched)
  };
}

/**
 * Score + fingerprint + city-format gate for code_violation (before normalize).
 * water_shut_off skips — returns scorer-only meta without override.
 * @returns {{ typeColumnOverride?: string|null, typeResolution: object, ranked: array }}
 */
function resolveTypeColumnGate({
  headers,
  rows,
  city,
  uploadType,
  sourceFile,
  username,
  confirmedTypeHeader,
  formatFingerprint,
  hasConfirm
}) {
  const sampleRows = (rows || []).slice(0, 80);
  const ranked = scoreTypeColumns(headers, sampleRows);
  const fingerprint = computeFormatFingerprint(headers);
  const picked = pickTypeColumn(ranked);

  // Non-code_violation (water, etc.): skip gate; live scorer in normalizer
  if (uploadType !== 'code_violation') {
    const header = picked ? picked.header : null;
    return {
      // omit typeColumnOverride → normalizer uses scorer
      typeResolution: buildTypeResolution({
        header,
        ranked,
        source: header != null ? 'scorer' : 'unresolved',
        fingerprint,
        formatMatched: false
      }),
      ranked
    };
  }

  // Stale client fingerprint echo → force re-confirm
  const clientFpMismatch =
    formatFingerprint != null &&
    formatFingerprint !== '' &&
    String(formatFingerprint) !== fingerprint;

  const cityId = city && city.id;
  // Multi-format memory: match this file's fingerprint only (not another sheet's map)
  const memory = cityId ? loadCityFormat(cityId, uploadType, fingerprint) : null;
  const memoryMatch = Boolean(memory) && !clientFpMismatch;

  const needConfirm = !memoryMatch;

  if (needConfirm && !hasConfirm) {
    const err = new Error(
      'Confirm Violation Type column for this city format before processing'
    );
    err.code = 'TYPE_COLUMN_CONFIRM_REQUIRED';
    err.statusCode = 409;
    err.details = {
      city,
      uploadType,
      sourceFile,
      formatFingerprint: fingerprint,
      candidates: mapCandidates(ranked),
      suggestedHeader: picked ? picked.header : null,
      lastConfirmed: memory
        ? { fingerprint: memory.fingerprint, typeHeader: memory.typeHeader }
        : null,
      adminRequiredToPersist: true
    };
    throw err;
  }

  if (hasConfirm && username !== 'admin') {
    const err = new Error('Admin required to confirm Type column mapping');
    err.code = 'ADMIN_REQUIRED';
    err.statusCode = 403;
    throw err;
  }

  let typeHeader;
  let source;
  let formatMatched = false;

  if (hasConfirm) {
    typeHeader = resolveConfirmedHeader(confirmedTypeHeader);
    source = 'admin_confirm';
    formatMatched = false;
  } else if (memoryMatch) {
    // memory.typeHeader may be null (confirmed no-type)
    typeHeader = Object.prototype.hasOwnProperty.call(memory, 'typeHeader')
      ? memory.typeHeader
      : null;
    source = 'auto_reuse';
    formatMatched = true;
  } else {
    // Should be rare for code_violation after gate
    typeHeader = picked ? picked.header : null;
    source = typeHeader != null ? 'scorer' : 'unresolved';
  }

  if (hasConfirm && username === 'admin' && cityId) {
    saveCityFormat({
      cityId,
      uploadType,
      fingerprint,
      typeHeader,
      confirmedBy: username,
      sourceFileLast: sourceFile,
      headerSnapshot: headers
    });
  }

  return {
    typeColumnOverride: typeHeader, // always set for CV confirm/reuse (incl. null)
    typeResolution: buildTypeResolution({
      header: typeHeader,
      ranked,
      source,
      fingerprint,
      formatMatched
    }),
    ranked
  };
}

async function processUpload(opts = {}) {
  const {
    buffer,
    filename,
    city,
    uploadType,
    username = '',
    plan = '',
    confirmedTypeHeader,
    formatFingerprint
  } = opts;
  // hasOwnProperty so explicit null/''/'__none__' means "No type column", absent means need confirm
  const hasConfirmField = Object.prototype.hasOwnProperty.call(opts, 'confirmedTypeHeader');

  const started = Date.now();
  const sourceFile = path.basename(String(filename || 'upload'));
  const ext = extension(sourceFile);

  if (!isTabularFile(sourceFile) && !isDocumentFile(sourceFile)) {
    const err = new Error('Unsupported file type for processing');
    err.code = 'UNSUPPORTED_FILE';
    throw err;
  }

  const processedAt = new Date().toISOString();
  const parsed = isTabularFile(sourceFile)
    ? await parseTabularFile(buffer, sourceFile)
    : await parseDocumentFile(buffer, sourceFile);

  // GATE: parse → score → fingerprint → confirm/reuse — before normalize/tag/brain
  const gate = resolveTypeColumnGate({
    headers: parsed.headers,
    rows: parsed.rows,
    city,
    uploadType,
    sourceFile,
    username,
    confirmedTypeHeader,
    formatFingerprint,
    hasConfirm: hasConfirmField
  });

  const normalizeContext = {
    city,
    uploadType,
    sourceFile,
    processedAt
  };
  if (Object.prototype.hasOwnProperty.call(gate, 'typeColumnOverride')) {
    normalizeContext.typeColumnOverride = gate.typeColumnOverride;
  }

  const normalized = normalizeRawRows(parsed.rows, parsed.headers, normalizeContext);

  const deduped = dedupeRows(normalized.kept);
  // IND-04: already_imported hard-drop is opt-in only (strict === true).
  // Default keeps full kept lists for re-work / purge / re-filter under the
  // external-enrich → manual Analyze import product boundary.
  const applyAlreadyImportedFilter = opts.applyAlreadyImportedFilter === true;
  let importIndex = { count: 0, addresses: new Set(), sources: null, loadedAt: Date.now() };
  let importFiltered = { rows: deduped.rows, removedCount: 0, removed: [] };
  if (applyAlreadyImportedFilter) {
    // Refresh so Analyze purges (e.g. re-import a city) take effect immediately.
    importIndex = await loadImportAddressIndex({ username, plan, force: true });
    importFiltered = filterAlreadyImported(deduped.rows, importIndex.addresses);
  }
  // Apply global Filter brain (active type/phrase rules) before distress filter
  const brain = loadBrain();
  const brainApplied = applyBrainToRows(importFiltered.rows, brain, { uploadType });
  // Code violations: keep only Strong Distressed Signal (weeds, trash, blight, junk vehicles, etc.)
  const distressFiltered = filterDistressOnly(brainApplied.rows, uploadType);

  const kept = assignRowIds(distressFiltered.rows);
  const fnAll = assignRowIds(
    distressFiltered.removed.map((item) => item.row).filter(Boolean)
  );

  const notDistressedTotal = fnAll.length;
  const notDistressedTruncated = notDistressedTotal > MAX_FN_REVIEW_ROWS;
  const notDistressedRows = notDistressedTruncated
    ? fnAll.slice(0, MAX_FN_REVIEW_ROWS)
    : fnAll;

  const reviewGroups = {
    distressed: buildReviewGroups(kept, 'distressed'),
    notDistressed: buildReviewGroups(notDistressedRows, 'not_distressed')
  };

  const dedupDiscards = mapDedupDiscards(deduped.removed);
  const importDiscards = mapImportDiscards(importFiltered.removed);
  // Non-review discards only — FN full rows live in notDistressedRows (not thin discarded)
  const nonReviewDiscarded = [
    ...normalized.discarded,
    ...dedupDiscards,
    ...importDiscards
  ];

  // Zero-kept policy: all-FN code_violation is reviewable; pure empty still NO_USABLE_ROWS
  if (!kept.length && !fnAll.length) {
    const err = new Error(noUsableRowsMessage({
      normalizedDiscarded: normalized.discarded.length,
      deduplicated: deduped.removedCount,
      alreadyImported: importFiltered.removedCount,
      noDistress: notDistressedTotal,
      discarded: nonReviewDiscarded
    }));
    err.code = 'NO_USABLE_ROWS';
    err.details = {
      discarded: nonReviewDiscarded,
      stats: buildStats([], nonReviewDiscarded, {
        totalParsed: normalized.kept.length + normalized.discarded.length,
        deduplicated: deduped.removedCount,
        alreadyImported: importFiltered.removedCount,
        noDistress: notDistressedTotal
      })
    };
    throw err;
  }

  // Water (and non-code_violation): empty kept with empty FN still thrown above;
  // empty kept with FN only allowed for code_violation review path.
  if (!kept.length && uploadType !== 'code_violation') {
    const err = new Error(noUsableRowsMessage({
      normalizedDiscarded: normalized.discarded.length,
      deduplicated: deduped.removedCount,
      alreadyImported: importFiltered.removedCount,
      noDistress: notDistressedTotal,
      discarded: nonReviewDiscarded
    }));
    err.code = 'NO_USABLE_ROWS';
    err.details = {
      discarded: nonReviewDiscarded,
      stats: buildStats([], nonReviewDiscarded, {
        totalParsed: normalized.kept.length + normalized.discarded.length,
        deduplicated: deduped.removedCount,
        alreadyImported: importFiltered.removedCount,
        noDistress: notDistressedTotal
      })
    };
    throw err;
  }

  const stats = buildStats(kept, nonReviewDiscarded, {
    totalParsed: normalized.kept.length + normalized.discarded.length,
    deduplicated: deduped.removedCount,
    alreadyImported: importFiltered.removedCount,
    noDistress: notDistressedTotal
  });
  // KPI continuity for bridge.js "Discarded (other)" math
  stats.discarded = nonReviewDiscarded.length + notDistressedTotal;
  stats.noDistress = notDistressedTotal;
  if (notDistressedTotal > 0) {
    stats.discardReasons.no_distress_signal =
      (stats.discardReasons.no_distress_signal || 0) + notDistressedTotal;
  }

  const brainMeta = {
    notDistressedTruncated,
    notDistressedTotal,
    notDistressedReturned: notDistressedRows.length
  };

  return {
    ok: true,
    stub: false,
    city,
    uploadType,
    sourceFile,
    processedAt,
    stats,
    rows: kept,
    notDistressedRows,
    reviewGroups,
    discarded: nonReviewDiscarded,
    brainMeta,
    processingMeta: {
      parser: parsed.parser,
      parseMode: parsed.parseMode || null,
      sheetName: parsed.sheetName || null,
      delimiter: parsed.delimiter || null,
      pageCount: parsed.pageCount || null,
      ocrConfidence: parsed.ocrConfidence || null,
      columnMap: normalized.columnMap,
      typeResolution: (() => {
        // Keep typeResolution.header in sync with forced columnMap (override path)
        const tr = gate.typeResolution || {};
        const mapHeader = normalized.columnMap
          ? normalized.columnMap.violationIssueType
          : undefined;
        // Prefer map when gate omitted override (water/scorer) — map is source of truth
        const header =
          mapHeader !== undefined ? mapHeader : (tr.header !== undefined ? tr.header : null);
        return {
          ...tr,
          header: header === undefined ? null : header,
          // Re-derive score from ranked if header known
          score: (() => {
            if (header == null || !Array.isArray(gate.ranked)) return tr.score ?? null;
            const hit = gate.ranked.find((r) => r.header === header);
            return hit && typeof hit.score === 'number' ? hit.score : (tr.score ?? null);
          })()
        };
      })(),
      importIndexCount: importIndex.count,
      importIndexSources: importIndex.sources,
      brainVersion: brain.version ?? 1,
      brainAppliedRuleIds: brainApplied.appliedRuleIds || [],
      durationMs: Date.now() - started
    }
  };
}

const MAX_BATCH_FILES = 5;

function stripRowIds(rows) {
  return (rows || []).map((row) => {
    if (!row || typeof row !== 'object') return row;
    const { rowId, ...rest } = row;
    return rest;
  });
}

/**
 * Merge multiple processUpload results (same city/type) into one payload.
 * Cross-file address-only dedupe on kept / FN rows (same property in two
 * city exports counts once even when violation text differs); rebuild review groups.
 */
function mergeProcessResults(results, { city, uploadType } = {}) {
  const list = (results || []).filter(Boolean);
  if (!list.length) {
    const err = new Error('No successful file results to merge');
    err.code = 'NO_USABLE_ROWS';
    err.details = { discarded: [], stats: emptyProcessingStats() };
    throw err;
  }
  if (list.length === 1) {
    const only = list[0];
    return {
      ...only,
      sourceFiles: [only.sourceFile],
      fileCount: 1
    };
  }

  const processedAt = new Date().toISOString();
  const sourceFiles = list.map((r) => r.sourceFile).filter(Boolean);
  const allKept = [];
  const allFn = [];
  const allDiscarded = [];
  let totalParsed = 0;
  let deduplicated = 0;
  let alreadyImported = 0;
  let durationMs = 0;
  let brainVersion = 1;
  let importIndexCount = 0;
  let importIndexSources = null;
  const fileMetas = [];
  const appliedRuleIds = new Set();

  for (const r of list) {
    allKept.push(...stripRowIds(r.rows || []));
    allFn.push(...stripRowIds(r.notDistressedRows || []));
    allDiscarded.push(...(r.discarded || []));
    totalParsed += Number(r.stats?.totalParsed) || 0;
    deduplicated += Number(r.stats?.deduplicated) || 0;
    alreadyImported += Number(r.stats?.alreadyImported) || 0;
    durationMs += Number(r.processingMeta?.durationMs) || 0;
    if (r.processingMeta?.brainVersion != null) {
      brainVersion = Number(r.processingMeta.brainVersion);
    }
    if (r.processingMeta?.importIndexCount != null) {
      importIndexCount = Number(r.processingMeta.importIndexCount);
    }
    if (r.processingMeta?.importIndexSources) {
      importIndexSources = r.processingMeta.importIndexSources;
    }
    for (const id of r.processingMeta?.brainAppliedRuleIds || []) {
      if (id) appliedRuleIds.add(id);
    }
    fileMetas.push({
      sourceFile: r.sourceFile,
      parser: r.processingMeta?.parser || null,
      kept: Array.isArray(r.rows) ? r.rows.length : 0,
      notDistressed: Array.isArray(r.notDistressedRows) ? r.notDistressedRows.length : 0,
      durationMs: r.processingMeta?.durationMs || null,
      fingerprint: r.processingMeta?.typeResolution?.fingerprint || null,
      typeHeader: r.processingMeta?.typeResolution?.header ?? null,
      typeResolutionSource: r.processingMeta?.typeResolution?.source || null
    });
  }

  // Address-only: multi-file batches often restate the same parcel with
  // different violation wording. Issue-aware dedupe (single-file) would
  // double-count those as separate leads (e.g. 14 properties → 28 kept).
  const deduped = dedupeRowsByAddress(allKept);
  const kept = assignRowIds(deduped.rows);
  const crossFileDupes = mapDedupDiscards(deduped.removed);
  deduplicated += deduped.removedCount;

  const fnDeduped = dedupeRowsByAddress(allFn);
  const fnAll = assignRowIds(fnDeduped.rows);
  deduplicated += fnDeduped.removedCount;

  const notDistressedTotal = fnAll.length;
  const notDistressedTruncated = notDistressedTotal > MAX_FN_REVIEW_ROWS;
  const notDistressedRows = notDistressedTruncated
    ? fnAll.slice(0, MAX_FN_REVIEW_ROWS)
    : fnAll;

  const reviewGroups = {
    distressed: buildReviewGroups(kept, 'distressed'),
    notDistressed: buildReviewGroups(notDistressedRows, 'not_distressed')
  };

  const nonReviewDiscarded = [...allDiscarded, ...crossFileDupes];
  const stats = buildStats(kept, nonReviewDiscarded, {
    totalParsed,
    deduplicated,
    alreadyImported,
    noDistress: notDistressedTotal
  });
  stats.discarded = nonReviewDiscarded.length + notDistressedTotal;
  stats.noDistress = notDistressedTotal;
  if (notDistressedTotal > 0) {
    stats.discardReasons.no_distress_signal =
      (stats.discardReasons.no_distress_signal || 0) + notDistressedTotal;
  }

  const cityOut = city || list[0].city;
  const typeOut = uploadType || list[0].uploadType;

  return {
    ok: true,
    stub: false,
    city: cityOut,
    uploadType: typeOut,
    sourceFile: sourceFiles.join(' · '),
    sourceFiles,
    fileCount: sourceFiles.length,
    processedAt,
    stats,
    rows: kept,
    notDistressedRows,
    reviewGroups,
    discarded: nonReviewDiscarded,
    brainMeta: {
      notDistressedTruncated,
      notDistressedTotal,
      notDistressedReturned: notDistressedRows.length
    },
    processingMeta: {
      multiFile: true,
      fileCount: sourceFiles.length,
      files: fileMetas,
      parser: 'multi',
      // Shared Type map / resolution from first file (same-fp batches share one map)
      columnMap: list[0].processingMeta?.columnMap || null,
      typeResolution: list[0].processingMeta?.typeResolution || null,
      importIndexCount,
      importIndexSources,
      brainVersion,
      brainAppliedRuleIds: [...appliedRuleIds],
      durationMs
    }
  };
}

/**
 * Build fingerprint → confirmed Type header and filename → header from batch context.
 * Supports multi-format confirmedFormats[] (optional filenames[]) and legacy single fields.
 * Filename map survives PDF re-parse fingerprint drift between pre-scan and process.
 * @returns {{ byFingerprint: Map<string, string|null>, byFilename: Map<string, string|null> }}
 */
function buildConfirmMaps(context) {
  const byFingerprint = new Map();
  const byFilename = new Map();
  if (!context || typeof context !== 'object') {
    return { byFingerprint, byFilename };
  }

  const list = context.confirmedFormats;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      if (!Object.prototype.hasOwnProperty.call(item, 'confirmedTypeHeader')) continue;
      const header = resolveConfirmedHeader(item.confirmedTypeHeader);
      if (item.formatFingerprint != null && item.formatFingerprint !== '') {
        byFingerprint.set(String(item.formatFingerprint), header);
      }
      const names = Array.isArray(item.filenames)
        ? item.filenames
        : item.filename
          ? [item.filename]
          : [];
      for (const name of names) {
        if (name) byFilename.set(String(name), header);
      }
    }
  }

  // Legacy single-format resume (one fingerprint + one header)
  if (Object.prototype.hasOwnProperty.call(context, 'confirmedTypeHeader')) {
    const header = resolveConfirmedHeader(context.confirmedTypeHeader);
    if (context.formatFingerprint) {
      byFingerprint.set(String(context.formatFingerprint), header);
    } else {
      // No fingerprint: apply to every sheet (legacy same-header batch confirm)
      byFingerprint.set('*', header);
    }
  }
  return { byFingerprint, byFilename };
}

/** @deprecated use buildConfirmMaps — kept for tests that expect a Map */
function buildConfirmMap(context) {
  return buildConfirmMaps(context).byFingerprint;
}

/**
 * Resolve Type confirm for one file: filename first, then fingerprint, then *.
 */
function resolveFileConfirm(filename, fingerprint, byFingerprint, byFilename) {
  const base = path.basename(String(filename || ''));
  if (base && byFilename && byFilename.has(base)) {
    return { header: byFilename.get(base), matchedBy: 'filename' };
  }
  if (filename && byFilename && byFilename.has(String(filename))) {
    return { header: byFilename.get(String(filename)), matchedBy: 'filename' };
  }
  if (fingerprint && byFingerprint && byFingerprint.has(fingerprint)) {
    return { header: byFingerprint.get(fingerprint), matchedBy: 'fingerprint' };
  }
  if (byFingerprint && byFingerprint.has('*')) {
    return { header: byFingerprint.get('*'), matchedBy: 'wildcard' };
  }
  return null;
}

/**
 * Pre-parse batch files for fingerprints / Type candidates.
 * @returns {Promise<Array<object>>}
 */
async function scanBatchFileInfos(entries, context) {
  const city = context && context.city;
  const uploadType = context && context.uploadType;
  const fileInfos = [];

  for (const file of entries) {
    const sourceFile = path.basename(String(file.filename || 'upload'));
    if (!isTabularFile(sourceFile) && !isDocumentFile(sourceFile)) {
      const err = new Error('Unsupported file type for processing');
      err.code = 'UNSUPPORTED_FILE';
      err.failedFile = file.filename;
      throw err;
    }
    const parsed = isTabularFile(sourceFile)
      ? await parseTabularFile(file.data, sourceFile)
      : await parseDocumentFile(file.data, sourceFile);
    const headers = parsed.headers || [];
    const ranked = scoreTypeColumns(headers, (parsed.rows || []).slice(0, 80));
    const fingerprint = computeFormatFingerprint(headers);
    const memory =
      city && city.id ? loadCityFormat(city.id, uploadType, fingerprint) : null;
    const needsConfirm = !memory;
    const picked = pickTypeColumn(ranked);
    fileInfos.push({
      filename: file.filename,
      formatFingerprint: fingerprint,
      candidates: mapCandidates(ranked),
      suggestedHeader: picked ? picked.header : null,
      needsConfirm,
      headers
    });
  }
  return fileInfos;
}

/**
 * Group file infos by fingerprint into format descriptors for the confirm UI.
 */
function groupFormatsForConfirm(fileInfos) {
  const byFp = new Map();
  for (const f of fileInfos) {
    if (!byFp.has(f.formatFingerprint)) {
      byFp.set(f.formatFingerprint, {
        formatFingerprint: f.formatFingerprint,
        candidates: f.candidates,
        suggestedHeader: f.suggestedHeader,
        files: [],
        filenames: [],
        needsConfirm: f.needsConfirm
      });
    }
    const g = byFp.get(f.formatFingerprint);
    g.files.push(f);
    g.filenames.push(f.filename);
    // needsConfirm if any file of this fp needs it
    if (f.needsConfirm) g.needsConfirm = true;
  }
  return [...byFp.values()];
}

/**
 * Pre-scan code_violation batch fingerprints before any full process.
 * Mixed fingerprints no longer hard-fail — client confirms each distinct format
 * (formats[]), then resume with confirmedFormats. Never partial Train merge.
 */
async function preScanBatchTypeGate(entries, context) {
  if (!context || context.uploadType !== 'code_violation') return null;
  if (!entries || !entries.length) return null;

  const city = context.city;
  const uploadType = context.uploadType;
  const fileInfos = await scanBatchFileInfos(entries, context);
  const { byFingerprint, byFilename } = buildConfirmMaps(context);
  const fingerprints = [...new Set(fileInfos.map((f) => f.formatFingerprint))];
  const allSameFp = fingerprints.length === 1;

  // Resolve needConfirm against filename map, fingerprint map, or legacy *
  for (const f of fileInfos) {
    const resolved = resolveFileConfirm(
      f.filename,
      f.formatFingerprint,
      byFingerprint,
      byFilename
    );
    if (resolved) f.needsConfirm = false;
  }

  const formats = groupFormatsForConfirm(fileInfos);
  const needing = formats.filter((g) => g.needsConfirm);

  if (needing.length) {
    const err = new Error(
      needing.length > 1
        ? `Confirm Type column for ${needing.length} different sheet formats before processing`
        : 'Confirm Violation Type column for this city format before processing'
    );
    err.code = 'TYPE_COLUMN_CONFIRM_REQUIRED';
    err.statusCode = 409;
    // Primary format (first needing) kept at top-level for single-format clients
    const first = needing[0];
    err.details = {
      city,
      uploadType,
      multiFormat: needing.length > 1 || fingerprints.length > 1 || fileInfos.length > 1,
      formatCount: needing.length,
      formatFingerprint: first.formatFingerprint,
      candidates: first.candidates,
      suggestedHeader: first.suggestedHeader,
      // Sheet names for the current step (UI: "confirm this file…")
      filenames: first.filenames,
      files: fileInfos,
      formats: needing.map((g) => ({
        formatFingerprint: g.formatFingerprint,
        candidates: g.candidates,
        suggestedHeader: g.suggestedHeader,
        filenames: g.filenames,
        fileCount: g.filenames.length
      })),
      formatFingerprints: fingerprints,
      adminRequiredToPersist: true
    };
    throw err;
  }

  return {
    fileInfos,
    formats,
    confirmMap: byFingerprint,
    byFingerprint,
    byFilename,
    fingerprints,
    allSameFp
  };
}

/**
 * Process 1–MAX_BATCH_FILES uploads and merge into one result set.
 * Per-file NO_USABLE_ROWS is skipped if another file has usable rows.
 * TYPE_COLUMN_CONFIRM_REQUIRED / ADMIN_REQUIRED / INVALID_TYPE_COLUMN hard-fail.
 * Mixed header formats are OK — each fingerprint gets its own Type confirm.
 */
async function processUploadBatch(fileEntries, context) {
  const entries = (fileEntries || []).filter((f) => f && f.filename);
  if (!entries.length) {
    const err = new Error('file is required');
    err.code = 'MISSING_FILE';
    throw err;
  }
  if (entries.length > MAX_BATCH_FILES) {
    const err = new Error(`Up to ${MAX_BATCH_FILES} files per batch`);
    err.code = 'TOO_MANY_FILES';
    throw err;
  }

  const ctx = context || {};
  // GATE-06: pre-scan need-confirm per format (mixed headers → multi-format confirm, not hard fail)
  const scan = await preScanBatchTypeGate(entries, ctx);
  const fileInfos = (scan && scan.fileInfos) || (await scanBatchFileInfos(entries, ctx));
  const maps = scan
    ? {
        byFingerprint: scan.byFingerprint || scan.confirmMap || buildConfirmMaps(ctx).byFingerprint,
        byFilename: scan.byFilename || buildConfirmMaps(ctx).byFilename
      }
    : buildConfirmMaps(ctx);
  const fingerprints =
    (scan && scan.fingerprints) ||
    [...new Set(fileInfos.map((f) => f.formatFingerprint))];
  const infoByName = new Map(fileInfos.map((f) => [f.filename, f]));

  const successes = [];
  const failures = [];

  for (const file of entries) {
    try {
      const info = infoByName.get(file.filename);
      const fp = info && info.formatFingerprint;
      const uploadArgs = {
        buffer: file.data,
        filename: file.filename,
        city: ctx.city,
        uploadType: ctx.uploadType,
        username: ctx.username || '',
        plan: ctx.plan || ''
      };

      // Filename-first confirm so PDF re-parse fingerprint drift cannot drop the mapping
      const resolved = resolveFileConfirm(
        file.filename,
        fp,
        maps.byFingerprint,
        maps.byFilename
      );
      if (resolved) {
        uploadArgs.confirmedTypeHeader = resolved.header;
        if (fp) uploadArgs.formatFingerprint = fp;
      }

      const payload = await processUpload(uploadArgs);
      successes.push(payload);
    } catch (err) {
      if (err && err.code === 'NO_USABLE_ROWS') {
        failures.push({
          filename: file.filename,
          code: err.code,
          message: err.message,
          details: err.details
        });
        continue;
      }
      // Hard errors (confirm, unsupported, parse fail, OCR, etc.)
      err.failedFile = file.filename;
      throw err;
    }
  }

  if (!successes.length) {
    const first = failures[0] || {};
    const err = new Error(
      failures.length > 1
        ? `No usable records across ${failures.length} files.`
        : (first.message || 'No usable records found.')
    );
    err.code = 'NO_USABLE_ROWS';
    err.details = {
      discarded: failures.flatMap((f) => f.details?.discarded || []),
      stats: first.details?.stats || emptyProcessingStats(),
      fileFailures: failures
    };
    throw err;
  }

  const merged = mergeProcessResults(successes, {
    city: ctx.city,
    uploadType: ctx.uploadType
  });
  if (failures.length) {
    merged.processingMeta = merged.processingMeta || {};
    merged.processingMeta.fileFailures = failures.map((f) => ({
      filename: f.filename,
      code: f.code,
      message: f.message
    }));
  }
  if (fingerprints.length > 1) {
    merged.processingMeta = merged.processingMeta || {};
    merged.processingMeta.multiFormat = true;
    merged.processingMeta.formatCount = fingerprints.length;
  }
  return merged;
}

module.exports = {
  isTabularFile,
  isDocumentFile,
  parseTabularFile,
  parseDocumentFile,
  processUpload,
  processUploadBatch,
  mergeProcessResults,
  MAX_BATCH_FILES,
  buildStats,
  mapDedupDiscards,
  mapImportDiscards,
  mapDistressDiscards,
  noUsableRowsMessage,
  STRONG_DISTRESSED_TAG
};