'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Re-implement the critical regex contract here so we don't export internals —
// keep in sync with shortenGeminiError in routes/gemini.js
function looksLikeRateLimitMessage(msg) {
  return /\brate[\s_-]?limit\b|too many requests|resource_exhausted|quota exceeded|exceeded your current quota/i.test(
    String(msg || '')
  );
}

describe('gemini error shorten contract', () => {
  it('does not treat generateContent as a rate-limit keyword', () => {
    const msg =
      'models/gemini-1.5-flash is not found for API version v1beta, or is not supported for generateContent. Call ModelService.ListModels to see the list of available models and their supported methods.';
    assert.equal(looksLikeRateLimitMessage(msg), false);
  });

  it('still detects real rate-limit wording', () => {
    assert.equal(looksLikeRateLimitMessage('Rate limit exceeded. Try again in 20s.'), true);
    assert.equal(looksLikeRateLimitMessage('RESOURCE_EXHAUSTED'), true);
  });
});
