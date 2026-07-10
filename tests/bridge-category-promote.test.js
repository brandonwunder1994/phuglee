/**
 * MAP-01 / MAP-03 unit matrix for category promotion from unmapped headers.
 * Pure helpers only — no engine, no fs.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  isCategoryLikeHeader,
  promoteCategoryFromRaw
} = require('../lib/bridge-category-promote');

test('isCategoryLikeHeader accepts category-like headers', () => {
  assert.equal(isCategoryLikeHeader('Vio Cat'), true);
  assert.equal(isCategoryLikeHeader('Category'), true);
  assert.equal(isCategoryLikeHeader('Case Type'), true);
});

test('isCategoryLikeHeader rejects narrative headers', () => {
  assert.equal(isCategoryLikeHeader('Description'), false);
  assert.equal(isCategoryLikeHeader('Notes'), false);
  assert.equal(isCategoryLikeHeader('Comments'), false);
});

test('promoteCategoryFromRaw copies first unmapped Vio Cat cell', () => {
  const headers = ['Property Address', 'Vio Cat', 'Notes'];
  const columnMap = {
    streetAddress: 'Property Address',
    descriptionNotes: 'Notes'
    // violationIssueType intentionally unmapped
  };
  const rawRow = {
    'Property Address': '100 Main St',
    'Vio Cat': 'High Grass',
    Notes: 'admin'
  };
  const mapped = { violationIssueType: '', descriptionNotes: 'admin' };
  assert.equal(
    promoteCategoryFromRaw(rawRow, headers, columnMap, mapped),
    'High Grass'
  );
});

test('promoteCategoryFromRaw does not overwrite existing type', () => {
  const headers = ['Property Address', 'Vio Cat'];
  const columnMap = { streetAddress: 'Property Address' };
  const rawRow = { 'Property Address': '1 A', 'Vio Cat': 'High Grass' };
  const mapped = { violationIssueType: 'Trash' };
  assert.equal(
    promoteCategoryFromRaw(rawRow, headers, columnMap, mapped),
    'Trash'
  );
});

test('promoteCategoryFromRaw returns empty for notes/description only (MAP-03)', () => {
  const headers = ['Property Address', 'Notes', 'Description'];
  const columnMap = {
    streetAddress: 'Property Address',
    descriptionNotes: 'Description'
  };
  const rawRow = {
    'Property Address': '1 A',
    Notes: 'overgrown weeds everywhere',
    Description: 'tall grass and trash pile'
  };
  const mapped = { violationIssueType: '', descriptionNotes: 'tall grass and trash pile' };
  assert.equal(promoteCategoryFromRaw(rawRow, headers, columnMap, mapped), '');
});

test('promoteCategoryFromRaw rejects timestamp-only cells', () => {
  const headers = ['Property Address', 'Vio Cat'];
  const columnMap = { streetAddress: 'Property Address' };
  const rawRow = {
    'Property Address': '1 A',
    'Vio Cat': '01/15/2024 10:30'
  };
  const mapped = { violationIssueType: '' };
  assert.equal(promoteCategoryFromRaw(rawRow, headers, columnMap, mapped), '');
});

test('promoteCategoryFromRaw rejects cells longer than 120 chars', () => {
  const headers = ['Property Address', 'Vio Cat'];
  const columnMap = { streetAddress: 'Property Address' };
  const longNarrative = 'x'.repeat(121);
  const rawRow = {
    'Property Address': '1 A',
    'Vio Cat': longNarrative
  };
  const mapped = { violationIssueType: '' };
  assert.equal(promoteCategoryFromRaw(rawRow, headers, columnMap, mapped), '');
});

test('promoteCategoryFromRaw picks first category-like header in order', () => {
  const headers = ['Property Address', 'Case Type', 'Vio Cat'];
  const columnMap = { streetAddress: 'Property Address' };
  const rawRow = {
    'Property Address': '1 A',
    'Case Type': 'Fence Permit',
    'Vio Cat': 'High Grass'
  };
  const mapped = { violationIssueType: '' };
  assert.equal(
    promoteCategoryFromRaw(rawRow, headers, columnMap, mapped),
    'Fence Permit'
  );
});

test('promoteCategoryFromRaw skips empty category cell and uses next', () => {
  const headers = ['Property Address', 'Case Type', 'Vio Cat'];
  const columnMap = { streetAddress: 'Property Address' };
  const rawRow = {
    'Property Address': '1 A',
    'Case Type': '   ',
    'Vio Cat': 'High Grass'
  };
  const mapped = { violationIssueType: '' };
  assert.equal(
    promoteCategoryFromRaw(rawRow, headers, columnMap, mapped),
    'High Grass'
  );
});
