/**
 * Minimal multipart/form-data parser for bridge / operating-costs file uploads.
 * Buffer-based so PDF binary payloads cannot split the form on a coincidental
 * boundary byte sequence (latin1 string .split was unsafe).
 */

function parseContentDisposition(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(';').map((p) => p.trim());
  out.type = parts[0] || '';
  for (const part of parts.slice(1)) {
    const star = part.match(/^([^=]+)\*=([^']*)'[^']*'(.+)$/i);
    if (star) {
      const key = star[1].toLowerCase().replace(/\*$/, '');
      try {
        out[key] = decodeURIComponent(star[3]);
      } catch (_) {
        out[key] = star[3];
      }
      continue;
    }
    const match = part.match(/^([^=]+)="([^"]*)"$/) || part.match(/^([^=]+)=([^;]+)$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

function extractBoundary(contentType) {
  const m = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) return null;
  return (m[1] || m[2] || '').trim();
}

/**
 * Split a multipart body into raw part buffers (headers + body), excluding
 * the final closing delimiter. Only splits on real wire delimiters:
 *   --boundary\r\n  (first) /  \r\n--boundary\r\n  /  \r\n--boundary--
 */
function splitMultipartParts(buffer, boundary) {
  const dashBoundary = Buffer.from(`--${boundary}`);
  const parts = [];
  let pos = 0;

  // First delimiter may be at byte 0 (optional leading preamble ignored).
  const first = buffer.indexOf(dashBoundary, 0);
  if (first < 0) return parts;
  pos = first + dashBoundary.length;

  while (pos < buffer.length) {
    // After --boundary comes \r\n (part) or -- (close)
    if (buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) {
      break; // closing --
    }
    if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) {
      pos += 2;
    }

    const nextDelim = Buffer.from(`\r\n--${boundary}`);
    const next = buffer.indexOf(nextDelim, pos);
    if (next < 0) {
      // Malformed / truncated — take remainder if any
      if (pos < buffer.length) parts.push(buffer.subarray(pos));
      break;
    }
    parts.push(buffer.subarray(pos, next));
    pos = next + nextDelim.length;
  }

  return parts;
}

function parsePart(partBuf) {
  const sep = Buffer.from('\r\n\r\n');
  const splitAt = partBuf.indexOf(sep);
  if (splitAt < 0) return null;

  const headerBlock = partBuf.subarray(0, splitAt).toString('utf8');
  let body = partBuf.subarray(splitAt + sep.length);
  // Trailing CRLF before next boundary delimiter is already excluded by the splitter.

  const headers = {};
  for (const line of headerBlock.split(/\r\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
  }
  const disposition = parseContentDisposition(headers['content-disposition']);
  const name = disposition.name;
  if (!name) return null;

  const filename = disposition.filename || null;
  if (filename) {
    return {
      kind: 'file',
      name,
      entry: {
        filename,
        data: Buffer.from(body),
        mimeType: headers['content-type'] || 'application/octet-stream'
      }
    };
  }
  return {
    kind: 'field',
    name,
    value: body.toString('utf8')
  };
}

function parseMultipart(buffer, contentType) {
  const boundary = extractBoundary(contentType);
  if (!boundary) throw new Error('Missing multipart boundary');

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const rawParts = splitMultipartParts(buf, boundary);
  const fields = {};
  const files = {};

  for (const partBuf of rawParts) {
    const parsed = parsePart(partBuf);
    if (!parsed) continue;
    if (parsed.kind === 'file') {
      const { name, entry } = parsed;
      if (Object.prototype.hasOwnProperty.call(files, name)) {
        if (!Array.isArray(files[name])) files[name] = [files[name]];
        files[name].push(entry);
      } else {
        files[name] = entry;
      }
    } else {
      fields[parsed.name] = parsed.value;
    }
  }

  return { fields, files };
}

/** Normalize files.file / files.files (and files[]) to a flat array (0..n). */
function collectUploadFiles(files) {
  const bag = files && typeof files === 'object' ? files : {};
  const out = [];
  const keys = new Set([...Object.keys(bag), 'file', 'files', 'files[]', 'file[]']);
  for (const key of keys) {
    const val = bag[key];
    if (!val) continue;
    if (Array.isArray(val)) out.push(...val);
    else out.push(val);
  }
  // De-dupe by identity in case both files and files[] exist
  const seen = new Set();
  return out.filter((f) => {
    if (!f || !f.data) return false;
    const id = `${f.filename}|${f.data.length}|${f.data[0]}|${f.data[f.data.length - 1]}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

module.exports = { parseMultipart, collectUploadFiles, extractBoundary };
