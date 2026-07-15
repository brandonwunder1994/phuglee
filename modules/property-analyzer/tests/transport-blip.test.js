'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

describe('transport blip → retry/defer (not Needs Review)', () => {
  it('detects wrapped Failed to fetch from Street View / Satellite / Imagery', () => {
    const configSrc = fs.readFileSync(path.join(root, 'public/js/config.js'), 'utf8');
    assert.match(configSrc, /isTransportBlipError/);
    assert.match(configSrc, /\\bfailed to fetch\\b/);

    const rawFn = configSrc.match(/R\.isRawFetchTransportError = function isRawFetchTransportError\(msg\) \{[\s\S]*?\n\}/)?.[0];
    const blipFn = configSrc.match(/R\.isTransportBlipError = function isTransportBlipError\(msg\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(rawFn && blipFn, 'classifier functions present in config.js');

    const R = { isHardQuotaError: () => false };
    vm.runInNewContext(`with (R) {\n${rawFn}\n${blipFn}\n}`, { R });

    assert.equal(R.isRawFetchTransportError('Failed to fetch'), true);
    assert.equal(
      R.isTransportBlipError('Street View request failed (Failed to fetch). If this keeps happening, check that launch-analyzer.bat is still running.'),
      true
    );
    assert.equal(
      R.isTransportBlipError('Satellite request failed (Failed to fetch). If this keeps happening, check that launch-analyzer.bat is still running.'),
      true
    );
    assert.equal(
      R.isTransportBlipError('Imagery request failed (Failed to fetch). If this keeps happening, check that launch-analyzer.bat is still running.'),
      true
    );
    assert.equal(R.isTransportBlipError('No Street View at this address'), false);
  });

  it('scan loop defers transport blips instead of buildNeedsReviewResult', () => {
    const appSrc = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
    assert.match(appSrc, /isTransportBlipError/);
    assert.match(appSrc, /network blip; will retry this run \(not marked Needs Review\)/);
    assert.match(appSrc, /network blip left unscanned for next Start Scan/);
  });
});
