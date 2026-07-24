'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyDncDnd } = require('../lib/campaigns/sms-tags');

describe('classifyDncDnd', () => {
  it('tags person opt-out for DNC / STOP language', () => {
    assert.equal(classifyDncDnd({ tags: ['dnc'], systemSmsDnd: false }).kind, 'person');
    assert.equal(classifyDncDnd({ tags: ['Do Not Contact'], systemSmsDnd: true }).kind, 'person');
    assert.equal(classifyDncDnd({ tags: ['stop'], systemSmsDnd: false }).kind, 'person');
    assert.equal(classifyDncDnd({ tags: ['opt out'], systemSmsDnd: false }).personOptOut, true);
  });

  it('tags system/landline when SMS DND without person language', () => {
    const r = classifyDncDnd({ tags: [], systemSmsDnd: true });
    assert.equal(r.kind, 'system');
    assert.equal(r.systemSmsBlock, true);
    assert.equal(r.personOptOut, false);
  });

  it('tags landline delivery tags as system', () => {
    const r = classifyDncDnd({ tags: ['landline'], systemSmsDnd: false });
    assert.equal(r.kind, 'system');
  });

  it('bare dnd + system flag → system (landline error path)', () => {
    const r = classifyDncDnd({ tags: ['dnd'], systemSmsDnd: true });
    assert.equal(r.kind, 'system');
  });

  it('bare dnd without system flag → person (manual)', () => {
    const r = classifyDncDnd({ tags: ['dnd'], systemSmsDnd: false });
    assert.equal(r.kind, 'person');
  });

  it('person language wins over system flag', () => {
    const r = classifyDncDnd({ tags: ['dnc'], systemSmsDnd: true });
    assert.equal(r.kind, 'person');
    assert.equal(r.systemSmsBlock, false);
  });
});
