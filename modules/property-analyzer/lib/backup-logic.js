function recordKeyFromResult(r) {
  if (!r) return '';
  return `${r.email || ''}|${r.phone || ''}|${r.address || ''}`;
}

function isManuallyEditedResult(r) {
  return !!(r && (
    r.manualScore || r.manualOverride || r.tierLocked
    || r.reviewResolved || r.manuallyReviewed
    || r.manuallyReviewedVia
  ));
}

function resultEditTimestamp(r) {
  if (!r) return 0;
  return Number(r.manualEditedAt) || Number(r.analyzedAt) || 0;
}

/** Prefer session records the user edited over stale incremental scan snapshots. */
function shouldReplaceSessionResult(prev, incoming) {
  if (!incoming) return false;
  if (!prev) return true;
  const prevManual = isManuallyEditedResult(prev);
  const incManual = isManuallyEditedResult(incoming);
  if (prevManual && !incManual) return false;
  if (!prevManual && incManual) return true;
  return resultEditTimestamp(incoming) >= resultEditTimestamp(prev);
}

const REVIEW_KEY_BUCKETS = ['distressed', 'well_maintained', 'vacant', 'review', 'low_confidence'];

function countReviewedKeys(buckets) {
  if (!buckets || typeof buckets !== 'object') return 0;
  let n = 0;
  for (const k of Object.keys(buckets)) {
    const bucket = buckets[k];
    n += Array.isArray(bucket) ? bucket.length : 0;
  }
  return n;
}

/** Union review buckets so partial saves never wipe progress from another filter. */
function mergeReviewedKeysByFilter(existing = {}, incoming = {}) {
  const merged = {};
  const names = new Set([
    ...REVIEW_KEY_BUCKETS,
    ...Object.keys(existing || {}),
    ...Object.keys(incoming || {})
  ]);
  for (const bucket of names) {
    const a = Array.isArray(existing[bucket]) ? existing[bucket] : [];
    const b = Array.isArray(incoming[bucket]) ? incoming[bucket] : [];
    merged[bucket] = [...new Set([...a, ...b])];
  }
  return merged;
}

function mergeReviewProgressByFilter(existing = {}, incoming = {}) {
  const merged = { ...(existing || {}) };
  for (const [filter, inc] of Object.entries(incoming || {})) {
    if (!inc || typeof inc !== 'object') continue;
    const prev = merged[filter];
    const incIndex = Number(inc.index) || 0;
    const prevIndex = Number(prev?.index) || 0;
    if (!prev || incIndex >= prevIndex) merged[filter] = inc;
  }
  return merged;
}

function countSessionProgress(session) {
  if (!session) return 0;
  let manualEdits = 0;
  let reviewMarks = 0;
  let leadTypes = 0;
  let blurred = 0;
  let enrichment = 0;
  let manuallyReviewedCount = 0;
  for (const r of session.results || []) {
    if (r.manualScore || r.manualOverride || r.tierLocked) manualEdits++;
    if (r.manuallyReviewed || r.reviewResolved) {
      reviewMarks++;
      if (r.manuallyReviewed) manuallyReviewedCount++;
    }
    if (r.leadType) leadTypes++;
    if (r.blurred || r.isBlurred) blurred++;
    if (Array.isArray(r.indicators) && r.indicators.length) enrichment += r.indicators.length;
  }
  const reviewedKeys = session.reviewedKeysByFilter || {};
  let reviewedKeyCount = 0;
  for (const k of Object.keys(reviewedKeys)) {
    const bucket = reviewedKeys[k];
    reviewedKeyCount += Array.isArray(bucket) ? bucket.length : Object.keys(bucket || {}).length;
  }
  const reviewQueue = (session.reviewQueue || []).length;
  const reviewIndex = Number(session.reviewIndex) || 0;
  const importLeadType = session.importLeadType ? 1 : 0;
  return manualEdits + reviewMarks + reviewedKeyCount + reviewQueue + reviewIndex
    + leadTypes * 3 + blurred * 2 + enrichment + importLeadType * 5
    + manuallyReviewedCount * 2;
}

function sessionPayloadBytes(session) {
  try { return JSON.stringify(session).length; } catch (_) { return 0; }
}

