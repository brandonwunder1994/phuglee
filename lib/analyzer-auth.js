const fs = require('fs');
const path = require('path');
const config = require('./config');

const AUTH_FILE = path.join('logs', 'pda-auth.token');

function readEnvValueFromAnalyzerDotEnv(key) {
  const envPath = path.join(config.ANALYZER_PATH, '.env');
  if (!fs.existsSync(envPath)) return '';
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const name = trimmed.slice(0, eq).trim();
      if (name !== key) continue;
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val;
    }
  } catch (_) {}
  return '';
}

function readAnalyzerAuthToken() {
  const fromProcessEnv = String(process.env.PDA_AUTH_TOKEN || '').trim();
  if (fromProcessEnv) return fromProcessEnv;

  const fromAnalyzerEnv = readEnvValueFromAnalyzerDotEnv('PDA_AUTH_TOKEN');
  if (fromAnalyzerEnv) return fromAnalyzerEnv;

  const file = path.join(config.ANALYZER_DATA_ROOT, AUTH_FILE);
  if (!fs.existsSync(file)) return '';
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch (_) {
    return '';
  }
}

module.exports = {
  readAnalyzerAuthToken
};