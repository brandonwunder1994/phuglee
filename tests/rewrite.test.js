const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRewriter } = require('../lib/rewrite');

const forgeRewriter = createRewriter({
  prefix: '/forge',
  targetHost: '127.0.0.1',
  targetPort: 8787
});

const analyzerRewriter = createRewriter({
  prefix: '/analyzer',
  targetHost: '127.0.0.1',
  targetPort: 3456
});

test('rewrites HTML root-relative asset paths', () => {
  const html = '<link rel="stylesheet" href="/static/style.css" />';
  const out = forgeRewriter.rewriteTextBody(html, 'text/html');
  assert.ok(out.includes('href="/forge/static/style.css"'));
});

test('rewrites JS fetch calls', () => {
  const js = 'const res = await fetch("/api/forms");';
  const out = forgeRewriter.rewriteTextBody(js, 'application/javascript');
  assert.ok(out.includes('fetch("/forge/api/forms"'));
});

test('rewrites apiFetch calls for Property Analyzer', () => {
  const js = "const res = await apiFetch('/api/session-backup');";
  const out = analyzerRewriter.rewriteTextBody(js, 'application/javascript');
  assert.ok(out.includes("apiFetch('/analyzer/api/session-backup'"));
});

test('does not double-prefix paths', () => {
  const html = '<a href="/forge/portal">x</a>';
  const out = forgeRewriter.rewriteTextBody(html, 'text/html');
  assert.equal(out.match(/\/forge\/forge\//g), null);
});

test('rewrites module location headers', () => {
  const out = forgeRewriter.rewriteLocationHeader('http://127.0.0.1:8787/portal');
  assert.equal(out, '/forge/portal');
});

test('rewrites analyzer location headers', () => {
  const out = analyzerRewriter.rewriteLocationHeader('http://127.0.0.1:3456/');
  assert.equal(out, '/analyzer/');
});

test('rewrites template literal fetch calls', () => {
  const js = 'const res = await fetch(`/api/portal/city/${encodeURIComponent(id)}`);';
  const out = forgeRewriter.rewriteTextBody(js, 'application/javascript');
  assert.ok(out.includes('fetch(`/forge/api/portal/city/${encodeURIComponent(id)}`)'));
});

test('rewrites template literal postJson calls', () => {
  const js = 'await postJson(`/api/portal/city/${id}/submit`, { notes });';
  const out = forgeRewriter.rewriteTextBody(js, 'application/javascript');
  assert.ok(out.includes('postJson(`/forge/api/portal/city/${id}/submit`'));
});