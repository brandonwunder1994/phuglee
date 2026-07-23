const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('public buyer catalog stubs are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'public/data/buyers/catalog.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'public/data/fund-buyers/catalog.json')), false);
});

test('trust-funds orphan static assets are removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'public/trust-funds.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'public/css/trust-funds.css')), false);
  assert.equal(fs.existsSync(path.join(root, 'public/js/trust-funds-app.js')), false);
});

test('unused logo-hd asset is removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'public/images/phuglee-logo-hd.png')), false);
});

test('home page drops unused video-fallback and dock/preview CSS', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.equal(html.includes('video-fallback.js'), false);
  assert.equal(html.includes('home-ui-preview.css'), false);
  assert.equal(html.includes('coverage-dock.css'), false);
  // Chronicle still styles home-edge content
  assert.match(html, /home-chronicle\.css/);
});

test('dead home explorer modules are removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'public/js/home-guide.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'public/js/home-coverage-explorer.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'public/js/home-coverage-directory.js')), false);
});
