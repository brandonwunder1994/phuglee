'use strict';

const { readPhugleeUser } = require('../phuglee-user');
const { isAdminUsername } = require('../phuglee-roles');
const { parseMultipart, collectUploadFiles } = require('../multipart');
const { buildOperatingCostsSnapshot } = require('./aggregator');
const { readRateCard, writeRateCard } = require('./rate-card');
const { importGhlExports, listCharges, periodBounds, MAX_FILES_PER_IMPORT } = require('./ghl-import-store');

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

async function readRawBody(req, limitBytes = 25 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      const err = new Error('Upload too large');
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const buf = await readRawBody(req, 256 * 1024);
  const text = buf.toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function requireAdmin(req, res) {
  const user = readPhugleeUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return null;
  }
  if (!isAdminUsername(user)) {
    sendJson(res, 403, { ok: false, error: 'Admin only', code: 'ADMIN_REQUIRED' });
    return null;
  }
  return user;
}

/**
 * @returns {Promise<boolean>} true if handled
 */
async function handle(req, res, pathname, url) {
  if (!pathname.startsWith('/api/admin/operating-costs')) return false;

  if (!requireAdmin(req, res)) return true;

  if (pathname === '/api/admin/operating-costs' && req.method === 'GET') {
    const period = url.searchParams.get('period') || 'current';
    try {
      const snap = await buildOperatingCostsSnapshot(period);
      sendJson(res, 200, snap);
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err.message || String(err),
        code: err.code || 'OPERATING_COSTS_FAILED'
      });
    }
    return true;
  }

  if (pathname === '/api/admin/operating-costs/rate-card' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, rateCard: readRateCard() });
    return true;
  }

  if (pathname === '/api/admin/operating-costs/rate-card' && req.method === 'PATCH') {
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_BODY' });
      return true;
    }
    const rateCard = writeRateCard({
      ghlPlanName: body.ghlPlanName,
      ghlPlanMonthlyUsd: body.ghlPlanMonthlyUsd,
      signnowPlanName: body.signnowPlanName,
      signnowPlanMonthlyUsd: body.signnowPlanMonthlyUsd,
      gcpPromoCreditGrantedUsd: body.gcpPromoCreditGrantedUsd,
      gcpPromoCreditRemainingUsd: body.gcpPromoCreditRemainingUsd,
      notes: body.notes
    });
    sendJson(res, 200, { ok: true, rateCard });
    return true;
  }

  if (pathname === '/api/admin/operating-costs/ghl-charges' && req.method === 'GET') {
    const period = url.searchParams.get('period');
    let from = url.searchParams.get('from');
    let to = url.searchParams.get('to');
    if (period || (!from && !to)) {
      const bounds = periodBounds(period || 'current');
      from = from || bounds.from;
      to = to || bounds.to;
    }
    const category = url.searchParams.get('category') || 'all';
    const result = listCharges({ from, to, category });
    sendJson(res, 200, { ok: true, from, to, ...result });
    return true;
  }

  if (pathname === '/api/admin/operating-costs/ghl-import' && req.method === 'POST') {
    try {
      const contentType = String(req.headers['content-type'] || '');
      if (!contentType.includes('multipart/form-data')) {
        sendJson(res, 400, {
          ok: false,
          error: 'Expected multipart/form-data upload',
          code: 'INVALID_CONTENT_TYPE'
        });
        return true;
      }
      const buffer = await readRawBody(req, 40 * 1024 * 1024);
      const { files } = parseMultipart(buffer, contentType);
      const uploads = collectUploadFiles(files);
      if (!uploads.length) {
        sendJson(res, 400, { ok: false, error: 'No file uploaded', code: 'NO_FILE' });
        return true;
      }
      if (uploads.length > MAX_FILES_PER_IMPORT) {
        sendJson(res, 400, {
          ok: false,
          error: `Upload up to ${MAX_FILES_PER_IMPORT} files at a time`,
          code: 'TOO_MANY_FILES'
        });
        return true;
      }
      const result = await importGhlExports(
        uploads.map((f) => ({ data: f.data, filename: f.filename || 'ghl-export.csv' }))
      );
      sendJson(res, 200, result);
    } catch (err) {
      const status =
        err.code === 'GHL_PARSE_COLUMNS' ||
        err.code === 'GHL_PDF_EMPTY' ||
        err.code === 'GHL_PARSE_UNSUPPORTED' ||
        err.code === 'TOO_MANY_FILES' ||
        err.code === 'NO_FILE'
          ? 400
          : err.code === 'PAYLOAD_TOO_LARGE'
            ? 413
            : 500;
      sendJson(res, status, {
        ok: false,
        error: err.message || String(err),
        code: err.code || 'GHL_IMPORT_FAILED',
        headers: err.headers || undefined,
        fileResults: err.fileResults || undefined
      });
    }
    return true;
  }

  sendJson(res, 404, { ok: false, error: 'Not found', code: 'NOT_FOUND' });
  return true;
}

module.exports = { handle };
