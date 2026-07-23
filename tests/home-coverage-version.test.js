const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('home-coverage.js version stamp is unified', () => {
  const files = ['index.html', 'heat.html', 'command.html'];
  const versions = new Set();
  for (const f of files) {
    const html = fs.readFileSync(path.join(__dirname, '../public', f), 'utf8');
    const m = html.match(/home-coverage\.js\?v=([^"']+)/);
    assert.ok(m, `missing home-coverage.js version in ${f}`);
    versions.add(m[1]);
  }
  assert.equal(versions.size, 1, `expected one version, got ${[...versions].join(', ')}`);
});
