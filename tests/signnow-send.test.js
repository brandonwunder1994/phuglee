'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveDealPropertyAddress
} = require('../lib/leads-platform/deal-property-address');
const {
  formatMoney,
  formatMoneyAmount,
  propertyLine,
  propertyLines,
  kindFromTemplateKey,
  TEMPLATES,
  SENDER,
  BRAD,
  WUNDERHAUS_JV_ROLE,
  splitAcrossLines,
  estimateTextFieldCapacity
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

  it('formats EMD amount without a dollar sign (template already has $)', () => {
    assert.equal(formatMoneyAmount(1000), '1,000.00');
    assert.equal(formatMoneyAmount('$1,500'), '1,500.00');
    assert.equal(formatMoneyAmount('2500.5'), '2,500.50');
  });

  it('AOC EMD uses amount-only formatting', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/leads-platform/signnow-send.js'),
      'utf8'
    );
    assert.match(src, /'Assignee EMD': formatMoneyAmount\(/);
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

  it('wires JV party roles and emails to Brandon and Brad', () => {
    assert.equal(WUNDERHAUS_JV_ROLE, 'Wunderhaus Group LLC');
    assert.equal(SENDER.email, 'brandon@wunderhausgroup.com');
    assert.equal(BRAD.signNowRole, 'Green Oasis Solutions LLC');
    assert.equal(BRAD.company, 'Green Oasis Solutions LLC');
    assert.equal(BRAD.email, 'buyhomes995@gmail.com');
  });

  it('uses spaced AOC fields, applies Assignor signature artifacts, invites Assignee only', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/leads-platform/signnow-send.js'),
      'utf8'
    );
    assert.match(src, /'Property Address'/);
    assert.match(src, /'Legal Description'/);
    assert.match(src, /'Assignor Signature Field'/);
    assert.match(src, /loadOwnerArtifactsFromTemplate/);
    assert.match(src, /applyPrefillStampingRole/);
    assert.match(src, /stampRole: 'Assignor'/);
    assert.match(src, /role: 'Assignee'/);
    assert.doesNotMatch(src, /role: 'Assignor'/);
  });

  it('stamps Buyer on amendments and invites sellers only', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/leads-platform/signnow-send.js'),
      'utf8'
    );
    assert.match(src, /stampRoles:\s*\{\s*Buyer:/);
    assert.match(src, /buyer_date: sendDate/);
    assert.doesNotMatch(src, /role: 'Buyer'/);
  });

  it('converts stamped-role signature fields to a text name stamp', () => {
    const fields = fieldPayloadFromDoc(
      {
        fields: [{
          type: 'signature',
          role: 'Buyer',
          json_attributes: {
            name: 'buyer_signature',
            page_number: 0,
            x: 1,
            y: 1,
            width: 100,
            height: 20,
            required: true
          }
        }, {
          type: 'text',
          role: 'Buyer',
          json_attributes: {
            name: 'buyer_date',
            page_number: 0,
            x: 1,
            y: 40,
            width: 80,
            height: 16,
            required: true
          }
        }]
      },
      {},
      { stampRoles: { Buyer: { name: 'Brandon Wunder', date: '07/17/2026' } } }
    );
    assert.equal(fields[0].type, 'text');
    assert.equal(fields[0].prefilled_text, 'Brandon Wunder');
    assert.equal(fields[1].prefilled_text, '07/17/2026');
  });

  it('extracts owner signature + text artifacts from a template document', () => {
    const { ownerArtifactsFromDoc } = require('../lib/leads-platform/signnow-client');
    const arts = ownerArtifactsFromDoc({
      signatures: [{
        page_number: '3', x: '10', y: '20', width: '30', height: '40', data: 'abc'
      }],
      texts: [{
        page_number: '0', x: '1', y: '2', width: '3', height: '4', data: 'Wunderhaus', font: 'Arial', size: '10'
      }]
    });
    assert.equal(arts.signatures.length, 1);
    assert.equal(arts.signatures[0].data, 'abc');
    assert.equal(arts.signatures[0].page_number, 3);
    assert.equal(arts.texts.length, 1);
    assert.equal(arts.texts[0].data, 'Wunderhaus');
  });

  it('exports applyPrefillStampingRole for Assignor skip-signer sends', () => {
    const client = require('../lib/leads-platform/signnow-client');
    assert.equal(typeof client.applyPrefillStampingRole, 'function');
  });

  it('exports applyCompleteOwnerStamp for full auto-complete (JV)', () => {
    const client = require('../lib/leads-platform/signnow-client');
    assert.equal(typeof client.applyCompleteOwnerStamp, 'function');
    assert.equal(typeof client.loadOwnerArtifactsFromDocument, 'function');
  });

  it('JV config includes Brad artifact donor + BL initials', () => {
    assert.ok(TEMPLATES.jv.bradArtifactsDocId);
    assert.equal(TEMPLATES.jv.bradInitials, 'BL');
  });

  it('JV send auto-stamps both parties and does not invite', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/leads-platform/signnow-send.js'),
      'utf8'
    );
    const jvFn = src.slice(src.indexOf('async function sendJvForDeal'), src.indexOf('function documentSignedAt'));
    assert.match(jvFn, /whiteoutJvPartyASignature/);
    assert.match(jvFn, /repairJvSignatureUnderlines/);
    assert.match(jvFn, /uploadDocumentPdf/);
    assert.match(jvFn, /loadOwnerArtifactsFromDocument/);
    assert.match(jvFn, /Date and Time 2/);
    assert.match(jvFn, /Date and Time 3/);
    assert.match(jvFn, /status: 'signed'/);
    assert.doesNotMatch(jvFn, /sendInvite/);
    assert.match(src, /signaturePngWhiteToTransparent/);
    assert.doesNotMatch(src, /drawText\('Signature:'/);
    assert.match(src, /never white out the label/);
    assert.match(src, /typed\/script signature AND hand-drawn/);
  });

  it('requestJvSend imports PDF and marks signed (no pending invite queue)', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/leads-platform/contracts.js'),
      'utf8'
    );
    const fn = src.slice(src.indexOf('async function requestJvSend'), src.indexOf('async function requestAmendmentSend'));
    assert.match(fn, /status: 'signed'/);
    assert.match(fn, /addDealDocument/);
    assert.match(fn, /downloadDocumentPdf/);
    assert.doesNotMatch(fn, /pushSignNowPending/);
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

  it('skips JV for opened/signed team alerts', () => {
    const { shouldNotifySignNowKind } = require('../lib/leads-platform/signnow-send');
    assert.equal(shouldNotifySignNowKind('aoc'), true);
    assert.equal(shouldNotifySignNowKind('amendment'), true);
    assert.equal(shouldNotifySignNowKind('jv'), false);
    assert.equal(shouldNotifySignNowKind('jv_agreement', 'jv'), false);
  });

  it('fills amendment term fields to capacity before wrapping to the next line', () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const lines = splitAcrossLines(text, [50, 50, 50, 50, 50]);
    assert.equal(lines.length, 5);
    assert.ok(lines[0].length >= 40, `expected full first line, got ${lines[0].length}: ${lines[0]}`);
    assert.ok(lines[0].length <= 50);
    const used = lines.filter((l) => l);
    assert.equal(used.join(' '), text);
  });

  it('estimates SignNow text capacity from field width', () => {
    const caps = estimateTextFieldCapacity({ width: 500, height: 18, size: 11 });
    assert.ok(caps >= 90, `expected ~full-width capacity, got ${caps}`);
  });
});

