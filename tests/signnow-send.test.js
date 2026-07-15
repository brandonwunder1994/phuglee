'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveDealPropertyAddress
} = require('../lib/leads-platform/deal-property-address');
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
const { fieldPayloadFromDoc } = require('../lib/leads-platform/signnow-client');

describe('deal property address resolution', () => {
  it('prefers linked lead over mismatched deal city/state', () => {
    const resolved = resolveDealPropertyAddress(
      {
        address: '910 Delaware Ave',
        city: 'Longmont',
        state: 'CO',
        zip: '80501',
        leadId: 'lead1'
      },
      {
        address: '910 Delaware Ave',
        city: 'Middletown',
        state: 'OH',
        zip: '45044'
      }
    );
    assert.equal(resolved.street, '910 Delaware Ave');
    assert.equal(resolved.city, 'Middletown');
    assert.equal(resolved.state, 'OH');
    assert.equal(resolved.zip, '45044');
    assert.equal(resolved.cityLine, 'Middletown, OH 45044');
    assert.equal(resolved.propertyLine, '910 Delaware Ave, Middletown, OH 45044');
    assert.equal(resolved.source, 'lead');
  });

  it('never mixes lead street with deal city when lead is incomplete', () => {
    const resolved = resolveDealPropertyAddress(
      { address: '1 Wrong St', city: 'Longmont', state: 'CO', zip: '80501' },
      { address: '910 Delaware Ave', city: '', state: '', zip: '' }
    );
    assert.equal(resolved.street, '910 Delaware Ave');
    assert.equal(resolved.city, '');
    assert.equal(resolved.state, '');
    assert.equal(resolved.source, 'lead-partial');
  });
});

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
      propertyLine({ address: '910 Delaware Ave', city: 'Middletown', state: 'OH', zip: '45044' }),
      '910 Delaware Ave, Middletown, OH 45044'
    );
  });

  it('splits street and city line for JV property fields', () => {
    assert.deepEqual(
      propertyLines({ address: '910 Delaware Ave', city: 'Middletown', state: 'OH', zip: '45044' }),
      {
        street: '910 Delaware Ave',
        cityLine: 'Middletown, OH 45044',
        resolved: {
          address: '910 Delaware Ave',
          city: 'Middletown',
          state: 'OH',
          zip: '45044',
          street: '910 Delaware Ave',
          cityLine: 'Middletown, OH 45044',
          propertyLine: '910 Delaware Ave, Middletown, OH 45044',
          source: 'deal'
        }
      }
    );
  });

  it('clears SignNow template sample address when our value is empty', () => {
    const fields = fieldPayloadFromDoc(
      {
        fields: [{
          type: 'text',
          role: 'Assignor',
          json_attributes: {
            name: 'property_line_2',
            page_number: 0,
            x: 1,
            y: 1,
            width: 10,
            height: 10,
            prefilled_text: 'Longmont, CO 80501',
            required: true
          }
        }]
      },
      { property_line_2: '' }
    );
    assert.equal(fields[0].prefilled_text, '');
  });

  it('wires JV invite roles and emails to Brandon and Brad', () => {
    assert.equal(WUNDERHAUS_JV_ROLE, 'Wunderhaus Group LLC');
    assert.equal(SENDER.email, 'brandon@wunderhausgroup.com');
    assert.equal(BRAD.signNowRole, 'Green Oasis Solutions LLC');
    assert.equal(BRAD.company, 'Green Oasis Solutions LLC');
    assert.equal(BRAD.email, 'buyhomes995@gmail.com');
  });

  it('uses spaced AOC template field names and Assignor/Assignee roles', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/leads-platform/signnow-send.js'),
      'utf8'
    );
    assert.match(src, /'Property Address'/);
    assert.match(src, /'Legal Description'/);
    assert.match(src, /role: 'Assignor'/);
    assert.match(src, /role: 'Assignee'/);
  });

  it('auto-imports signed SignNow docs via syncPendingSignNowAcrossDeals export', () => {
    const contracts = require('../lib/leads-platform/contracts');
    assert.equal(typeof contracts.syncPendingSignNowAcrossDeals, 'function');
    assert.equal(typeof contracts.healDealAddressFromLinkedLead, 'function');
  });

  it('maps template keys to document kinds', () => {
    assert.equal(kindFromTemplateKey('aoc'), 'aoc');
    assert.equal(kindFromTemplateKey('jv'), 'jv');
    assert.equal(kindFromTemplateKey('amendment'), 'amendment');
  });

  it('omits personalized subject/message from SignNow invites (plan limitation)', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/leads-platform/signnow-client.js'),
      'utf8'
    );
    assert.match(src, /Do NOT send custom subject\/message/);
    assert.match(src, /error 65582/);
    assert.doesNotMatch(
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
      /return api\('POST', `\/document\/\$\{documentId\}\/invite`, \{[\s\S]*?subject/
    );
  });
});
