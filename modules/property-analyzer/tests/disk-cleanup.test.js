'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isDiskSpaceError } = require('../lib/disk-cleanup');

describe('disk-cleanup', () => {
  it('detects ENOSPC and no-space-left messages', () => {
    assert.equal(isDiskSpaceError({ code: 'ENOSPC', message: 'write' }), true);
    assert.equal(isDiskSpaceError('ENOSPC: no space left on device, write'), true);
    assert.equal(isDiskSpaceError('Street View rate limit'), false);
  });
});