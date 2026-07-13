const MAX_BODY_BYTES = 80 * 1024 * 1024; // 80 MB — covers large sessions with headroom

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

async function readBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  let raw = '';
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > maxBytes) {
      const err = new Error('Request body too large');
      err.code = 'BODY_TOO_LARGE';
      err.statusCode = 413;
      try { req.destroy(); } catch (_) {}
      throw err;
    }
    raw += chunk;
  }
  return raw;
}

function corsPreflight(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-PDA-Token, Authorization'
  });
  res.end();
}

module.exports = { sendJson, readBody, corsPreflight, MAX_BODY_BYTES };
