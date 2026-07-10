const path = require('path');
const { parseSpreadsheet, isSpreadsheetFile } = require('./parsers/spreadsheet');
const { parseTextFile, isTextFile } = require('./parsers/text');
const { parsePdf, isPdfFile } = require('./parsers/pdf');
const { parseDocx, isDocxFile, isLegacyDocFile } = require('./parsers/docx');
const { parseImageOcr, isImageFile } = require('./parsers/image-ocr');
const { normalizeRawRows } = require('./normalizer');
const { dedupeRows } = require('../bridge-dedup');
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

function noUsableRowsMessage({ normalizedDiscarded, deduplicated, alreadyImported, noDistress }) {
  const onlyImported = alreadyImported > 0 && !normalizedDiscarded && !deduplicated && !noDistress;
  if (onlyImported) {
    return 'Every record in this file is already in your Analyze session.';
  }
  const onlyNoDistress = noDistress > 0 && !normalizedDiscarded && !deduplicated && !alreadyImported;
  if (onlyNoDistress) {
    return 'No distressed leads found — every code violation was generic (permits, parking, admin, etc.). Only weeds, trash, blight, junk vehicles, and similar distress signals are kept.';
  }
  return 'No usable records found — every row was missing a valid street address, not a distress signal, duplicated, or already imported.';
}

async function processUpload({ buffer, filename, city, uploadType, username = '', plan = '' }) {
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

  const normalized = normalizeRawRows(parsed.rows, parsed.headers, {
    city,
    uploadType,
    sourceFile,
    processedAt
  });

  const deduped = dedupeRows(normalized.kept);
  // Always refresh so Analyze purges (e.g. re-import a city) take effect immediately.
  const importIndex = await loadImportAddressIndex({ username, plan, force: true });
  const importFiltered = filterAlreadyImported(deduped.rows, importIndex.addresses);
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
      noDistress: notDistressedTotal
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
      noDistress: notDistressedTotal
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
 * Cross-file address dedupe on kept rows; rebuild review groups.
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
      durationMs: r.processingMeta?.durationMs || null
    });
  }

  const deduped = dedupeRows(allKept);
  const kept = assignRowIds(deduped.rows);
  const crossFileDupes = mapDedupDiscards(deduped.removed);
  deduplicated += deduped.removedCount;

  const fnDeduped = dedupeRows(allFn);
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
      importIndexCount,
      importIndexSources,
      brainVersion,
      brainAppliedRuleIds: [...appliedRuleIds],
      durationMs
    }
  };
}

/**
 * Process 1–MAX_BATCH_FILES uploads and merge into one result set.
 * Per-file NO_USABLE_ROWS is skipped if another file has usable rows.
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

  const successes = [];
  const failures = [];

  for (const file of entries) {
    try {
      const payload = await processUpload({
        buffer: file.data,
        filename: file.filename,
        city: context.city,
        uploadType: context.uploadType,
        username: context.username || '',
        plan: context.plan || ''
      });
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
      // Hard errors (unsupported, parse fail, OCR, etc.) fail the whole batch
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
    city: context.city,
    uploadType: context.uploadType
  });
  if (failures.length) {
    merged.processingMeta = merged.processingMeta || {};
    merged.processingMeta.fileFailures = failures.map((f) => ({
      filename: f.filename,
      code: f.code,
      message: f.message
    }));
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