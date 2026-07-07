const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  streetAnalysisNeedsSatellite,
  satelliteFallbackFailed
} = require('../lib/imagery-routing');
const { computeLeadTier } = require('../lib/tier-engine');
const { computeNeedsReview } = require('../lib/result-classify');
const smoke = require('./fixtures/classification-smoke.json');

describe('classification smoke log', () => {
  for (const scenario of smoke.scenarios) {
    it(scenario.id, () => {
      const needsSat = streetAnalysisNeedsSatellite(
        scenario.streetAnalysis,
        scenario.streetAnalysis.viewMeta || {}
      );
      assert.equal(needsSat, scenario.needsSatellite, `${scenario.id}: satellite routing`);

      if (scenario.expectedTier && scenario.satelliteResult) {
        const tier = computeLeadTier(
          scenario.satelliteResult.aerialDistressScore ?? 0,
          'property',
          {
            indicators: scenario.satelliteResult.indicators,
            satelliteClassification: scenario.satelliteResult,
            reason: scenario.streetAnalysis.reason
          }
        );
        assert.equal(tier, scenario.expectedTier, `${scenario.id}: satellite tier`);
      } else if (scenario.expectedTier && scenario.streetAnalysis.category === 'property') {
        const tier = computeLeadTier(
          scenario.streetAnalysis.score ?? 0,
          'property',
          {
            indicators: scenario.streetAnalysis.indicators,
            reason: scenario.streetAnalysis.reason
          }
        );
        assert.equal(tier, scenario.expectedTier, `${scenario.id}: street tier`);
      }

      if (scenario.satelliteFailed) {
        assert.equal(
          satelliteFallbackFailed(scenario.streetAnalysis, scenario.satelliteResult),
          true
        );
        if (scenario.record) {
          assert.equal(computeNeedsReview(scenario.record), scenario.needsReview);
        }
      }
    });
  }
});