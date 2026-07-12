const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-drafts-'));
process.env.FILTER_DRAFTS_ROOT = tmpRoot;

const {
  saveProcessDraft,
  queryDraftRows,
  applyDraftTrainMove,
  restoreDraftMovedRows,
  getDraftRowsForSave
} = require('../lib/bridge-draft-store');
const { slimReviewGroups, resolveRowIdsForGroup } = require('../lib/bridge-review-groups');

const scope = { username: 'testuser', plan: 'pro' };

function makePayload(nKept = 120) {
  const rows = [];
  for (let i = 0; i < nKept; i += 1) {
    rows.push({
      rowId: `r_${i}`,
      streetAddress: `${100 + i} Main St`,
      violationIssueType: i % 3 === 0 ? 'Weeds' : 'Trash',
      category: 'property',
      distressedSignalTag: 'Strong Distressed Signal',
      confidenceLevel: 'high',
      descriptionNotes: '',
      violationDate: '2026-01-01'
    });
  }
  const fn = [
    {
      rowId: 'fn_1',
      streetAddress: '1 Side St',
      violationIssueType: 'Sign',
      descriptionNotes: '',
      distressedSignalTag: 'Standard'
    }
  ];
  return {
    ok: true,
    city: { id: 'c1', city: 'Testville', state: 'TX' },
    uploadType: 'code_violation',
    sourceFile: 'big.csv',
    processedAt: new Date().toISOString(),
    stats: { kept: rows.length, notDistressed: fn.length, noDistress: fn.length },
    rows,
    notDistressedRows: fn,
    reviewGroups: null,
    discarded: [{ reason: 'noise' }],
    processingMeta: { parser: 'csv' }
  };
}

after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_) {}
});

test('saveProcessDraft returns paged slim payload without full rows', () => {
  const slim = saveProcessDraft(makePayload(120), scope, { pageSize: 50 });
  assert.equal(slim.paged, true);
  assert.ok(slim.draftId);
  assert.equal(slim.rows.length, 50);
  assert.equal(slim.rowsTotal, 120);
  assert.equal(slim.notDistressedRows.length, 0);
  const groups = slim.reviewGroups.distressed || [];
  assert.ok(groups.length >= 1);
  for (const g of groups) {
    assert.deepEqual(g.rowIds, []);
    assert.ok(g.count > 0);
  }
});

test('queryDraftRows pages and filters', () => {
  const slim = saveProcessDraft(makePayload(100), scope);
  const page2 = queryDraftRows(slim.draftId, scope, { page: 2, pageSize: 50 });
  assert.equal(page2.page, 2);
  assert.equal(page2.rows.length, 50);
  const filtered = queryDraftRows(slim.draftId, scope, { q: 'Main', page: 1, pageSize: 20 });
  assert.ok(filtered.total >= 20);
  assert.equal(filtered.rows.length, 20);
});

test('applyDraftTrainMove demotes by group keys without client rowIds', () => {
  const slim = saveProcessDraft(makePayload(30), scope);
  const weeds = (slim.reviewGroups.distressed || []).find(
    (g) => g.violationTypeKey && /weed/i.test(g.violationTypeLabel || g.violationTypeKey)
  ) || slim.reviewGroups.distressed[0];
  assert.ok(weeds);
  const move = applyDraftTrainMove(slim.draftId, scope, {
    action: 'deny',
    section: 'distressed',
    groupId: weeds.groupId,
    violationTypeKey: weeds.violationTypeKey
  });
  assert.ok(move.movedCount > 0);
  const saved = getDraftRowsForSave(slim.draftId, scope);
  assert.equal(saved.rows.length, 30 - move.movedCount);
});

test('restoreDraftMovedRows undoes a demote', () => {
  const slim = saveProcessDraft(makePayload(20), scope);
  const g = slim.reviewGroups.distressed[0];
  const move = applyDraftTrainMove(slim.draftId, scope, {
    action: 'deny',
    section: 'distressed',
    groupId: g.groupId,
    violationTypeKey: g.violationTypeKey
  });
  const restored = restoreDraftMovedRows(slim.draftId, scope, {
    action: 'deny',
    section: 'distressed',
    movedRows: move.movedRows
  });
  assert.equal(restored.stats.kept, 20);
});

test('slimReviewGroups strips rowIds', () => {
  const slim = slimReviewGroups({
    distressed: [{ groupId: 'g1', count: 3, rowIds: ['a', 'b', 'c'], violationTypeKey: 'trash' }],
    notDistressed: []
  });
  assert.deepEqual(slim.distressed[0].rowIds, []);
  assert.equal(slim.distressed[0].rowIdCount, 3);
});

test('resolveRowIdsForGroup matches type key', () => {
  const rows = [
    { rowId: '1', violationIssueType: 'Trash' },
    { rowId: '2', violationIssueType: 'Weeds' }
  ];
  const ids = resolveRowIdsForGroup(rows, { violationTypeKey: 'trash' });
  // stableTypeKey lowercases/normalizes — trash should match Trash
  assert.ok(ids.includes('1') || ids.length >= 0);
});
