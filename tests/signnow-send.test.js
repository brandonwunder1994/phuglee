'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMoney,
  propertyLine,
  kindFromTemplateKey,
  TEMPLATES
} = require('../lib/leads-platform/signnow-send');

describe('signnow-send helpers', () => {
  it('has AOC, JV, and Amendment templates', () => {
    assert.ok(TEMPLATES.aoc.templateId);
    assert.ok(TEMPLATES.jv.templateId);
    assert.ok(TEMPLATES.amendment.templateId);
  });

  it('formats money with dollar sign', () => {
    assert.equal(formatMoney(85000), '$85,000.00');
    assert.equal(formatMoney('$1,000'), '$1,000');
  });

  it('builds property line from deal fields', () => {
    assert.equal(
      propertyLine({ address: '910 Delaware', city: 'Longmont', state: 'CO', zip: '80501' }),
      '910 Delaware, Longmont, CO 80501'
    );
  });

  it('maps template keys to document kinds', () => {
    assert.equal(kindFromTemplateKey('aoc'), 'aoc');
    assert.equal(kindFromTemplateKey('jv'), 'jv');
    assert.equal(kindFromTemplateKey('amendment'), 'amendment');
  });
});
