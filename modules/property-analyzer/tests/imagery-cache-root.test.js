const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LEGACY_IMAGERY = path.join('C:', 'Users', 'brand', 'Projects', 'property-distress-analyzer', 'property_imagery');

describe('imagery cache root', () => {
  let previous;

  before(() => {
    previous = process.env.PDA_IMAGERY_ROOT;
    process.env.PDA_IMAGERY_ROOT = LEGACY_IMAGERY;
    delete require.cache[require.resolve('../imagery-cache')];
  });

  after(() => {
    if (previous === undefined) delete process.env.PDA_IMAGERY_ROOT;
    else process.env.PDA_IMAGERY_ROOT = previous;
    delete require.cache[require.resolve('../imagery-cache')];
  });

  it('reads cached street view files from PDA_IMAGERY_ROOT', () => {
    const imageryCache = require('../imagery-cache');
    assert.equal(imageryCache.IMAGERY_DIR, path.resolve(LEGACY_IMAGERY));
    const file = imageryCache.readCachedFile('streetview', 'e899070c1c733c97.jpg');
    assert.ok(file?.body?.length > 1000, 'expected cached Waxahachie street view bytes');
    assert.match(String(file.mimeType || ''), /image\//);
  });

  it('legacy imagery index contains thousands of ok entries', () => {
    const indexPath = path.join(LEGACY_IMAGERY, 'index.json');
    assert.ok(fs.existsSync(indexPath));
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const ok = Object.values(index.entries || {}).filter((e) => e.status === 'ok').length;
    assert.ok(ok > 1000, `expected large legacy cache, got ${ok}`);
  });
});