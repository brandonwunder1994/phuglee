const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeCorrectionMetrics,
  formatMetricsReport
} = require('../lib/classification-metrics');
const fixtures = require('./fixtures/tier-correction-metrics.json');

describe('classification-metrics', () => {
  it('computes FN/FP from tier corrections', () => {
    const m = computeCorrectionMetrics(fixtures.sampleCorrections);
    assert.equal(m.corrections, 4);
    assert.equal(m.affirmations, 1);
    assert.equal(m.falseNegatives, 2);
    assert.equal(m.falsePositives, 2);
    assert.equal(m.falseNegativeRate, 0.5);
    assert.equal(m.falsePositiveRate, 0.5);
  });

  it('formats metrics report with auto-correct rate', () => {
    const m = computeCorrectionMetrics(fixtures.sampleCorrections);
    const report = formatMetricsReport(m);
    assert.ok(report.includes('False negatives'));
    assert.ok(report.includes('Auto-correct'));
    assert.ok(m.autoCorrectRate > 0);
    assert.ok(m.manualFixRate > 0);
  });

  it('handles empty correction list', () => {
    const m = computeCorrectionMetrics([]);
    assert.equal(m.corrections, 0);
    assert.equal(m.falseNegativeRate, 0);
    assert.equal(m.falsePositiveRate, 0);
  });
});