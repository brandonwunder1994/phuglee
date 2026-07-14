'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveMetro,
  roofSquaresFromSqft,
  synthesizeConditionScan,
  applyLineVoid,
  loadCostBook
} = require('../lib/leads-platform/rehab-cost-engine');

test('cost book loads with 10 categories', () => {
  const book = loadCostBook();
  assert.equal(book.categories.length, 10);
  assert.ok(book.version);
});

test('TX metro resolve for Houston', () => {
  const m = resolveMetro({ city: 'Houston', state: 'TX' });
  assert.equal(m.id, 'houston_tx');
  assert.ok(m.factor > 1);
});

test('roof squares heuristic is stable', () => {
  const a = roofSquaresFromSqft(1400);
  const b = roofSquaresFromSqft(1400);
  assert.equal(a, b);
  assert.ok(a >= 10);
});

test('synthesize cites media and is deterministic', () => {
  const deal = {
    dealId: 'test_deal',
    address: '100 Test St',
    city: 'Victoria',
    state: 'TX',
    purchasePrice: 120000
  };
  const mediaItems = [
    {
      id: 'media_kitchen',
      kind: 'image',
      aiLabel: {
        room: 'kitchen',
        severity: 4,
        issues: [{ text: 'Cabinets failing', severity: 4, category: 'kitchen' }]
      }
    },
    {
      id: 'media_roof',
      kind: 'image',
      aiLabel: {
        room: 'roof',
        severity: 4,
        issues: [{ text: 'Missing shingles', severity: 4, category: 'roofing' }]
      }
    }
  ];
  const a = synthesizeConditionScan({ deal, mediaItems, options: { livingSqft: 1400, finishGrade: 'investor' } });
  const b = synthesizeConditionScan({ deal, mediaItems, options: { livingSqft: 1400, finishGrade: 'investor' } });
  assert.equal(a.totals.active, b.totals.active);
  assert.ok(a.lines.length >= 2);
  assert.ok(a.lines.every((l) => l.mediaIds.length > 0));
  assert.equal(a.metroId, 'victoria_tx');
});

test('void drops from active total and restore works', () => {
  const deal = { dealId: 't', city: 'Austin', state: 'TX' };
  const mediaItems = [{
    id: 'media_bath',
    kind: 'image',
    aiLabel: {
      room: 'bathroom',
      severity: 4,
      issues: [{ text: 'Gut bath', severity: 4, category: 'bathrooms' }]
    }
  }];
  const scan = synthesizeConditionScan({ deal, mediaItems });
  assert.ok(scan.lines.length >= 1);
  const id = scan.lines[0].id;
  const before = scan.totals.active;
  const voided = applyLineVoid(scan, id, true);
  assert.ok(voided.totals.active < before || before === 0);
  assert.equal(voided.lines.find((l) => l.id === id).voided, true);
  const restored = applyLineVoid(voided, id, false);
  assert.equal(restored.lines.find((l) => l.id === id).voided, false);
  assert.equal(restored.totals.active, before);
});
