/**
 * Video assets under public/videos/*.mp4 may be gitignored / absent locally.
 * Soft-assert presence; hard-assert graceful fallback wiring on index + heat.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const VIDEOS_DIR = path.join(PUBLIC, 'videos');
const EXPECTED_VIDEOS = ['collect.mp4', 'filter.mp4', 'analyze.mp4'];

test('video-fallback.js exists', () => {
  const fallback = path.join(PUBLIC, 'js', 'video-fallback.js');
  assert.ok(fs.existsSync(fallback), 'public/js/video-fallback.js must exist');
  const src = fs.readFileSync(fallback, 'utf8');
  assert.match(src, /home-video-missing|onError|error/, 'fallback should handle missing videos');
});

test('index.html and heat.html link video-fallback.js', () => {
  for (const page of ['index.html', 'heat.html']) {
    const html = fs.readFileSync(path.join(PUBLIC, page), 'utf8');
    assert.match(
      html,
      /src=["']\/js\/video-fallback\.js/,
      `${page} must reference /js/video-fallback.js`
    );
  }
});

test('pipeline video sources are declared (assets may be absent)', () => {
  const indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  for (const name of EXPECTED_VIDEOS) {
    assert.match(
      indexHtml,
      new RegExp(`/videos/${name.replace('.', '\\.')}`),
      `index.html should reference /videos/${name}`
    );
  }

  const missing = [];
  for (const name of EXPECTED_VIDEOS) {
    if (!fs.existsSync(path.join(VIDEOS_DIR, name))) missing.push(name);
  }
  if (missing.length) {
    // Soft: do not fail CI when mp4s are gitignored — fallback covers 404s.
    console.warn(
      `[video-assets] missing public/videos (ok if gitignored): ${missing.join(', ')} — video-fallback.js must remain linked`
    );
  }
});
