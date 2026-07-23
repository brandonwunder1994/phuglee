const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('auth-guard awaits cookie sync before sign-in redirect when session empty', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../public/js/auth-guard.js'),
    'utf8'
  );
  assert.match(src, /syncSessionFromServerCookie/);
  assert.match(
    src,
    /syncSessionFromServerCookie\s*\(\s*\)\s*\.then/,
    'must chain .then on cookie sync before redirect'
  );
  assert.match(src, /phuglee_logout/);
  // Must not only call redirectToSignIn() immediately in the empty-session path
  // without a sync attempt when PhugleeSession is present.
  assert.match(src, /Cookie may still be valid|hydrate before bounce/);
});
