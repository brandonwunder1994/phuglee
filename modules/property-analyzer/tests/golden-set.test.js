const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  loadGoldenCases,
  replayGoldenSet,
  formatGoldenReport
} = require('../lib/golden-replay');

const FIXTURE = path.join(__dirname, 'fixtures', 'golden-cases.json');

describe('golden-set regression', () => {
  const cases = loadGoldenCases(FIXTURE);

  it('loads at least 50 fixture records', () => {
    assert.ok(cases.length >= 50, `expected >= 50 cases, got ${cases.length}`);
  });

  it('replays all golden cases against current tier engine', () => {
    const summary = replayGoldenSet(cases);
    if (summary.failed) {
      console.error(formatGoldenReport(summary));
    }
    assert.equal(summary.failed, 0, `golden failures: ${summary.failedIds.join(', ')}`);
    assert.equal(summary.passed, summary.total);
  });

  it('reports baseline change metadata without failing on unchanged baselines', () => {
    const summary = replayGoldenSet(cases);
    assert.ok(typeof summary.changedFromBaseline === 'number');
    assert.ok(Array.isArray(summary.changedIds));
  });
});