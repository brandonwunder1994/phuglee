const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseLooseJson,
  extractJsonBlock,
  stripTrailingCommas,
  salvagePartialJson,
  parseStructureOnLot,
  applyStructureToSatelliteCategory
} = require('../lib/gemini-json');

describe('extractJsonBlock', () => {
  it('strips markdown json fence', () => {
    const out = extractJsonBlock('```json\n{"score":5}\n```');
    assert.equal(out, '{"score":5}');
  });
});

describe('stripTrailingCommas', () => {
  it('removes trailing comma before brace', () => {
    assert.equal(stripTrailingCommas('{"a":1,}'), '{"a":1}');
    assert.equal(stripTrailingCommas('{"a":1}'), '{"a":1}');
  });
});

describe('salvagePartialJson', () => {
  it('extracts score from broken JSON', () => {
    const out = salvagePartialJson('{"score": 7, "category": "property"');
    assert.equal(out.score, 7);
    assert.equal(out.category, 'property');
  });
});

describe('parseLooseJson', () => {
  it('parses valid JSON passthrough', () => {
    const out = parseLooseJson('{"score":5,"category":"property","reason":"ok"}');
    assert.equal(out.score, 5);
    assert.equal(out.category, 'property');
  });

  it('parses fenced JSON', () => {
    const out = parseLooseJson('```json\n{"score":3,"category":"property"}\n```');
    assert.equal(out.score, 3);
  });

  it('repairs truncated string', () => {
    const out = parseLooseJson('{"score":4,"category":"property","reason":"incomplete');
    assert.equal(out.score, 4);
  });

  it('fills default category and reason', () => {
    const out = parseLooseJson('{"score":2}');
    assert.equal(out.category, 'property');
  });
});

describe('parseStructureOnLot', () => {
  it('keeps true/false and does not coerce null/missing to false', () => {
    assert.equal(parseStructureOnLot(true), true);
    assert.equal(parseStructureOnLot('true'), true);
    assert.equal(parseStructureOnLot(false), false);
    assert.equal(parseStructureOnLot('false'), false);
    assert.equal(parseStructureOnLot(null), null);
    assert.equal(parseStructureOnLot(undefined), null);
    assert.equal(parseStructureOnLot(''), null);
  });
});

describe('applyStructureToSatelliteCategory', () => {
  it('does not force vacant when structure flag is missing', () => {
    assert.equal(applyStructureToSatelliteCategory('property', null), 'property');
    assert.equal(applyStructureToSatelliteCategory('property', undefined), 'property');
  });

  it('forces vacant only on explicit false', () => {
    assert.equal(applyStructureToSatelliteCategory('property', false), 'vacant_lot');
  });

  it('promotes unavailable to property when structure is explicitly true', () => {
    assert.equal(applyStructureToSatelliteCategory('unavailable', true), 'property');
  });
});
