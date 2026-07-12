/**
 * Minimal .env loader (no dependency). Does not override existing process.env.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

function loadEnvFile(filePath) {
  const resolved = filePath || path.join(config.ROOT, '.env');
  if (!fs.existsSync(resolved)) return { loaded: false, path: resolved };
  const text = fs.readFileSync(resolved, 'utf8');
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = val;
      count += 1;
    }
  }
  return { loaded: true, path: resolved, count };
}

module.exports = { loadEnvFile };
