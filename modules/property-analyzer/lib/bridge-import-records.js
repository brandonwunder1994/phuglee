const { recordKeyFromResult } = require('./backup-logic');

function recordKey(record) {
  return recordKeyFromResult(record);
}

function appendRecordsToSession(session, incomingRecords) {
  const base = session && typeof session === 'object' ? session : {};
  const existingRecords = Array.isArray(base.records) ? base.records : [];
  const existingResults = Array.isArray(base.results) ? base.results : [];
  const existingKeys = new Set();

  for (const row of [...existingRecords, ...existingResults]) {
    const key = recordKey(row);
    if (key) existingKeys.add(key);
  }

  const added = [];
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
    added.push(row);
  }

  const merged = {
    ...base,
    records: [...existingRecords, ...added],
    results: existingResults,
    processed: Number(base.processed) || 0,
    savedAt: Date.now()
  };

  return {
    session: merged,
    added: added.length,
    skipped,
    totalRecords: merged.records.length
  };
}

module.exports = {
  recordKey,
  appendRecordsToSession
};