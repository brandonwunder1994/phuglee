const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('analyze mobile nav toggle is not hard-hidden in HTML', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../modules/property-analyzer/public/index.html'),
    'utf8'
  );
  assert.match(html, /id=["']analyzeMobileNavToggle["']/);
  assert.equal(html.includes('hidden hidden'), false);
  // Button should not carry a bare hidden attribute that defeats CSS mobile show
  const m = html.match(/<button[^>]*id=["']analyzeMobileNavToggle["'][^>]*>/);
  assert.ok(m);
  assert.equal(/\shidden(\s|>)/.test(m[0]), false);
});
