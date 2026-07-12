'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

/**
 * Unit-level contract for lean scan-queue merge logic (mirrors routes/session.js).
 * Full HTTP suite is heavier; this locks the v3.1 replace-queue semantics.
 */
function applyScanQueue(base, body) {
  const results = Array.isArray(base.results) ? base.results : [];
  const replaceQueue = body.replaceQueue !== false;
  const incoming = Array.isArray(body.records) ? body.records : [];
  const lean = incoming.map((r) => {
    if (!r || typeof r !== 'object' || !r.profile) return r;
    const { profile, ...rest } = r;
    return rest;
  });
  const existingBatches = Array.isArray(base.importBatches) ? base.importBatches : [];
  let nextBatches = existingBatches;
  if (Array.isArray(body.importBatches) && body.importBatches.length) {
    nextBatches = body.importBatches;
  }
  return {
    ...base,
    records: replaceQueue ? lean : [...(Array.isArray(base.records) ? base.records : []), ...lean],
    results,
    processed: Number(base.processed) || results.length || 0,
    importBatches: nextBatches,
    fileName: body.fileName != null ? String(body.fileName) : (base.fileName || ''),
    savedAt: Number(body.savedAt) || Date.now()
  };
}

describe('session-scan-queue (v3.1 lean upload)', () => {
  it('replaces records queue without touching results', () => {
    const base = {
      results: [
        { address: '1 Main St', leadTier: 'distressed', score: 8 },
        { address: '2 Oak Ave', leadTier: 'well_maintained', score: 2 }
      ],
      records: [{ address: '1 Main St' }, { address: '2 Oak Ave' }],
      processed: 2,
      importBatches: [],
      fileName: 'old.csv'
    };
    const next = applyScanQueue(base, {
      replaceQueue: true,
      records: [
        { address: '9 New St', profile: { avm: '$1', fat: true } },
        { address: '10 New St' }
      ],
      importBatches: [{ id: 'batch_1', leadCount: 2, importedAt: 100 }],
      fileName: 'new-list.csv'
    });
    assert.equal(next.results.length, 2);
    assert.equal(next.results[0].leadTier, 'distressed');
    assert.equal(next.records.length, 2);
    assert.equal(next.records[0].address, '9 New St');
    assert.equal(next.records[0].profile, undefined, 'profile stripped from queue');
    assert.equal(next.fileName, 'new-list.csv');
    assert.equal(next.importBatches.length, 1);
    assert.equal(next.importBatches[0].id, 'batch_1');
  });

  it('append mode keeps prior queue rows when replaceQueue is false', () => {
    const base = {
      results: [{ address: '1 Main' }],
      records: [{ address: 'pending-old' }],
      importBatches: []
    };
    const next = applyScanQueue(base, {
      replaceQueue: false,
      records: [{ address: 'pending-new' }]
    });
    assert.equal(next.records.length, 2);
    assert.equal(next.results.length, 1);
  });
});
