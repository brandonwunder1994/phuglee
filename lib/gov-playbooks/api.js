'use strict';

const config = require('../config');
const { readPhugleeUser } = require('../phuglee-user');
const {
  readCatalog,
  getPlaybook,
  upsertPlaybook,
  deletePlaybook
} = require('./store');

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

async function readJsonBody(req, limitBytes = 512 * 1024) {
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

function requireUser(req, res) {
  if (config.AUTH_DISABLED) {
    return { username: 'admin', plan: 'max' };
  }
  const username = readPhugleeUser(req);
  if (!username) {
    sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return null;
  }
  return { username, plan: '' };
}

async function handle(req, res, pathname) {
  if (!pathname.startsWith('/api/gov-playbooks')) return false;

  if (pathname === '/api/gov-playbooks' && req.method === 'GET') {
    if (!requireUser(req, res)) return true;
    const catalog = readCatalog();
    sendJson(res, 200, { ok: true, ...catalog, count: catalog.playbooks.length });
    return true;
  }

  const one = pathname.match(/^\/api\/gov-playbooks\/([^/]+)$/);
  if (one && req.method === 'GET') {
    if (!requireUser(req, res)) return true;
    const pb = getPlaybook(decodeURIComponent(one[1]));
    if (!pb) {
      sendJson(res, 404, { ok: false, error: 'Playbook not found', code: 'NOT_FOUND' });
      return true;
    }
    sendJson(res, 200, { ok: true, playbook: pb });
    return true;
  }

  if (pathname === '/api/gov-playbooks' && req.method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return true;
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
        ok: false,
        error: err.message || 'Bad body',
        code: err.code || 'BAD_BODY'
      });
      return true;
    }
    if (body === null) {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
      return true;
    }
    try {
      const playbook = upsertPlaybook(body.playbook || body, { username: user.username || '' });
      sendJson(res, 200, { ok: true, playbook });
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        error: err.message || 'Save failed',
        code: err.code || 'SAVE_FAILED'
      });
    }
    return true;
  }

  if (one && req.method === 'DELETE') {
    const user = requireUser(req, res);
    if (!user) return true;
    const id = decodeURIComponent(one[1]);
    const ok = deletePlaybook(id);
    if (!ok) {
      sendJson(res, 404, { ok: false, error: 'Playbook not found', code: 'NOT_FOUND' });
      return true;
    }
    sendJson(res, 200, { ok: true, deleted: id });
    return true;
  }

  return false;
}

module.exports = { handle };
