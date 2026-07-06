const config = require('./config');
const { createModuleProxy } = require('./module-proxy');

const analyzer = createModuleProxy({
  prefix: config.ANALYZER_PREFIX,
  host: config.ANALYZER_HOST,
  port: config.ANALYZER_PORT,
  serviceName: 'Property Analyzer',
  healthPath: '/api/status'
});

module.exports = {
  isAnalyzerRequest: analyzer.isModuleRequest,
  proxyToAnalyzer: analyzer.proxyRequest,
  checkAnalyzerHealth: analyzer.checkHealth,
  ANALYZER_TARGET: analyzer.target
};