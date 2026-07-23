const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('buyers-map tries public geo before forge path', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../public/js/buyers-map.js'),
    'utf8'
  );
  assert.match(src, /\/data\/geo\/us-states\.geojson/);
  assert.match(src, /\/forge\/static\/geo\/us-states\.geojson/);
  assert.match(src, /STATES_GEO_URLS/);
  // Must not rely on a single Forge-only constant
  assert.equal(/\bconst STATES_GEO_URL\s*=\s*['"]\/forge\//.test(src), false);
});
