const config = require('./config');
const runtime = require('./runtime');
const { createModuleProxy } = require('./module-proxy');

function forgeProxyOptions() {
  const remote = runtime.remoteForgeUrl();
  if (remote) {
    return {
      prefix: config.FORGE_PREFIX,
      baseUrl: remote,
      serviceName: 'Form Forge',
      healthPath: '/api/health'
    };
  }
  return {
    prefix: config.FORGE_PREFIX,
    host: config.FORGE_HOST,
    port: config.FORGE_PORT,
    serviceName: 'Form Forge',
    healthPath: '/api/health'
  };
}

const forge = createModuleProxy(forgeProxyOptions());

async function proxyToForge(req, res, pathname, search) {
  if (!runtime.remoteForgeUrl()) {
    const { ensureForgeRunning } = require('./forge-process');
    const boot = await ensureForgeRunning({ spawnIfMissing: true });
    if (!boot.running) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: 'Form Forge unavailable',
        detail: boot.error || boot.health?.error || 'startup timed out'
      }));
      return;
    }
  }
  forge.proxyRequest(req, res, pathname, search);
}

module.exports = {
  isForgeRequest: forge.isModuleRequest,
  proxyToForge,
  checkForgeHealth: forge.checkHealth,
  FORGE_TARGET: forge.target
};