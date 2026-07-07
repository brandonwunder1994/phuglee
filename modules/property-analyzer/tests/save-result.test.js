const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { interpretServerBackupResponse } = require('../lib/save-result');

describe('interpretServerBackupResponse', () => {
  it('reconciles when server already has the canonical backup', () => {
    const out = interpretServerBackupResponse(
      { ok: false, status: 409 },
      { rejected: true, kept: 10438, incoming: 5000 },
      { incomingCount: 5000 }
    );
    assert.equal(out.ok, true);
    assert.equal(out.reconciled, true);
  });

  it('rejects true downgrade blocked saves', () => {
    const out = interpretServerBackupResponse(
      { ok: false, status: 409 },
      { rejected: true, kept: 5000, incoming: 10438 },
      { incomingCount: 10438 }
    );
    assert.equal(out.ok, false);
    assert.equal(out.rejected, true);
    assert.match(out.error, /5000/);
    assert.match(out.error, /10438/);
  });
  it('accepts successful save', () => {
    const out = interpretServerBackupResponse({ ok: true, status: 200 }, { ok: true, results: 100 });
    assert.equal(out.ok, true);
  });
  it('fails on HTTP error without rejection', () => {
    const out = interpretServerBackupResponse({ ok: false, status: 500 }, { error: 'Internal error' });
    assert.equal(out.ok, false);
    assert.equal(out.rejected, undefined);
    assert.match(out.error, /Internal error/);
  });
  it('fails on missing res with true downgrade rejection', () => {
    const out = interpretServerBackupResponse(null, { rejected: true, kept: 5, incoming: 10 }, { incomingCount: 10 });
    assert.equal(out.ok, false);
    assert.equal(out.rejected, true);
  });
});