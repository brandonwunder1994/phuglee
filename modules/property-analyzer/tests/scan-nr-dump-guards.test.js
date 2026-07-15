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

  it('incomplete Gemini rethrows / defers — never invents Well Maintained or Unavailable NR', () => {
    assert.match(appSrc, /not inventing Well Maintained/);
    assert.match(appSrc, /will retry this run \(not inventing Well Maintained\)/);
    const fallback = appSrc.match(
      /R\.buildImageryConfirmedFallback = function buildImageryConfirmedFallback[\s\S]*?\n\}/
    )?.[0] || '';
    assert.ok(!/category: 'unavailable'/.test(fallback), 'no unavailable dump in fallback');
    assert.ok(!/defaulting to Well Maintained/i.test(fallback), 'no invent-WM copy in fallback');
  });

  it('fresh import force-scans the whole list (no 2089→702 shrink)', () => {
    assert.match(appSrc, /forceWholeList/);
    assert.match(appSrc, /2089 → ~700/);
    assert.match(appSrc, /Scanning full import list/);
  });

  it('requeues satellite-wipe and incomplete-AI unavailable dumps', () => {
    assert.match(appSrc, /satellite fallback failed/);
    assert.match(appSrc, /satellite also unavailable/);
    assert.match(appSrc, /needs manual review/);
  });
});
