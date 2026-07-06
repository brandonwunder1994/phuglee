const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

function readPage(name) {
  return fs.readFileSync(path.join(PUBLIC, name), 'utf8');
}

function hasOgTags(html) {
  return html.includes('property="og:title"')
    && html.includes('property="og:description"')
    && html.includes('property="og:image"');
}

test('home page has SEO and a11y CSS', () => {
  const html = readPage('index.html');
  assert.ok(html.includes('meta name="description"'));
  assert.ok(hasOgTags(html));
  assert.ok(html.includes('phuglee-a11y.css'));
  assert.ok(html.includes('phuglee-skip-link'));
});

test('heat page has SEO meta and OG tags', () => {
  const html = readPage('heat.html');
  assert.ok(html.includes('meta name="description"'));
  assert.ok(hasOgTags(html));
  assert.ok(html.includes('id="main"'));
});

test('bridge page has SEO meta and OG tags', () => {
  const html = readPage('bridge.html');
  assert.ok(html.includes('meta name="description"'));
  assert.ok(hasOgTags(html));
});

test('collect page has SEO meta and OG tags', () => {
  const html = readPage('collect.html');
  assert.ok(html.includes('meta name="description"'));
  assert.ok(hasOgTags(html));
});

test('phuglee-a11y.css defines focus ring token', () => {
  const css = fs.readFileSync(path.join(PUBLIC, 'css', 'phuglee-a11y.css'), 'utf8');
  assert.ok(css.includes('--phuglee-focus-ring'));
  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('prefers-reduced-motion'));
});