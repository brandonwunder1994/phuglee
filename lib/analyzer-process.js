const { spawn } = require('child_process');
const path = require('path');
const config = require('./config');
const runtime = require('./runtime');
const { checkAnalyzerHealth } = require('./analyzer-proxy');
const embeddedAnalyzer = require('./embedded-analyzer');

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

  const env = { ...process.env };
  delete env.PORT;
  env.PROPERTY_ANALYZER_HOST = config.ANALYZER_HOST;
  env.PROPERTY_ANALYZER_PORT = String(config.ANALYZER_PORT);

  analyzerChild = spawn('node', ['server.js'], {
    cwd: config.ANALYZER_PATH,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: false,
    env
  });

  analyzerChild.stdout.on('data', (d) => process.stdout.write(`[Property Analyzer] ${d}`));
  analyzerChild.stderr.on('data', (d) => process.stderr.write(`[Property Analyzer] ${d}`));
  analyzerChild.on('error', (err) => {
    console.error('[Property Analyzer] Failed to start:', err.message);
    analyzerChild = null;
  });
  analyzerChild.on('exit', () => { analyzerChild = null; });

  return analyzerChild;
}

function externallyBooted() {
  return process.env.FORGE_EXTERNAL_BOOT === '1';
}

async function ensureAnalyzerRunning({ spawnIfMissing = true } = {}) {
  if (runtime.useEmbeddedAnalyzer()) {
    const health = await embeddedAnalyzer.checkEmbeddedAnalyzerHealth();
    return { running: health.ok, spawned: false, health };
  }

  if (externallyBooted()) {
    for (let i = 0; i < 45; i++) {
      const health = await checkAnalyzerHealth();
      if (health.ok) return { running: true, spawned: false, health, external: true };
      await new Promise((r) => setTimeout(r, 1000));
    }
    const health = await checkAnalyzerHealth();
    return {
      running: health.ok,
      spawned: false,
      health,
      external: true,
      error: health.ok ? undefined : 'Property Analyzer started by entrypoint but health check failed'
    };
  }

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

function stopAnalyzerProcess() {
  if (analyzerChild && !analyzerChild.killed) {
    analyzerChild.kill();
    analyzerChild = null;
  }
}

module.exports = {
  ensureAnalyzerRunning,
  startAnalyzerProcess,
  stopAnalyzerProcess,
  analyzerRootExists
};