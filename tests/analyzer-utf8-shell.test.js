'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('analyzer index.html is valid UTF-8 (no mojibake)', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../modules/property-analyzer/public/index.html'),
    'utf8'
  );
  assert.equal(html.includes('â€”'), false, 'em dash mojibake');
  assert.equal(html.includes('â†'), false, 'arrow mojibake');
  assert.equal(html.includes('Ã—'), false, 'times mojibake');
  assert.equal(html.includes('Â·'), false, 'middot mojibake');
  assert.match(html, /<main[^>]*\bid=["']main["']/i);
  assert.match(html, /<\/main><!-- \/app-shell-main -->/);
});
