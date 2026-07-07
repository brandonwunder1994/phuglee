const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../lib/fs-atomic');

const ROOT = path.join(__dirname, '..');
const testDir = path.join(ROOT, 'logs', 'atomic-write-test');
const target = path.join(testDir, 'sample.json');
const payload = JSON.stringify({ ok: true, ts: Date.now(), nested: { a: [1, 2, 3] } });

fs.mkdirSync(testDir, { recursive: true });

writeFileAtomic(target, payload);
const parsed1 = JSON.parse(fs.readFileSync(target, 'utf8'));
if (!parsed1.ok) throw new Error('parse failed after write');

const payload2 = JSON.stringify({ ok: true, ts: Date.now(), pass: 2 });
writeFileAtomic(target, payload2);
const parsed2 = JSON.parse(fs.readFileSync(target, 'utf8'));
if (parsed2.pass !== 2) throw new Error('overwrite failed');

const orphans = fs.readdirSync(testDir).filter((f) => f.endsWith('.tmp'));
if (orphans.length) throw new Error('orphan tmp files: ' + orphans.join(', '));

console.log('atomic-write smoke test: PASS');
process.exit(0);