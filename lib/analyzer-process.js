const { spawn } = require('child_process');
const path = require('path');
const config = require('./config');
const { checkAnalyzerHealth } = require('./analyzer-proxy');

let analyzerChild = null;

function analyzerRootExists() {
  try {
    const fs = require('fs');
    return fs.existsSync(path.join(config.ANALYZER_PATH, 'server.js'));
  } catch (_) {
    return false;
  }
}

function startAnalyzerProcess() {
  if (analyzerChild) return analyzerChild;

  analyzerChild = spawn('node', ['server.js'], {
    cwd: config.ANALYZER_PATH,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: false,
    env: { ...process.env }
  });

  analyzerChild.stdout.on('data', (d) => process.stdout.write(`[Property Analyzer] ${d}`));
  analyzerChild.stderr.on('data', (d) => process.stderr.write(`[Property Analyzer] ${d}`));
  analyzerChild.on('exit', () => { analyzerChild = null; });

  return analyzerChild;
}

async function ensureAnalyzerRunning({ spawnIfMissing = true } = {}) {
  const health = await checkAnalyzerHealth();
  if (health.ok) return { running: true, spawned: false, health };

  if (!spawnIfMissing) {
    return { running: false, spawned: false, health };
  }

  if (!analyzerRootExists()) {
    return {
      running: false,
      spawned: false,
      health,
      error: `Property Analyzer not found at ${config.ANALYZER_PATH}`
    };
  }

  startAnalyzerProcess();

  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const retry = await checkAnalyzerHealth();
    if (retry.ok) return { running: true, spawned: true, health: retry };
  }

  return { running: false, spawned: true, health };
}

module.exports = {
  ensureAnalyzerRunning,
  startAnalyzerProcess,
  analyzerRootExists
};