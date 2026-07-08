(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.importBatches = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function importBatchesFactory() {
  function normalizePart(value) {
    return String(value || '').trim();
  }

  function createImportBatch(opts = {}) {
    const ts = Number(opts.importedAt) || Date.now();
    return {
      id: opts.id || `batch_${ts}_${Math.random().toString(36).slice(2, 8)}`,
      city: normalizePart(opts.city),
      state: normalizePart(opts.state),
      sourceFile: normalizePart(opts.sourceFile),
      leadCount: Math.max(0, Number(opts.leadCount) || 0),
      importedAt: ts
    };
  }

  function stampRecordsWithBatch(records, batchId, importedAt) {
    const ts = Number(importedAt) || Date.now();
    const id = String(batchId || '').trim();
    return (records || []).map((record) => ({
      ...record,
      importBatchId: id,
      importedAt: Number(record.importedAt) || ts
    }));
  }

  function recordMatchesLocation(record, locationFilter, normalizeStateAbbr) {
    if (!locationFilter) return true;
    const city = normalizePart(record.city);
    const abbr = typeof normalizeStateAbbr === 'function'
      ? normalizeStateAbbr(record.state)
      : normalizePart(record.state);
    if (locationFilter.state === '__unknown__') return !city && !abbr;
    if (abbr !== locationFilter.state) return false;
    if (!locationFilter.city) return true;
    return city.toLowerCase() === String(locationFilter.city).trim().toLowerCase();
  }

  function formatUploadChipLabel(importedAt) {
    const ts = Number(importedAt);
    if (!ts) return '—';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function listUploadDatesForLocation(records, results, locationFilter, normalizeStateAbbr, importBatches = []) {
    const seen = new Map();

    for (const batch of importBatches || []) {
      if (!recordMatchesLocation({ city: batch.city, state: batch.state }, locationFilter, normalizeStateAbbr)) continue;
      seen.set(batch.id, {
        batchId: batch.id,
        importedAt: Number(batch.importedAt) || 0,
        sourceFile: batch.sourceFile || '',
        leadCount: Number(batch.leadCount) || 0
      });
    }

    for (const row of [...(records || []), ...(results || [])]) {
      if (!recordMatchesLocation(row, locationFilter, normalizeStateAbbr)) continue;
      const batchId = String(row.importBatchId || '').trim();
      const importedAt = Number(row.importedAt) || 0;
      if (!batchId && !importedAt) continue;
      const key = batchId || `legacy_${importedAt}`;
      if (!seen.has(key)) {
        seen.set(key, { batchId: batchId || key, importedAt, sourceFile: '', leadCount: 0 });
      }
    }

    const chips = [...seen.values()]
      .filter((c) => c.importedAt > 0)
      .sort((a, b) => b.importedAt - a.importedAt);

    if (chips.length) chips[0].isMostRecent = true;
    return chips.map((chip) => ({
      ...chip,
      label: formatUploadChipLabel(chip.importedAt)
    }));
  }

  function matchesImportDateFilter(record, selectedBatchIds) {
    if (!Array.isArray(selectedBatchIds) || !selectedBatchIds.length) return true;
    const id = String(record.importBatchId || '').trim();
    if (id && selectedBatchIds.includes(id)) return true;
    const legacyKey = record.importedAt ? `legacy_${record.importedAt}` : '';
    return legacyKey && selectedBatchIds.includes(legacyKey);
  }

  function deriveRecentImport(importBatches, records) {
    const batches = Array.isArray(importBatches) ? importBatches : [];
    if (batches.length) {
      return [...batches].sort((a, b) => (Number(b.importedAt) || 0) - (Number(a.importedAt) || 0))[0];
    }
    if (!Array.isArray(records) || !records.length) return null;
    const counts = new Map();
    for (const record of records) {
      const city = normalizePart(record.city);
      const state = normalizePart(record.state);
      if (!city && !state) continue;
      const key = `${city.toLowerCase()}|${state.toLowerCase()}`;
      const prev = counts.get(key) || { city, state, count: 0 };
      prev.count += 1;
      counts.set(key, prev);
    }
    let best = null;
    for (const entry of counts.values()) {
      if (!best || entry.count > best.count) best = entry;
    }
    if (!best) return null;
    return { city: best.city, state: best.state, leadCount: best.count };
  }

  return {
    createImportBatch,
    stampRecordsWithBatch,
    recordMatchesLocation,
    formatUploadChipLabel,
    listUploadDatesForLocation,
    matchesImportDateFilter,
    deriveRecentImport
  };
});