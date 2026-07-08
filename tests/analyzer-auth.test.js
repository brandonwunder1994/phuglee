const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('readAnalyzerAuthToken prefers analyzer .env PDA_AUTH_TOKEN', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'analyzer-auth-'));
  const analyzerPath = path.join(tmpRoot, 'analyzer');
  fs.mkdirSync(analyzerPath, { recursive: true });
  fs.writeFileSync(path.join(analyzerPath, '.env'), 'PDA_AUTH_TOKEN=from-dotenv\n', 'utf8');

  const configPath = path.join(tmpRoot, 'config.js');
  fs.writeFileSync(configPath, `module.exports = {
    ANALYZER_PATH: ${JSON.stringify(analyzerPath)},
    ANALYZER_DATA_ROOT: ${JSON.stringify(analyzerPath)}
  };`, 'utf8');

  delete require.cache[require.resolve('../lib/analyzer-auth')];
  delete require.cache[configPath];
  const originalConfig = require('../lib/config');
  require.cache[require.resolve('../lib/config')] = { exports: require(configPath) };

  const { readAnalyzerAuthToken } = require('../lib/analyzer-auth');
  assert.equal(readAnalyzerAuthToken(), 'from-dotenv');

  require.cache[require.resolve('../lib/config')] = { exports: originalConfig };
  delete require.cache[require.resolve('../lib/analyzer-auth')];
});