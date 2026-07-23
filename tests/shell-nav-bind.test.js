const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('shell-nav binds document Escape once across remounts', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../public/js/shell-nav.js'),
    'utf8'
  );
  assert.match(src, /documentEscapeBound/);
  assert.match(src, /if\s*\(\s*!documentEscapeBound\s*\)/);
  assert.match(src, /Escape/);
});
