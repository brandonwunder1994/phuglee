const config = require('./config');
const { createModuleProxy } = require('./module-proxy');
const { getPdaAuthToken } = require('./pda-auth-token');

const TOKEN_SCRIPT_RE = /<script>\s*window\.__PDA_AUTH_TOKEN__\s*=\s*[\s\S]*?<\/script>\s*/gi;

const analyzer = createModuleProxy({
  prefix: config.ANALYZER_PREFIX,
  host: config.loopbackHost(config.ANALYZER_HOST),
  port: config.ANALYZER_PORT,
  serviceName: 'Property Analyzer',
  healthPath: '/api/status',
  maxBodyBytes: 80_000_000,
  prepareHeaders({ headers }) {
    const tok = getPdaAuthToken();
    if (tok) headers['x-pda-token'] = tok;
  },
  prepareResponseBody(body, contentType) {
    if (!/html/i.test(String(contentType || ''))) return body;
    // Never leak the service bearer to the browser when proxied through the shell.
    return String(body || '').replace(TOKEN_SCRIPT_RE, '');
  }
});

module.exports = {
  isAnalyzerRequest: analyzer.isModuleRequest,
  proxyToAnalyzer: analyzer.proxyRequest,
  checkAnalyzerHealth: analyzer.checkHealth,
  ANALYZER_TARGET: analyzer.target
};
