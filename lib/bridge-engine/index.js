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

  const dedupDiscards = mapDedupDiscards(deduped.removed);
  const importDiscards = mapImportDiscards(importFiltered.removed);
  const distressDiscards = mapDistressDiscards(distressFiltered.removed);
  const allDiscarded = [
    ...normalized.discarded,
    ...dedupDiscards,
    ...importDiscards,
    ...distressDiscards
  ];
  const finalKept = distressFiltered.rows;

  if (!finalKept.length) {
    const err = new Error(noUsableRowsMessage({
      normalizedDiscarded: normalized.discarded.length,
      deduplicated: deduped.removedCount,
      alreadyImported: importFiltered.removedCount,
      noDistress: distressFiltered.removedCount
    }));
    err.code = 'NO_USABLE_ROWS';
    err.details = {
      discarded: allDiscarded,
      stats: buildStats([], allDiscarded, {
        totalParsed: normalized.kept.length + normalized.discarded.length,
        deduplicated: deduped.removedCount,
        alreadyImported: importFiltered.removedCount,
        noDistress: distressFiltered.removedCount
      })
    };
    throw err;
  }

  const stats = buildStats(finalKept, allDiscarded, {
    totalParsed: normalized.kept.length + normalized.discarded.length,
    deduplicated: deduped.removedCount,
    alreadyImported: importFiltered.removedCount,
    noDistress: distressFiltered.removedCount
  });

  return {
    ok: true,
    stub: false,
    city,
    uploadType,
    sourceFile,
    processedAt,
    stats,
    rows: finalKept,
    discarded: allDiscarded,
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

module.exports = {
  isTabularFile,
  isDocumentFile,
  parseTabularFile,
  parseDocumentFile,
  processUpload,
  buildStats,
  mapDedupDiscards,
  mapImportDiscards,
  mapDistressDiscards,
  noUsableRowsMessage,
  STRONG_DISTRESSED_TAG
};