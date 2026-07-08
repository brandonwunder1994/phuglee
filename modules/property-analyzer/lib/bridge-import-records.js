const { recordKeyFromResult } = require('./backup-logic');
const { createImportBatch, stampRecordsWithBatch } = require('./import-batches');

function recordKey(record) {
  return recordKeyFromResult(record);
}

function appendRecordsToSession(session, incomingRecords, batchMeta = {}) {
  const base = session && typeof session === 'object' ? session : {};
  const existingRecords = Array.isArray(base.records) ? base.records : [];
  const existingResults = Array.isArray(base.results) ? base.results : [];
  const existingKeys = new Set();
  const existingBatches = Array.isArray(base.importBatches) ? base.importBatches : [];

  for (const row of [...existingRecords, ...existingResults]) {
    const key = recordKey(row);
    if (key) existingKeys.add(key);
  }

  const toAdd = [];
  let skipped = 0;
  for (const row of incomingRecords || []) {
    const key = recordKey(row);
    if (!key) {
      skipped += 1;
      continue;
    }
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    existingKeys.add(key);
    toAdd.push(row);
  }

  const importedAt = Number(batchMeta.importedAt) || Date.now();
  const batch = createImportBatch({
    city: batchMeta.city,
    state: batchMeta.state,
    sourceFile: batchMeta.sourceFile,
    leadCount: toAdd.length,
    importedAt,
    id: batchMeta.batchId
  });
  const stamped = stampRecordsWithBatch(toAdd, batch.id, importedAt);

  const merged = {
    ...base,
    records: [...existingRecords, ...stamped],
    results: existingResults,
    processed: Number(base.processed) || 0,
    importBatches: [...existingBatches, batch],
    savedAt: importedAt
  };

  return {
    session: merged,
    added: stamped.length,
    skipped,
    totalRecords: merged.records.length,
    batch
  };
}

module.exports = {
  recordKey,
  appendRecordsToSession
};