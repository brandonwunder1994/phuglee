const { spawn } = require('child_process');
const path = require('path');
const config = require('./config');
const runtime = require('./runtime');
const { checkForgeHealth } = require('./forge-proxy');

let forgeChild = null;

function resolvePythonCommand() {
  if (process.env.PYTHON) return process.env.PYTHON;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function forgeRootExists() {
  try {
    const fs = require('fs');
    return fs.existsSync(path.join(config.FORGE_PATH, 'run_review_portal.py'));
  } catch (_) {
    return false;
  }
}

function startForgeProcess() {
  if (forgeChild) return forgeChild;

  const starter = path.join(config.ROOT, 'scripts', 'start-form-forge.py');
  const python = resolvePythonCommand();

  const env = { ...process.env };
  delete env.PORT;

  forgeChild = spawn(python, [starter], {
    cwd: config.ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: false,
    env
  });

  forgeChild.stdout.on('data', (d) => process.stdout.write(`[Form Forge] ${d}`));
  forgeChild.stderr.on('data', (d) => process.stderr.write(`[Form Forge] ${d}`));
  forgeChild.on('error', (err) => {
    console.error(`[Form Forge] Failed to start (${python}):`, err.message);
    forgeChild = null;
  });
  forgeChild.on('exit', () => { forgeChild = null; });

  return forgeChild;
}

async function ensureForgeRunning({ spawnIfMissing = true } = {}) {
  if (runtime.skipChildProcesses()) {
    const health = await checkForgeHealth();
    return { running: false, spawned: false, health };
  }

  const health = await checkForgeHealth();
  if (health.ok) return { running: true, spawned: false, health };

  if (!spawnIfMissing) {
    return { running: false, spawned: false, health };
  }

  if (!forgeRootExists()) {
    return {
      running: false,
      spawned: false,
      health,
      error: `Form Forge not found at ${config.FORGE_PATH}`
    };
  }

  startForgeProcess();

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const retry = await checkForgeHealth();
    if (retry.ok) return { running: true, spawned: true, health: retry };
  }

  return { running: false, spawned: true, health };
}

function stopForgeProcess() {
  if (forgeChild && !forgeChild.killed) {
    forgeChild.kill();
    forgeChild = null;
  }
}

module.exports = {
  ensureForgeRunning,
  startForgeProcess,
  stopForgeProcess,
  forgeRootExists
};