/**
 * Propelio comp report file storage — per-lead folders under LEADS_COMP_REPORTS_ROOT.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');

const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const MIME_EXT = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

function safeLeadId(leadId) {
  const safe = String(leadId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!safe) {
    const err = new Error('Invalid lead id');
    err.code = 'INVALID_LEAD_ID';
    throw err;
  }
  return safe;
}

function sanitizeFilename(filename) {
  const raw = String(filename || '').trim();
  const base = path.basename(raw);
  const ext = path.extname(base).slice(0, 8).toLowerCase();
  const stem = path.basename(base, path.extname(base))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 64) || 'report';
  return `${stem}${ext}`;
}

function leadReportDir(leadId) {
  return path.join(config.LEADS_COMP_REPORTS_ROOT, safeLeadId(leadId));
}

function mimeFromFilename(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function saveCompReportFile(leadId, { buffer, filename, mime }) {
  const mimeType = String(mime || '').trim().toLowerCase();
  if (!ALLOWED_MIMES.has(mimeType)) {
    const err = new Error('Unsupported mime type');
    err.code = 'UNSUPPORTED_MIME';
    throw err;
  }

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) {
    const err = new Error('Empty file');
    err.code = 'EMPTY_FILE';
    throw err;
  }
  if (buf.length > MAX_BYTES) {
    const err = new Error('File too large (max 25MB)');
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  const id = crypto.randomBytes(8).toString('hex');
  const sanitized = sanitizeFilename(filename);
  let ext = path.extname(sanitized);
  if (!ext) ext = MIME_EXT[mimeType] || '';
  const stem = path.basename(sanitized, path.extname(sanitized));
  const diskName = `${id}_${stem}${ext}`;

  const dir = leadReportDir(leadId);
  fs.mkdirSync(dir, { recursive: true });
  const absPath = path.join(dir, diskName);
  fs.writeFileSync(absPath, buf);

  const relPath = path.posix.join(safeLeadId(leadId), diskName);

  return {
    id,
    filename: sanitized,
    mime: mimeType,
    size: buf.length,
    uploadedAt: new Date().toISOString(),
    path: relPath,
  };
}

function readCompReportFile(leadId, fileId) {
  const safeId = safeLeadId(leadId);
  const fid = String(fileId || '').replace(/[^a-fA-F0-9]/g, '').slice(0, 32);
  if (!fid) {
    const err = new Error('Invalid file id');
    err.code = 'INVALID_FILE_ID';
    throw err;
  }

  const dir = leadReportDir(leadId);
  if (!fs.existsSync(dir)) {
    const err = new Error('File not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const entries = fs.readdirSync(dir);
  const match = entries.find((name) => name.startsWith(`${fid}_`));
  if (!match) {
    const err = new Error('File not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const absPath = path.join(dir, match);
  const filename = match.slice(fid.length + 1);

  return {
    path: absPath,
    mime: mimeFromFilename(filename),
    filename,
  };
}

module.exports = {
  saveCompReportFile,
  readCompReportFile,
  safeLeadId,
  sanitizeFilename,
  MAX_BYTES,
  ALLOWED_MIMES,
};
