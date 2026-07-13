'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { readBody, MAX_BODY_BYTES } = require('../modules/property-analyzer/lib/http');

function fakeReq(chunks) {
  const req = new EventEmitter();
  req.destroy = () => {};
  process.nextTick(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  // Make for-await work via async iterator
  req[Symbol.asyncIterator] = async function* () {
    for (const chunk of chunks) yield chunk;
  };
  return req;
}

describe('analyzer readBody size limit', () => {
  it('returns body under the limit', async () => {
    const body = await readBody(fakeReq(['hello', ' ', 'world']));
    assert.equal(body, 'hello world');
  });

  it('rejects oversized bodies with 413', async () => {
    const big = Buffer.alloc(1024, 97); // 1KB chunk
    const chunks = [];
    // Force over limit with maxBytes override for a fast test
    const maxBytes = 2048;
    while (Buffer.concat(chunks).length <= maxBytes) chunks.push(big);
    await assert.rejects(
      () => readBody(fakeReq(chunks), { maxBytes }),
      (err) => {
        assert.equal(err.code, 'BODY_TOO_LARGE');
        assert.equal(err.statusCode, 413);
        return true;
      }
    );
  });

  it('exports a large default max (covers mega sessions)', () => {
    assert.ok(MAX_BODY_BYTES >= 60 * 1024 * 1024);
  });
});
