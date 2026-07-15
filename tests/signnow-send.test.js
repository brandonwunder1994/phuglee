'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMoney,
  propertyLine,
  propertyLines,
  kindFromTemplateKey,
  TEMPLATES,
  SENDER,
  BRAD,
  WUNDERHAUS_JV_ROLE
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

  it('splits street and city line for JV property fields', () => {
    assert.deepEqual(
      propertyLines({ address: '910 Delaware', city: 'Longmont', state: 'CO', zip: '80501' }),
      { street: '910 Delaware', cityLine: 'Longmont, CO 80501' }
    );
    assert.deepEqual(
      propertyLines({
        address: '910 Delaware, Longmont, CO 80501',
        city: 'Longmont',
        state: 'CO',
        zip: '80501'
      }),
      { street: '910 Delaware', cityLine: 'Longmont, CO 80501' }
    );
  });

  it('wires JV invite roles and emails to Brandon and Brad', () => {
    assert.equal(WUNDERHAUS_JV_ROLE, 'Wunderhaus Group LLC');
    assert.equal(SENDER.email, 'brandon@wunderhausgroup.com');
    assert.equal(BRAD.signNowRole, 'Green Oasis Solutions LLC');
    assert.equal(BRAD.company, 'Green Oasis Solutions LLC');
    assert.equal(BRAD.email, 'buyhomes995@gmail.com');
  });

  it('maps template keys to document kinds', () => {
    assert.equal(kindFromTemplateKey('aoc'), 'aoc');
    assert.equal(kindFromTemplateKey('jv'), 'jv');
    assert.equal(kindFromTemplateKey('amendment'), 'amendment');
  });
});
