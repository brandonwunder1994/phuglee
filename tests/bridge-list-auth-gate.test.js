'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('bridge list destructive gates', () => {
  it('clear and delete-many call requireAdmin', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../lib/bridge-api.js'),
      'utf8'
    );
    assert.match(
      src,
      /async function handleListClearAll[\s\S]*?requireAdmin\(req\)/
    );
    assert.match(
      src,
      /async function handleListDeleteMany[\s\S]*?requireAdmin\(req\)/
    );
  });
});
