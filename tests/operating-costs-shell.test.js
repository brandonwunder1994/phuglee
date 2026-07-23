const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('operating-costs loads settings-menu before shell-nav and includes team-alert', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../public/operating-costs.html'),
    'utf8'
  );
  const settings = html.indexOf('settings-menu.js');
  const nav = html.indexOf('shell-nav.js');
  assert.ok(settings >= 0 && nav >= 0);
  assert.ok(settings < nav, 'settings-menu must precede shell-nav');
  assert.match(html, /team-alert-banner\.js/);
});
