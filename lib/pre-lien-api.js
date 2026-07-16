'use strict';

const config = require('./config');
const { readPhugleeUser } = require('./phuglee-user');
const { parseMultipart, collectUploadFiles } = require('./multipart');
const { extractComplaintFromText, toFilterRows, rowsToCsv, dedupePreLienRows, stampPlaybookPlace } = require('./pre-lien-extract');
const { enrichRowsWithOwnerMatch, lookupAvailable } = require('./pre-lien-owner-lookup');
const { resolveComplaintPdfText } = require('./pre-lien-pdf-text');

const MAX_FILES = 25;
const MAX_BYTES = 25 * 1024 * 1024;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error('Upload is too large');
      err.code = 'BODY_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function readPlaceHints(source = {}) {
  const place = source.place && typeof source.place === 'object' ? source.place : source;
  return {
    state: String(place.state || place.placeState || '').trim(),
    county: String(place.county || place.placeCounty || '').trim(),
    city: String(place.city || place.placeCity || '').trim()
  };
}

async function extractFromPdfFile(file) {
  const buffer = file.data || file.buffer;
  const resolved = await resolveComplaintPdfText(buffer);
  const text = String(resolved.text || '').trim();
  if (!text) {
    return {
      ok: false,
      sourceFile: file.filename,
      error: resolved.ocrError
        ? `OCR failed (${resolved.ocrError}) — paste complaint text instead`
        : 'No extractable text after OCR — paste complaint text instead',
      fromOcr: Boolean(resolved.fromOcr)
    };
  }
  const row = extractComplaintFromText(text, { sourceFile: file.filename });
  if (resolved.fromOcr) {
    row.descriptionNotes = [row.descriptionNotes, 'Source: OCR scan']
      .filter(Boolean)
      .join(' · ')
      .slice(0, 400);
  }
  return {
    ok: true,
    row,
    textChars: text.length,
    fromOcr: Boolean(resolved.fromOcr),
    ocrConfidence: resolved.ocrConfidence,
    ocrTruncated: Boolean(resolved.ocrTruncated),
    ocrPageCapNote: resolved.ocrPageCapNote || null
  };
}

async function handleExtract(req, res) {
  const user = readPhugleeUser(req);
  if (!config.AUTH_DISABLED && !user) {
    sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('multipart/form-data')) {
    sendJson(res, 400, { ok: false, error: 'Expected multipart PDF upload', code: 'BAD_CONTENT_TYPE' });
    return;
  }

  let buffer;
  try {
    buffer = await readBody(req, MAX_BYTES);
  } catch (err) {
    const code = err.code === 'BODY_TOO_LARGE' ? 413 : 400;
    sendJson(res, code, { ok: false, error: err.message || 'Upload failed', code: err.code || 'UPLOAD_ERROR' });
    return;
  }

  let files;
  let fields = {};
  try {
    const parsed = parseMultipart(buffer, contentType);
    fields = parsed.fields || {};
    files = collectUploadFiles(parsed.files).filter((f) => /\.pdf$/i.test(f.filename || ''));
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message || 'Bad multipart', code: 'MULTIPART_ERROR' });
    return;
  }

  if (!files.length) {
    sendJson(res, 400, { ok: false, error: 'Upload one or more .pdf complaint files', code: 'NO_PDF' });
    return;
  }
  if (files.length > MAX_FILES) {
    sendJson(res, 400, {
      ok: false,
      error: `Max ${MAX_FILES} PDFs per batch`,
      code: 'TOO_MANY_FILES'
    });
    return;
  }

  const place = readPlaceHints(fields);
  const results = [];
  const errors = [];
  let ocrUsed = 0;
  const ocrNotes = [];
  for (const file of files) {
    try {
      const out = await extractFromPdfFile(file);
      if (out.ok) {
        results.push(out.row);
        if (out.fromOcr) ocrUsed += 1;
        if (out.ocrPageCapNote) ocrNotes.push(out.ocrPageCapNote);
      } else {
        errors.push({ file: file.filename, error: out.error, fromOcr: out.fromOcr });
      }
    } catch (err) {
      errors.push({ file: file.filename, error: err.message || 'Extract failed' });
    }
  }

  const placed = stampPlaybookPlace(toFilterRows(results), place);
  let enriched = placed.rows;
  let matchStats = null;
  try {
    const out = await enrichRowsWithOwnerMatch(enriched, { lookup: true });
    enriched = out.rows;
    matchStats = out.stats;
  } catch (_) {
    /* keep extracted rows if match fails */
  }
  const deduped = dedupePreLienRows(enriched);
  enriched = deduped.rows;

  sendJson(res, 200, {
    ok: true,
    count: enriched.length,
    rows: enriched,
    errors,
    csv: rowsToCsv(enriched),
    ownerMatch: matchStats,
    dedupe: { removed: deduped.removed, before: deduped.before },
    placeStamp: { stamped: placed.stamped, place },
    ocr: { used: ocrUsed, note: ocrNotes[0] || null },
    lookupAvailable: lookupAvailable(),
    tip: lookupAvailable()
      ? 'Owner lookup ran automatically. Review matched rows, then Download matched for skip.'
      : 'Set REALESTATE_API_KEY in .env to auto-lookup owners (defendant ≈ owner). Then download matched CSV for your skip tool.'
  });
}

