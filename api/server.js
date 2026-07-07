// Vercel serverless entry — all dynamic routes.
// Force serverless mode before loading the shell (some deployments omit VERCEL env at cold start).
process.env.VERCEL = process.env.VERCEL || '1';
process.env.ANALYZER_EMBEDDED = '1';

const { handleRequest } = require('../server');

module.exports = async (req, res) => {
  if (!req.headers) req.headers = {};
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error('[Distress OS] Vercel handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Internal server error');
    }
  }
};