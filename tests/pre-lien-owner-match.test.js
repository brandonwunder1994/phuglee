'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreDefendantVsOwner,
  bestScoreAgainstOwners,
  extractOwnersFromDetailRaw,
  applyOwnerMatchToRow
} = require('../lib/pre-lien-owner-match');
const { enrichRowsWithOwnerMatch } = require('../lib/pre-lien-owner-lookup');

test('exact / last+first name scores as matched', () => {
  const exact = scoreDefendantVsOwner('John Q Public', 'John Q Public');
  assert.equal(exact.verdict, 'matched');
  assert.ok(exact.score >= 90);

  const lastFirst = scoreDefendantVsOwner('JOHN PUBLIC', 'John Q Public');
  assert.equal(lastFirst.verdict, 'matched');
});

test('tenant / different last name is no_match', () => {
  const miss = scoreDefendantVsOwner('Tenant Renter', 'John Q Public');
  assert.equal(miss.verdict, 'no_match');
});

test('last name only is possible', () => {
  const maybe = scoreDefendantVsOwner('Robert Public', 'John Public');
  assert.equal(maybe.verdict, 'possible');
});

test('extractOwnersFromDetailRaw reads ownerInfo', () => {
  const owners = extractOwnersFromDetailRaw({
    data: {
      ownerInfo: {
        owner1FullName: 'Caryn Glickman',
        owner1FirstName: 'Caryn',
        owner1LastName: 'Glickman',
        mailAddress: { label: '1433 Canyon Rd, Santa Fe, Nm 87501' }
      }
    }
  });
  assert.equal(owners.ownerName, 'Caryn Glickman');
  assert.match(owners.mailingAddress, /Canyon/i);
});

test('enrichRowsWithOwnerMatch scores provided owner without API', async () => {
  const { rows, stats, lookupAvailable } = await enrichRowsWithOwnerMatch([
    {
      streetAddress: '123 Main St',
      city: 'Newark',
      state: 'OH',
      defendantName: 'John Public',
      ownerName: 'John Q Public'
    }
  ], { lookup: false });
  assert.equal(lookupAvailable, false);
  assert.equal(rows[0].ownerMatch, 'matched');
  assert.equal(stats.matched, 1);
});

test('applyOwnerMatchToRow sets Filter fields', () => {
  const row = applyOwnerMatchToRow(
    { streetAddress: '1 Oak', defendantName: 'Jane Doe' },
    {
      score: 92,
      verdict: 'matched',
      reason: 'Last name + given name token match',
      matchedOwner: 'Jane A Doe',
      ownerName: 'Jane A Doe',
      ownerNames: ['Jane A Doe'],
      mailingAddress: 'PO Box 1'
    }
  );
  assert.equal(row.ownerMatch, 'matched');
  assert.equal(row.ownerName, 'Jane A Doe');
  assert.equal(row.ownerMatchScore, 92);
});

test('bestScoreAgainstOwners picks strongest owner', () => {
  const best = bestScoreAgainstOwners('John Public', ['Acme LLC', 'John Q Public']);
  assert.equal(best.verdict, 'matched');
  assert.match(best.matchedOwner, /John/i);
});
