const { spawn } = require('child_process');
const path = require('path');
const config = require('./config');
const runtime = require('./runtime');
const { checkForgeHealth } = require('./forge-proxy');

let forgeChild = null;
let forgeStarting = null;
let restartTimer = null;
let restartAttempts = 0;

const BOOT_POLLS = Number(process.env.FORGE_BOOT_POLLS || 90);
const BOOT_INTERVAL_MS = Number(process.env.FORGE_BOOT_INTERVAL_MS || 1000);
const MAX_RESTART_ATTEMPTS = Number(process.env.FORGE_MAX_RESTARTS || 8);

function resolvePythonCommand() {
  if (process.env.PYTHON) return process.env.PYTHON;
  if (process.platform !== 'win32') {
    const fs = require('fs');
    for (const candidate of ['/usr/bin/python3', '/usr/local/bin/python3', 'python3']) {
      if (candidate.startsWith('/') && fs.existsSync(candidate)) return candidate;
      if (!candidate.startsWith('/')) return candidate;
    }
    return 'python3';
  }
  return 'python';
}

function forgeRootExists() {
  try {
    const fs = require('fs');
    return fs.existsSync(path.join(config.FORGE_PATH, 'run_review_portal.py'));
  } catch (_) {
    return false;
  }
}

function childLogPrefix(chunk) {
  return `[Form Forge] ${chunk}`;
}

function startForgeProcess() {
  if (forgeChild) return forgeChild;

  const starter = path.join(config.ROOT, 'scripts', 'start-form-forge.py');
  const python = resolvePythonCommand();

  const env = { ...process.env };
  delete env.PORT;
  env.FORM_FORGE_HOST = config.FORGE_HOST;
  env.FORM_FORGE_PORT = String(config.FORGE_PORT);
  env.PYTHONUNBUFFERED = '1';
  if (!env.PYTHON) {
    env.PYTHON = resolvePythonCommand();
  }

  const inheritLogs = process.env.NODE_ENV === 'production' || process.env.FORGE_LOG_INHERIT === '1';
  const stdio = inheritLogs ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'];

  console.log(`[Form Forge] Starting: ${python} -u ${starter}`);
  forgeChild = spawn(python, ['-u', starter], {
    cwd: config.ROOT,
    stdio,
    windowsHide: true,
    detached: false,
    env
  });

  if (!inheritLogs) {
    forgeChild.stdout.on('data', (d) => process.stdout.write(childLogPrefix(d)));
    forgeChild.stderr.on('data', (d) => process.stderr.write(childLogPrefix(d)));
  }

  forgeChild.on('error', (err) => {
    console.error(`[Form Forge] Failed to start (${python}):`, err.message);
    forgeChild = null;
  });

  forgeChild.on('exit', (code, signal) => {
    forgeChild = null;
    if (runtime.skipChildProcesses()) return;
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.warn(`[Form Forge] Process exited (${reason})`);
    scheduleForgeRestart();
  });

  return forgeChild;
}

function scheduleForgeRestart() {
  if (restartTimer || runtime.skipChildProcesses()) return;
  if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
    console.error(`[Form Forge] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached`);
    return;
  }
  restartAttempts += 1;
  const delay = Math.min(15000, 2000 * restartAttempts);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    ensureForgeRunning({ spawnIfMissing: true }).catch((err) => {
      console.error('[Form Forge] Restart failed:', err.message);
    });
  }, delay);
}

async function waitForForgeHealth() {
  for (let i = 0; i < BOOT_POLLS; i++) {
    await new Promise((r) => setTimeout(r, BOOT_INTERVAL_MS));
    const retry = await checkForgeHealth();
    if (retry.ok) {
      restartAttempts = 0;
      return retry;
    }
  }
  return checkForgeHealth();
}

function externallyBooted() {
  return process.env.FORGE_EXTERNAL_BOOT === '1';
}

async function ensureForgeRunning({ spawnIfMissing = true } = {}) {
  if (runtime.skipChildProcesses()) {
    const health = await checkForgeHealth();
    return { running: false, spawned: false, health };
  }

  if (externallyBooted()) {
    const health = await waitForForgeHealth();
    return {
      running: health.ok,
      spawned: false,
      health,
      external: true,
      error: health.ok ? undefined : 'Form Forge started by entrypoint but health check failed'
    };
  }

  if (forgeStarting) return forgeStarting;

  forgeStarting = (async () => {
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
    const retry = await waitForForgeHealth();
    if (retry.ok) {
      return { running: true, spawned: true, health: retry };
    }

    return { running: false, spawned: true, health: retry };
  })();

  try {
    return await forgeStarting;
  } finally {
    forgeStarting = null;
  }
}

function stopForgeProcess() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
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