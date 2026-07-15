'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');

describe('scan Must not dump good street calls into Needs Review', () => {
  it('satellite catch keeps property/vacant street classifications', () => {
    assert.match(appSrc, /do NOT wipe a successful Street View classification/);
    assert.match(appSrc, /qualityFlags\.push\('satellite_failed'\)/);
    // Must not set unavailable for every satErr — only when street was already unusable.
    const catchBlock = appSrc.match(/catch \(satErr\) \{[\s\S]*?\n      \}/)?.[0] || '';
    assert.ok(catchBlock.includes("streetCat === 'unavailable'"), 'only wipe when street unavailable');
    assert.ok(catchBlock.includes('finalizePropertyDistress'), 'keep street call on sat throw');
  });

  it('incomplete Gemini with Street View defaults to property, not unavailable NR', () => {
    assert.match(appSrc, /never dump into Unavailable\/Needs Review just because Gemini JSON/);
    assert.match(appSrc, /Omit low invented confidence/);
    const fallback = appSrc.match(
      /R\.buildImageryConfirmedFallback = function buildImageryConfirmedFallback[\s\S]*?\n\}/
    )?.[0] || '';
    assert.ok(fallback.includes("category: 'property'"), 'property default with imagery');
    assert.ok(!/category: 'unavailable'/.test(fallback), 'no unavailable dump in fallback');
  });

  it('requeues satellite-wipe and incomplete-AI unavailable dumps', () => {
    assert.match(appSrc, /satellite fallback failed/);
    assert.match(appSrc, /satellite also unavailable/);
    assert.match(appSrc, /needs manual review/);
  });
});
