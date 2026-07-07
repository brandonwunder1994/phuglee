const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isSessionReadyForServerSave, expectedServerResultCount } = require('../lib/session-save-ready');

describe('session-save-ready', () => {
  it('blocks while background load is in progress', () => {
    assert.equal(isSessionReadyForServerSave({ loading: true, total: 10438, resultsLength: 5000 }), false);
  });

  it('blocks when results are below session total', () => {
    assert.equal(isSessionReadyForServerSave({ loading: false, total: 10438, resultsLength: 8573 }), false);
  });

  it('blocks when results are below server canonical count (total unset)', () => {
    assert.equal(isSessionReadyForServerSave({ loading: false, total: 0, serverCanonical: 10438, resultsLength: 8573 }), false);
  });

  it('blocks when processed exceeds loaded results (stale browser snapshot)', () => {
    assert.equal(isSessionReadyForServerSave({
      loading: false, total: 0, serverCanonical: 0, processed: 10438, resultsLength: 8573
    }), false);
  });

  it('allows save when fully hydrated', () => {
    assert.equal(isSessionReadyForServerSave({ loading: false, total: 10438, serverCanonical: 10438, resultsLength: 10438 }), true);
  });

  it('allows save when no canonical target is known', () => {
    assert.equal(isSessionReadyForServerSave({ loading: false, total: 0, serverCanonical: 0, resultsLength: 100 }), true);
  });

  it('expectedServerResultCount picks the max known target', () => {
    assert.equal(expectedServerResultCount({ total: 8573, serverCanonical: 10438 }), 10438);
  });
});