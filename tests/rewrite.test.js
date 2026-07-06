const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rewriteTextBody, rewriteLocationHeader } = require('../lib/rewrite');

test('rewrites HTML root-relative asset paths', () => {
  const html = '<link rel="stylesheet" href="/static/style.css" />';
  const out = rewriteTextBody(html, 'text/html');
  assert.ok(out.includes('href="/forge/static/style.css"'));
});

test('rewrites JS fetch calls', () => {
  const js = 'const res = await fetch("/api/forms");';
  const out = rewriteTextBody(js, 'application/javascript');
  assert.ok(out.includes('fetch("/forge/api/forms"'));
});

test('does not double-prefix paths', () => {
  const html = '<a href="/forge/portal">x</a>';
  const out = rewriteTextBody(html, 'text/html');
  assert.equal(out.match(/\/forge\/forge\//g), null);
});

test('rewrites forge location headers', () => {
  const out = rewriteLocationHeader('http://127.0.0.1:8787/portal');
  assert.equal(out, '/forge/portal');
});