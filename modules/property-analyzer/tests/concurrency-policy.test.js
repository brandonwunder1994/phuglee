'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('analyze concurrency policy', () => {
  it('keeps a 5–50 worker band and avoids global fleet freezes', () => {
    const configSrc = fs.readFileSync(path.join(root, 'public/js/config.js'), 'utf8');
    assert.match(configSrc, /MAX_SAFE_CONCURRENT\s*=\s*50/);
    assert.match(configSrc, /MIN_CONCURRENT_LIMIT\s*=\s*5/);
    assert.match(configSrc, /DEFAULT_CONCURRENT_LIMIT\s*=\s*25/);
    assert.match(configSrc, /SCALE_DOWN_COOLDOWN_MS/);
    assert.match(configSrc, /Math\.min\(Math\.max\(remaining,\s*0\),\s*2500\)/);

    const appSrc = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
    assert.match(appSrc, /await sleep\(40\)/);
    assert.match(appSrc, /Math\.min\(getEffectiveConcurrentLimit\(\),\s*round\.length\)/);

    const geminiSrc = fs.readFileSync(path.join(root, 'routes/gemini.js'), 'utf8');
    assert.match(geminiSrc, /GEMINI_MAX_CONCURRENT\s*=\s*50/);
    assert.match(geminiSrc, /req\.setTimeout/);

    const mapsSrc = fs.readFileSync(path.join(root, 'routes/maps.js'), 'utf8');
    assert.match(mapsSrc, /MAPS_MAX_CONCURRENT\s*=\s*60/);
  });
});
