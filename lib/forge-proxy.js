const config = require('./config');
const { createModuleProxy } = require('./module-proxy');

const forge = createModuleProxy({
  prefix: config.FORGE_PREFIX,
  host: config.FORGE_HOST,
  port: config.FORGE_PORT,
  serviceName: 'Form Forge',
  healthPath: '/api/health'
});

module.exports = {
  isForgeRequest: forge.isModuleRequest,
  proxyToForge: forge.proxyRequest,
  checkForgeHealth: forge.checkHealth,
  FORGE_TARGET: forge.target
};