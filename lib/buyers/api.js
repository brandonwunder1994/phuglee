'use strict';

const { readPhugleeUser } = require('../phuglee-user');
const { isContractDeskUsername } = require('../phuglee-roles');
const { readCatalog, addBuyer, findBuyer } = require('./store');

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

async function readJsonBody(req, limitBytes = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      const err = new Error('Payload too large');
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function requireDesk(req, res) {
  const user = readPhugleeUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return null;
  }
  if (!isContractDeskUsername(user)) {
    sendJson(res, 403, { ok: false, error: 'Contract desk only', code: 'FORBIDDEN' });
    return null;
  }
  return user;
}

/**
 * @returns {Promise<boolean>} true if handled
 */
async function handle(req, res, pathname) {
  if (!pathname.startsWith('/api/buyers')) return false;

  if (pathname === '/api/buyers' && req.method === 'GET') {
    if (!requireDesk(req, res)) return true;
    try {
      const catalog = readCatalog();
      sendJson(res, 200, { ok: true, catalog });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
    return true;
  }

  if (pathname === '/api/buyers' && req.method === 'POST') {
    if (!requireDesk(req, res)) return true;
    const body = await readJsonBody(req);
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const { catalog, buyer } = addBuyer(body);
      sendJson(res, 201, { ok: true, buyer, catalog });
    } catch (err) {
      const status = err.code === 'VALIDATION' ? 400 : 500;
      sendJson(res, status, { ok: false, error: err.message || String(err), code: err.code || 'ERROR' });
    }
    return true;
  }

  const one = /^\/api\/buyers\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  if (one && req.method === 'GET') {
    if (!requireDesk(req, res)) return true;
    const buyer = findBuyer(one[1]);
    if (!buyer) {
      sendJson(res, 404, { ok: false, error: 'Buyer not found', code: 'NOT_FOUND' });
      return true;
    }
    sendJson(res, 200, { ok: true, buyer });
    return true;
  }

  sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  return true;
}

module.exports = { handle };
