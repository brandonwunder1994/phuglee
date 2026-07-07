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

module.exports = {
  isForgeRequest: forge.isModuleRequest,
  proxyToForge: forge.proxyRequest,
  checkForgeHealth: forge.checkHealth,
  FORGE_TARGET: forge.target
};