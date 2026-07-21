/**
 * DESK-05 — Filter DOM contract freeze (Phase 75)
 * Static HTML/JS greps — no browser. Locks IDs + data-* spine for v3.0 restyles.
 * Complementary: bridge-desk-cinema.test.js, bridge-train-theater.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'bridge.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge.js'), 'utf8');
const trainJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'bridge-train.js'), 'utf8');

const BANNED_CTAS = [
  'Send to Analyze',
  'Push to Analyze',
  'Import to Analyzer',
  'Open in Analyze',
  'Push to Analyzer'
];

// ── Core scrub-path IDs ────────────────────────────────────────────────────

test('DESK-05: critical scrub path IDs present in HTML', () => {
  const ids = [
    'bridge-scrub-stage',
    'bridge-dropzone',
    'bridge-process',
    'bridge-type-panel',
    'bridge-upload-panel',
    'bridge-mission-surface',
    'bridge-save-list',
    'bridge-save-panel',
    'bridge-train-wrap',
    'bridge-victory-strip',
    'bridge-type-column-confirm-dialog'
  ];
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`), `missing id="${id}"`);
  }
});

// ── Train structure (fail-closed) ──────────────────────────────────────────

test('DESK-05: train wrap default hidden; mission inside wrap', () => {
  assert.match(html, /id="bridge-train-wrap"[^>]*\bhidden\b/);
  assert.match(html, /id="bridge-train-mission"/);

  const wrapOpen = html.indexOf('id="bridge-train-wrap"');
  const missionOpen = html.indexOf('id="bridge-train-mission"');
  assert.ok(wrapOpen >= 0 && missionOpen > wrapOpen, 'mission must appear after train-wrap open');

  const wrapTagEnd = html.indexOf('>', wrapOpen);
  const attachIdx = html.indexOf('id="bridge-attach-panel"');
  assert.ok(missionOpen < attachIdx, 'train-mission must be before attach scrap in document order');
  assert.ok(wrapTagEnd < missionOpen, 'train-mission must be after train-wrap tag opens');
});

test('DESK-05: save climax before train wrap; attach scrap demoted', () => {
  const saveIdx = html.indexOf('id="bridge-save-panel"');
  const trainIdx = html.indexOf('id="bridge-train-wrap"');
  const attachIdx = html.indexOf('id="bridge-attach-panel"');
  assert.ok(saveIdx >= 0 && trainIdx > saveIdx, 'save-panel before train-wrap');
  assert.ok(attachIdx > trainIdx, 'attach after train region');
  assert.match(html, /bridge-save-panel--climax/);
  assert.match(html, /bridge-attach-panel--scrap/);
});

// ── data-mode / data-format / radios ───────────────────────────────────────

test('DESK-05: data-mode kept|train|brain on mode tabs', () => {
  assert.match(html, /id="bridge-mode-kept"[^>]*data-mode="kept"/);
  assert.match(html, /id="bridge-mode-train"[^>]*data-mode="train"/);
  assert.match(html, /id="bridge-mode-brain"[^>]*data-mode="brain"/);
});

test('DESK-05: victory flash-download + slogans; data-format csv', () => {
  assert.match(html, /id="bridge-victory-download"[^>]*data-action="flash-download"/);
  assert.match(html, /id="bridge-victory-download"[^>]*data-format="csv"/);
  assert.match(html, /List staged/);
  assert.match(html, /Download for Review/);
  assert.match(html, /Scrub next city/);
  assert.match(html, /id="bridge-victory-next"/);
});

test('DESK-05: radio name bridge-upload-type code_violation + water_shut_off', () => {
  assert.match(html, /name="bridge-upload-type" value="code_violation"/);
  assert.match(html, /name="bridge-upload-type" value="water_shut_off"/);
  // Dual-class allowed (e.g. bridge-type-chips phuglee-chip-group from Phase 77+)
  assert.match(html, /class="[^"]*\bbridge-type-chips\b[^"]*"/);
  assert.equal(html.includes('bridge-type-card'), false);
});

// ── JS still binds critical IDs ────────────────────────────────────────────

test('DESK-05: bridge.js getElementById spine for process/train/victory/dropzone', () => {
  assert.match(js, /getElementById\('bridge-process'\)/);
  assert.match(js, /getElementById\('bridge-train-wrap'\)/);
  assert.match(js, /getElementById\('bridge-victory-download'\)/);
  assert.match(js, /getElementById\('bridge-dropzone'\)/);
  assert.match(js, /getElementById\('bridge-save-list'\)/);
  assert.match(js, /getElementById\('bridge-type-column-confirm-dialog'\)/);
});

// ── data-action emit contracts ─────────────────────────────────────────────

test('DESK-05: data-action approve|deny still emitted in train templates', () => {
  const hasApprove = /data-action="approve"/.test(js) || /data-action="approve"/.test(trainJs);
  const hasDeny = /data-action="deny"/.test(js) || /data-action="deny"/.test(trainJs);
  assert.equal(hasApprove, true, 'approve action missing from bridge.js / bridge-train.js');
  assert.equal(hasDeny, true, 'deny action missing from bridge.js / bridge-train.js');
});

test('DESK-05: list data-action download|rename|delete|select in bridge.js', () => {
  assert.match(js, /data-action="download"/);
  assert.match(js, /data-action="rename"/);
  assert.match(js, /data-action="delete"/);
  assert.match(js, /data-action="select"/);
  assert.match(js, /data-format="csv"/);
  assert.match(js, /data-format="xlsx"/);
});

// ── Banned Analyze push ────────────────────────────────────────────────────

test('DESK-05: no banned Analyze push CTAs in HTML/JS', () => {
  for (const banned of BANNED_CTAS) {
    assert.equal(html.includes(banned), false, `HTML must not contain "${banned}"`);
    assert.equal(js.includes(banned), false, `JS must not contain "${banned}"`);
  }
});

// ── Pipeline banner removed (operator preference) ──────────────────────────

test('DESK-05: slim 1–4 pipeline banner not rendered', () => {
  assert.doesNotMatch(html, /id="bridge-pipeline"/);
  assert.doesNotMatch(html, /data-step="location"/);
});

// ── Native dialogs ─────────────────────────────────────────────────────────

test('DESK-05: type-confirm and history remain native dialogs with fixed control IDs', () => {
  assert.match(html, /<dialog[^>]*id="bridge-type-column-confirm-dialog"/);
  assert.match(html, /id="bridge-type-column-confirm-ok"/);
  assert.match(html, /id="bridge-type-column-confirm-cancel"/);
  assert.match(html, /id="bridge-type-column-confirm-close"/);
  assert.match(html, /<dialog[^>]*id="bridge-history-dialog"/);
  assert.match(html, /id="bridge-history-close"/);
  assert.match(html, /id="bridge-history-list"/);
});
