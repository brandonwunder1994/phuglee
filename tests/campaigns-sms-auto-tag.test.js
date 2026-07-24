'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  desiredTagsForContact,
  messageLooksLikePersonOptOut,
  payloadLooksLikeSystemBlock,
  handleGhlSmsTagWebhook,
  TAG_PERSON_DNC,
  TAG_SYSTEM_LANDLINE
} = require('../lib/campaigns/sms-auto-tag');

describe('sms auto-tag', () => {
  it('desires person:dnc for DNC language', () => {
    const r = desiredTagsForContact({ tags: ['dnc'], dnd: false });
    assert.equal(r.kind, 'person');
    assert.deepEqual(r.add, [TAG_PERSON_DNC]);
  });

  it('desires system:landline for system SMS DND', () => {
    const r = desiredTagsForContact({
      tags: [],
      dndSettings: { SMS: true }
    });
    assert.equal(r.kind, 'system');
    assert.deepEqual(r.add, [TAG_SYSTEM_LANDLINE]);
  });

  it('detects STOP message as person opt-out', () => {
    assert.equal(messageLooksLikePersonOptOut('STOP'), true);
    assert.equal(messageLooksLikePersonOptOut('please remove me'), true);
    assert.equal(messageLooksLikePersonOptOut('how much for the house?'), false);
  });

  it('detects failed delivery payload as system', () => {
    assert.equal(payloadLooksLikeSystemBlock({ status: 'failed', error: 'landline' }), true);
    assert.equal(payloadLooksLikeSystemBlock({ type: 'InboundMessage', body: 'hi' }), false);
  });

  it('webhook tags person on STOP', async () => {
    const added = [];
    const ghl = {
      async addContactTags(id, tags) {
        added.push({ id, tags });
      }
    };
    const r = await handleGhlSmsTagWebhook(
      { contactId: 'abc', body: 'STOP' },
      { ghl }
    );
    assert.equal(r.ok, true);
    assert.equal(r.kind, 'person');
    assert.deepEqual(added[0].tags, [TAG_PERSON_DNC]);
  });

  it('webhook tags system on failed SMS', async () => {
    const added = [];
    const ghl = {
      async addContactTags(id, tags) {
        added.push({ id, tags });
      }
    };
    const r = await handleGhlSmsTagWebhook(
      { contactId: 'xyz', status: 'failed', error: 'landline number' },
      { ghl }
    );
    assert.equal(r.ok, true);
    assert.equal(r.kind, 'system');
    assert.deepEqual(added[0].tags, [TAG_SYSTEM_LANDLINE]);
  });
});