function finalizeMergedSession(existing, incoming, mergedResults) {
  const existingRecords = Array.isArray(existing.records) ? existing.records : [];
  const incomingRecords = Array.isArray(incoming.records) ? incoming.records : [];
  const merged = {
    ...existing,
    ...incoming,
    results: mergedResults,
    reviewedKeysByFilter: mergeReviewedKeysByFilter(
      existing.reviewedKeysByFilter,
      incoming.reviewedKeysByFilter
    ),
    reviewProgressByFilter: mergeReviewProgressByFilter(
      existing.reviewProgressByFilter,
      incoming.reviewProgressByFilter
    )
  };
  if (existingRecords.length >= mergedResults.length) {
    merged.records = existingRecords;
  } else if (incomingRecords.length >= mergedResults.length) {
    merged.records = incomingRecords;
  } else {
    merged.records = mergedResults;
  }
  merged.processed = Math.max(
    Number(existing.processed) || 0,
    Number(incoming.processed) || 0,
    mergedResults.length
  );
  merged.savedAt = Math.max(Number(existing.savedAt) || 0, Number(incoming.savedAt) || 0) || Date.now();
  delete merged.partialReviewSync;
  return merged;
}

/** Merge incoming client save into canonical server session (partial or full). */
function mergeSessionSave(existing, incoming) {
  const existingResults = Array.isArray(existing?.results) ? existing.results : [];
  const incomingResults = Array.isArray(incoming?.results) ? incoming.results : [];
  if (!existingResults.length) return incoming;
  const incomingReviewKeys = countReviewedKeys(incoming?.reviewedKeysByFilter);
  const incomingReviewProgress = Object.keys(incoming?.reviewProgressByFilter || {}).length;
  if (!incomingResults.length) {
    if (!incoming?.partialReviewSync && !incomingReviewKeys && !incomingReviewProgress) return existing;
    return finalizeMergedSession(existing, incoming, existingResults);
  }
  // Full client snapshot with more results wins (normal scan progress).
  if (incomingResults.length > existingResults.length) return incoming;

  // Partial client (fewer total rows) can still carry NEW scanned addresses.
  // Merge edits onto existing keys, then APPEND any incoming keys the server lacks.
  const incomingByKey = new Map();
  for (const r of incomingResults) {
    const k = recordKeyFromResult(r);
    if (k) incomingByKey.set(k, r);
  }
  const seen = new Set();
  const mergedResults = existingResults.map((prev, i) => {
    const pk = recordKeyFromResult(prev);
    if (pk) seen.add(pk);
    const inc = incomingByKey.get(pk)
      || (incomingResults.length === existingResults.length ? incomingResults[i] : null);
    if (!inc) return prev;
    return shouldReplaceSessionResult(prev, inc) ? inc : prev;
  });
  for (const r of incomingResults) {
    const k = recordKeyFromResult(r);
    if (!k || seen.has(k)) continue;
    mergedResults.push(r);
    seen.add(k);
  }
  return finalizeMergedSession(existing, incoming, mergedResults);
}

function mergePartialSessionSave(existing, incoming) {
  return mergeSessionSave(existing, incoming);
}

function isIncomingSessionWorse(existing, incoming) {
  const {
    existingResults,
    existingProcessed,
    existingProgress,
    existingBytes,
    existingSavedAt
  } = existing;
  const {
    results,
    processed,
    incomingProgress,
    incomingBytes,
    incomingSavedAt
  } = incoming;
  if (results < existingResults) return true;
  if (results === existingResults && processed < existingProcessed) return true;
  if (results === existingResults && processed === existingProcessed && incomingProgress < existingProgress) return true;
  // Smaller payload alone is not a downgrade if the save is newer (client may omit hydrated fields).
  if (results === existingResults && processed === existingProcessed && incomingProgress === existingProgress
    && incomingBytes < existingBytes * 0.98 && incomingSavedAt < existingSavedAt) return true;
  if (results === existingResults && processed === existingProcessed && incomingProgress === existingProgress
    && incomingBytes === existingBytes && incomingSavedAt < existingSavedAt) return true;
  return false;
}

module.exports = {
  recordKeyFromResult,
  isManuallyEditedResult,
  resultEditTimestamp,
  shouldReplaceSessionResult,
  mergeReviewedKeysByFilter,
  mergeReviewProgressByFilter,
  countReviewedKeys,
  mergeSessionSave,
  mergePartialSessionSave,
  countSessionProgress,
  sessionPayloadBytes,
  isIncomingSessionWorse
};