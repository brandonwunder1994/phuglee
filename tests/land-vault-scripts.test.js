const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('land-vault has auth-guard but not homepage auth.js', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../public/land-vault.html'),
    'utf8'
  );
  assert.match(html, /auth-guard\.js/);
  assert.equal(/\/js\/auth\.js/.test(html), false);
});