describe('SignNow open detection', () => {
  const {
    detectCounterpartyOpened,
    inviteStatusLooksOpened
  } = require('../lib/leads-platform/signnow-client');

  const team = ['brandon@wunderhausgroup.com', 'buyhomes995@gmail.com'];

  it('treats open/viewed/fulfilled invite statuses as opened', () => {
    assert.equal(inviteStatusLooksOpened('opened'), true);
    assert.equal(inviteStatusLooksOpened('viewed'), true);
    assert.equal(inviteStatusLooksOpened('fulfilled'), true);
    assert.equal(inviteStatusLooksOpened('pending'), false);
    assert.equal(inviteStatusLooksOpened('created'), false);
  });

  it('detects counterparty open from invite status and ignores team', () => {
    const doc = {
      field_invites: [
        { email: 'brandon@wunderhausgroup.com', status: 'fulfilled' },
        { email: 'buyer@example.com', status: 'opened' }
      ]
    };
    const hit = detectCounterpartyOpened(doc, [], { teamEmails: team });
    assert.equal(hit.opened, true);
    assert.equal(hit.byEmail, 'buyer@example.com');
    assert.equal(hit.source, 'invite_status');
  });

  it('detects counterparty open from history events', () => {
    const doc = {
      field_invites: [
        { email: 'brandon@wunderhausgroup.com', status: 'fulfilled' },
        { email: 'seller@example.com', status: 'pending' }
      ]
    };
    const history = [
      { event: 'document_open', email: 'brandon@wunderhausgroup.com' },
      { event: 'document_viewed', email: 'seller@example.com' }
    ];
    const hit = detectCounterpartyOpened(doc, history, { teamEmails: team });
    assert.equal(hit.opened, true);
    assert.equal(hit.byEmail, 'seller@example.com');
    assert.equal(hit.source, 'history');
  });

  it('does not treat team-only opens as counterparty opened', () => {
    const doc = {
      field_invites: [
        { email: 'brandon@wunderhausgroup.com', status: 'fulfilled' },
        { email: 'buyer@example.com', status: 'pending' }
      ]
    };
    const history = [{ event: 'document_open', email: 'brandon@wunderhausgroup.com' }];
    const hit = detectCounterpartyOpened(doc, history, { teamEmails: team });
    assert.equal(hit.opened, false);
  });
});

describe('SignNow alert copy helpers', () => {
  it('labels document kinds for SMS/email subjects', () => {
    const { docKindLabel } = require('../lib/leads-platform/team-notify');
    assert.equal(docKindLabel('aoc'), 'AOC');
    assert.equal(docKindLabel('amendment'), 'Amendment');
    assert.equal(docKindLabel('jv'), 'JV');
  });
});
