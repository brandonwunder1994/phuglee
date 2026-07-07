// Vercel serverless entry — all dynamic routes.
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