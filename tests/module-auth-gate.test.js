const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const auth = require('../lib/phuglee-auth');
const { rejectUnauthorizedModule } = require('../lib/module-auth-gate');

describe('module-auth-gate', () => {
  it('redirects HTML navigations to login=1&return= (homepage auth contract)', () => {
    const prevRequired = auth.isAuthRequired;
    const prevRead = auth.readSessionFromReq;
    auth.isAuthRequired = () => true;
    auth.readSessionFromReq = () => null;

    let status = 0;
    let location = '';
    const req = {
      method: 'GET',
      url: '/analyzer/',
      headers: { accept: 'text/html' }
    };
    const res = {
      writeHead(code, headers) {
        status = code;
        location = headers.Location;
      },
      end() {}
    };

    try {
      const rejected = rejectUnauthorizedModule(req, res, 'Property Analyzer');
      assert.equal(rejected, true);
      assert.equal(status, 302);
      assert.match(location, /^\/\?login=1&return=/);
      assert.equal(location.includes('auth=login'), false);
      assert.equal(decodeURIComponent(location.split('return=')[1]), '/analyzer/');
    } finally {
      auth.isAuthRequired = prevRequired;
      auth.readSessionFromReq = prevRead;
    }
  });

  it('auth.js accepts auth=login and next= aliases used by older redirects', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'auth.js'), 'utf8');
    assert.match(src, /params\.get\('auth'\) === 'login'/);
    assert.match(src, /params\.get\('return'\) \|\| params\.get\('next'\)/);
    assert.match(src, /syncSessionFromServerCookie/);
  });
});
