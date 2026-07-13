const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

const SCAN_SOURCES = [
  path.join(ROOT, 'public', 'js', 'app.js'),
  path.join(ROOT, 'public', 'js', 'session.js'),
  path.join(ROOT, 'public', 'js', 'scan.js'),
  path.join(ROOT, 'lib', 'retier-without-vision.js')
].filter((p) => fs.existsSync(p));

const FORBIDDEN_IN_SCAN_FLOW = [
  /\brmSync\s*\(/,
  /\bfs\.rm\s*\(/,
  /\bfs\.rmdir\s*\(/,
  /\btruncateSync\s*\(/,
  /\bunlinkSync\s*\([^)]*distressAnalyzerSession/,
  /\bunlinkSync\s*\([^)]*property_imagery/,
  /\bwriteFileSync\s*\([^)]*distressAnalyzerSession[^)]*''/,
  /\bclearAllLists\b/,
  /\bwipeSession\b/i
];

describe('data-safety — scan pipeline must not delete operator data', () => {
  for (const file of SCAN_SOURCES) {
    it(`${path.basename(file)} avoids destructive filesystem ops on session/imagery`, () => {
      const src = fs.readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_IN_SCAN_FLOW) {
        assert.equal(pattern.test(src), false, `Forbidden pattern ${pattern} in ${file}`);
      }
    });
  }

  it('docker entrypoint does not overwrite non-stub live session', () => {
    const entry = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'docker-entrypoint.sh'), 'utf8');
    assert.ok(entry.includes('STUB_MAX_BYTES'));
    assert.ok(entry.includes('Keeping live Analyze session'));
  });

  it('scale-policy retier does not call vision APIs', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'retier-without-vision.js'), 'utf8');
    assert.ok(!src.includes('callGeminiVision'));
    assert.ok(!src.includes('classifyWithSatellite'));
  });
});
