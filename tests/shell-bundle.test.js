const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('shell-bundle.css is concatenated not import chain', () => {
  const css = fs.readFileSync(
    path.join(__dirname, '../public/css/shell-bundle.css'),
    'utf8'
  );
  assert.equal(/@import\s+url/i.test(css), false);
  assert.ok(css.length > 10_000, `expected real bundle size, got ${css.length}`);
  assert.match(css, /shell-bundle generated/);
});
