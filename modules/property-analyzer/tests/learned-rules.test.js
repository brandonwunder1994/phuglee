const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  recordMatchesLearnedWhen,
  shouldBlockDistressPromotion,
  applyLearnedTierRules,
  HARD_NEVER_LEARN_INDICATORS
} = require('../lib/learned-rules');

describe('learned-rules', () => {
  it('blocks rules when never_when_indicators present', () => {
    const record = {
      category: 'property',
      score: 3,
      indicators: ['boarded_windows'],
      satelliteClassification: { roofCondition: 'fair', yardCondition: 'fair' }
    };
    const when = { never_when_indicators: ['boarded_windows'] };
    assert.equal(recordMatchesLearnedWhen(record, when), false);
  });

  it('does not block well_maintained → distressed promotion on looksVisuallyDistressed', () => {
    const record = {
      category: 'property',
      score: 3,
      leadTier: 'well_maintained',
      indicators: ['peeling_paint'],
      satelliteClassification: { roofCondition: 'fair', yardCondition: 'good', aerialDistressScore: 4 },
      reason: 'Peeling paint visible'
    };
    const rule = {
      id: 'R-test',
      status: 'approved',
      fromTiers: ['well_maintained'],
      toTier: 'distressed',
      when: {
        satelliteRoof_in: ['fair'],
        indicators_require: ['peeling_paint'],
        never_when_indicators: ['boarded_windows', 'structural_damage']
      }
    };

    assert.equal(shouldBlockDistressPromotion(record, rule, 'well_maintained'), false);

    const updated = applyLearnedTierRules(record, [rule]);
    assert.equal(updated.leadTier, 'distressed');
    assert.equal(updated.appliedLearnedRuleId, 'R-test');
  });

  it('still blocks distressed promotion without well_maintained source tier', () => {
    const record = {
      category: 'property',
      score: 2,
      leadTier: 'well_maintained',
      indicators: [],
      satelliteClassification: { roofCondition: 'good', yardCondition: 'good' },
      reason: 'Clean manicured home'
    };
    const rule = {
      id: 'R-blocked',
      status: 'approved',
      fromTiers: ['well_maintained', 'distressed'],
      toTier: 'distressed',
      when: { score_gte: 1 }
    };

    assert.equal(shouldBlockDistressPromotion(record, rule, 'well_maintained'), false);

    const blockedRule = { ...rule, fromTiers: ['distressed'] };
    assert.equal(shouldBlockDistressPromotion(record, blockedRule, 'distressed'), true);
  });

  it('never applies rules on hard never-learn indicators', () => {
    const record = {
      category: 'property',
      score: 8,
      leadTier: 'well_maintained',
      indicators: ['structural_damage']
    };
    const rule = {
      id: 'R-hard',
      status: 'approved',
      fromTiers: ['well_maintained'],
      toTier: 'distressed',
      when: { score_gte: 1 }
    };

    assert.ok(HARD_NEVER_LEARN_INDICATORS.has('structural_damage'));
    const updated = applyLearnedTierRules(record, [rule]);
    assert.equal(updated.leadTier, 'well_maintained');
  });

  it('symmetrically applies well_maintained demotion rules', () => {
    const record = {
      category: 'property',
      score: 7,
      leadTier: 'distressed',
      indicators: ['overgrown_landscaping'],
      satelliteClassification: { roofCondition: 'good', yardCondition: 'good', aerialDistressScore: 2 },
      reason: 'Grass tall but manicured yard'
    };
    const rule = {
      id: 'R-wm',
      status: 'approved',
      fromTiers: ['distressed'],
      toTier: 'well_maintained',
      when: {
        satelliteRoof_in: ['good'],
        satelliteYard_in: ['good'],
        aerialDistressScore_lte: 3
      }
    };

    const updated = applyLearnedTierRules(record, [rule]);
    assert.equal(updated.leadTier, 'well_maintained');
  });
});