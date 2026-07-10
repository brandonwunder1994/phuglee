/**
 * Minimal multipart/form-data parser for bridge file uploads.
 */

function parseContentDisposition(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(';').map((p) => p.trim());
  out.type = parts[0] || '';
  for (const part of parts.slice(1)) {
    const match = part.match(/^([^=]+)="?([^"]+)"?$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = String(contentType || '').match(/boundary=([^;]+)/i);
  if (!boundaryMatch) throw new Error('Missing multipart boundary');
  const boundary = `--${boundaryMatch[1].trim()}`;
  const text = buffer.toString('latin1');
  const parts = text.split(boundary).slice(1, -1);
  const fields = {};
  const files = {};

  for (const part of parts) {
    const chunk = part.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const splitAt = chunk.indexOf('\r\n\r\n');
    if (splitAt < 0) continue;
    const headerBlock = chunk.slice(0, splitAt);
    const body = chunk.slice(splitAt + 4).replace(/\r\n$/, '');
    const headers = {};
    for (const line of headerBlock.split('\r\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
    }
    const disposition = parseContentDisposition(headers['content-disposition']);
    const name = disposition.name;
    if (!name) continue;
    if (disposition.filename) {
      const entry = {
        filename: disposition.filename,
        data: Buffer.from(body, 'latin1'),
        mimeType: headers['content-type'] || 'application/octet-stream'
      };
      // Same field name repeated (multi-file upload) → array; single stays object for BC
      if (Object.prototype.hasOwnProperty.call(files, name)) {
        if (!Array.isArray(files[name])) files[name] = [files[name]];
        files[name].push(entry);
      } else {
        files[name] = entry;
      }
    } else {
      fields[name] = body;
    }
  }

  return { fields, files };
}

/** Normalize files.file / files.files to a flat array (0..n). */
function collectUploadFiles(files) {
  const bag = files && typeof files === 'object' ? files : {};
  const out = [];
  for (const key of ['file', 'files']) {
    const val = bag[key];
    if (!val) continue;
    if (Array.isArray(val)) out.push(...val);
    else out.push(val);
  }
  return out;
}

module.exports = { parseMultipart, collectUploadFiles };