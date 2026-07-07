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
      files[name] = {
        filename: disposition.filename,
        data: Buffer.from(body, 'latin1'),
        mimeType: headers['content-type'] || 'application/octet-stream'
      };
    } else {
      fields[name] = body;
    }
  }

  return { fields, files };
}

module.exports = { parseMultipart };