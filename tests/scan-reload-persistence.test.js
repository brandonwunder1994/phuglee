'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('scan reload persistence guards', () => {
  it('sessionDataRank ignores empty serverAuthoritative stubs', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../modules/property-analyzer/public/js/state.js'),
      'utf8'
    );
    assert.match(src, /serverAuthoritative === true && !\(data\.results \|\| \[\]\)\.length/);
    assert.match(src, /Stubs are KPI hints only/);
  });

  it('analyzer scope prefers login cookie over headers', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../modules/property-analyzer/lib/user-session.js'),
      'utf8'
    );
    assert.match(src, /readSessionFromReq/);
    assert.match(src, /phuglee-auth\.js/);
  });

  it('auth-session syncs username from /api/auth/me', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../public/js/auth-session.js'),
      'utf8'
    );
    assert.match(src, /\/api\/auth\/me/);
    assert.match(src, /syncSessionFromServerCookie/);
  });

  it('server exposes /api/auth/me', () => {
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(src, /pathname === '\/api\/auth\/me'/);
  });
});
