const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeJsonAtomic, cleanupStaleJsonTemps } = require('../lib/write-json-atomic');

test('writeJsonAtomic overwrites existing file and leaves no tmp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wja-'));
  const file = path.join(dir, 'index.json');
  fs.writeFileSync(file, '{"a":1}', 'utf8');
  writeJsonAtomic(file, { a: 2, b: 3 });
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(parsed.a, 2);
  assert.equal(parsed.b, 3);
  const leftover = fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'));
  assert.equal(leftover.length, 0);
});

test('cleanupStaleJsonTemps removes only json.*.tmp orphans', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wja-clean-'));
  const keep = path.join(dir, 'index.json');
  fs.writeFileSync(keep, '{"leads":[]}', 'utf8');
  const tmp = path.join(dir, `index.json.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, '{}', 'utf8');
  const removed = cleanupStaleJsonTemps(dir);
  assert.ok(removed >= 1);
  assert.ok(fs.existsSync(keep));
  assert.equal(fs.existsSync(tmp), false);
});
