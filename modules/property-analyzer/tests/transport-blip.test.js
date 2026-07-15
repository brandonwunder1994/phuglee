'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadTransportClassifiers() {
  const configSrc = fs.readFileSync(path.join(root, 'public/js/config.js'), 'utf8');
  const rawFn = configSrc.match(/R\.isRawFetchTransportError = function isRawFetchTransportError\(msg\) \{[\s\S]*?\n\}/)?.[0];
  const proxyFn = configSrc.match(/R\.isProxyInfraError = function isProxyInfraError\(msg\) \{[\s\S]*?\n\}/)?.[0];
  const blipFn = configSrc.match(/R\.isTransportBlipError = function isTransportBlipError\(msg\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(rawFn && proxyFn && blipFn, 'classifier functions present in config.js');
  const R = { isHardQuotaError: () => false };
  vm.runInNewContext(`with (R) {\n${rawFn}\n${proxyFn}\n${blipFn}\n}`, { R });
  return R;
}

describe('transport blip → retry/defer (not Needs Review)', () => {
  it('detects wrapped Failed to fetch from Street View / Satellite / Imagery', () => {
    const R = loadTransportClassifiers();

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

  it('detects Railway/proxy deploy blips as transport (not Needs Review)', () => {
    const R = loadTransportClassifiers();
    assert.equal(R.isProxyInfraError('Gemini request failed (Unexpected token \'<\', "<html>... is not valid JSON)'), true);
    assert.equal(R.isTransportBlipError('Street View request failed (502 Bad Gateway)'), true);
    assert.equal(R.isProxyInfraError('Application failed to respond'), true);
  });

  it('scan loop never falls through transport peers into buildNeedsReviewResult', () => {
    const appSrc = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
    assert.match(appSrc, /isTransportBlipError/);
    assert.match(appSrc, /isProxyInfraError/);
    assert.match(appSrc, /network blip; will retry this run \(not marked Needs Review\)/);
    assert.match(appSrc, /network\/proxy blip left unscanned for next Start Scan/);
    // Peer workers after serverStopAlertShown must break — not fall through to NR dump.
    assert.match(appSrc, /every worker MUST break/);
    assert.match(appSrc, /requeueGlitchedIncompleteScans/);
  });
});