async function handleExtractText(req, res) {
  const user = readPhugleeUser(req);
  if (!config.AUTH_DISABLED && !user) {
    sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  let buffer;
  try {
    buffer = await readBody(req, 2 * 1024 * 1024);
  } catch (err) {
    sendJson(res, 413, { ok: false, error: 'Text too large', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }

  let body;
  try {
    body = JSON.parse(buffer.toString('utf8') || '{}');
  } catch (_) {
    sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
    return;
  }

  const texts = Array.isArray(body.texts)
    ? body.texts
    : (body.text ? [body.text] : []);
  if (!texts.length) {
    sendJson(res, 400, { ok: false, error: 'Provide text or texts[]', code: 'MISSING_TEXT' });
    return;
  }

  const results = texts.map((t, i) =>
    extractComplaintFromText(String(t || ''), { sourceFile: body.sourceFile || `paste-${i + 1}` })
  );
  const place = readPlaceHints(body);
  const placed = stampPlaybookPlace(toFilterRows(results), place);
  let enriched = placed.rows;
  let matchStats = null;
  try {
    const out = await enrichRowsWithOwnerMatch(enriched, { lookup: true });
    enriched = out.rows;
    matchStats = out.stats;
  } catch (_) { /* keep extracted */ }
  const deduped = dedupePreLienRows(enriched);
  enriched = deduped.rows;

  sendJson(res, 200, {
    ok: true,
    count: enriched.length,
    rows: enriched,
    csv: rowsToCsv(enriched),
    ownerMatch: matchStats,
    dedupe: { removed: deduped.removed, before: deduped.before },
    placeStamp: { stamped: placed.stamped, place },
    lookupAvailable: lookupAvailable()
  });
}

async function handleOwnerMatch(req, res) {
  const user = readPhugleeUser(req);
  if (!config.AUTH_DISABLED && !user) {
    sendJson(res, 401, { ok: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  let buffer;
  try {
    buffer = await readBody(req, 4 * 1024 * 1024);
  } catch (_) {
    sendJson(res, 413, { ok: false, error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }

  let body;
  try {
    body = JSON.parse(buffer.toString('utf8') || '{}');
  } catch (_) {
    sendJson(res, 400, { ok: false, error: 'Invalid JSON', code: 'INVALID_JSON' });
    return;
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) {
    sendJson(res, 400, { ok: false, error: 'rows[] required', code: 'MISSING_ROWS' });
    return;
  }

  const place = readPlaceHints(body);
  const placed = stampPlaybookPlace(rows, place);
  const out = await enrichRowsWithOwnerMatch(placed.rows, { lookup: body.lookup !== false });
  const deduped = dedupePreLienRows(out.rows);
  sendJson(res, 200, {
    ok: true,
    count: deduped.rows.length,
    rows: deduped.rows,
    csv: rowsToCsv(deduped.rows),
    ownerMatch: out.stats,
    dedupe: { removed: deduped.removed, before: deduped.before },
    placeStamp: { stamped: placed.stamped, place },
    lookupAvailable: out.lookupAvailable
  });
}

async function handle(req, res, pathname) {
  if (pathname === '/api/pre-lien/extract' && req.method === 'POST') {
    await handleExtract(req, res);
    return true;
  }
  if (pathname === '/api/pre-lien/extract-text' && req.method === 'POST') {
    await handleExtractText(req, res);
    return true;
  }
  if (pathname === '/api/pre-lien/owner-match' && req.method === 'POST') {
    await handleOwnerMatch(req, res);
    return true;
  }
  return false;
}

module.exports = {
  handle,
  handleExtract,
  handleExtractText,
  handleOwnerMatch,
  extractFromPdfFile
};
