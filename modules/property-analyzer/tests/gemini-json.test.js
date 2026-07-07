const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseLooseJson,
  extractJsonBlock,
  stripTrailingCommas,
  salvagePartialJson
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
    assert.equal(out.reason, 'Analysis complete.');
  });

  it('throws on empty garbage', () => {
    assert.throws(() => parseLooseJson(''), /invalid JSON/i);
  });

  it('validates required keys', () => {
    assert.throws(() => parseLooseJson('{"score":5,"category":"property","reason":"ok"}', ['confidence']));
  });

  it('salvages partial when full parse fails', () => {
    const out = parseLooseJson('Here is analysis: {"score": 6, "indicators": ["boarded_windows"');
    assert.equal(out.score, 6);
  });
});