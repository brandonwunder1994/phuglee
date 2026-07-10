const { hasUsableStreetAddress } = require('../../bridge-intake-schema');

const HEADER_HINT_RE = /\b(address|location|street|property|site|service|violation|issue|notice|date|description)\b/i;
const ADDRESS_IN_LINE_RE = /\b(\d{1,6}\s+[A-Za-z0-9#./'\-]+(?:\s+[A-Za-z0-9#./'\-]+){0,6})\b/;

function normalizeLines(text) {
  let s = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\f/g, '\n')
    // pdf-parse v2 page markers
    .replace(/\n--\s*\d+\s+of\s+\d+\s*--\n/gi, '\n');

  // Many PDFs emit one long line (or a few) with double-space column/row gaps.
  // Only un-glue when the doc is nearly single-line — never slice real multi-row tables.
  const rough = s.split('\n').map((l) => l.trim()).filter(Boolean);
  const houseHits = (s.match(/\b\d{1,6}\s+[A-Za-z#]/g) || []).length;
  const maxLine = Math.max(0, ...rough.map((l) => l.length));
  const canUnglue =
    houseHits >= 2 &&
    /[ \t]{2,}\d{1,6}\s+[A-Za-z#]/.test(s) &&
    (rough.length <= 2 || (rough.length < 6 && maxLine >= 160));
  if (canUnglue) {
    s = s.replace(/(?<=\S)[ \t]{2,}(?=\d{1,6}\s+[A-Za-z#])/g, '\n');
  }

  return s
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function countDelimiter(line, delimiter) {
  if (delimiter === 'space') return (line.match(/\s{2,}/g) || []).length;
  return (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
}

function detectLineDelimiter(line) {
  const counts = [
    { delimiter: '\t', count: countDelimiter(line, '\t') },
    { delimiter: '|', count: countDelimiter(line, '|') },
    { delimiter: ',', count: countDelimiter(line, ',') },
    { delimiter: 'space', count: countDelimiter(line, 'space') }
  ];
  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].delimiter : 'space';
}

function splitLine(line, delimiter) {
  if (delimiter === 'space') {
    return line.split(/\s{2,}/).map((cell) => cell.trim()).filter((cell) => cell.length > 0);
  }
  return line.split(delimiter).map((cell) => cell.trim());
}

const KNOWN_HEADER_LABELS = new Set([
  'Street Address',
  'Violation/Issue Type',
  'Violation Date',
  'Description/Notes',
  'Zip'
]);

function isTableHeaderLine(line, delimiter, cells) {
  if (cells.length < 2 || cells.length > 12) return false;
  const mapped = cells.map(mapHeaderLabel);
  const knownCount = mapped.filter((label) => KNOWN_HEADER_LABELS.has(label)).length;
  if (knownCount >= 2) return true;
  if (delimiter === 'space' && countDelimiter(line, 'space') < 2) return false;
  return HEADER_HINT_RE.test(line) && knownCount >= 1 && cells.length <= 6;
}

function findHeaderIndex(lines) {
  for (let i = 0; i < Math.min(lines.length, 12); i += 1) {
    const line = lines[i];
    if (!HEADER_HINT_RE.test(line)) continue;
    const delimiter = detectLineDelimiter(line);
    const cells = splitLine(line, delimiter);
    if (!isTableHeaderLine(line, delimiter, cells)) continue;
    return { index: i, delimiter, headers: cells };
  }
  return null;
}

function mapHeaderLabel(header) {
  const lower = String(header || '').toLowerCase();
  if (/address|location|street|site|service|property|civic/.test(lower)) return 'Street Address';
  if (/violation date|issue date|notice date|citation date|date issued|opened date/.test(lower)) {
    return 'Violation Date';
  }
  if (/date|issued|notice/.test(lower) && !/\btype\b/.test(lower)) return 'Violation Date';
  if (/violation|issue|type|code|charge|offense/.test(lower)) return 'Violation/Issue Type';
  if (/description|notes|comments|detail|remarks|narrative/.test(lower)) return 'Description/Notes';
  if (/zip|postal/.test(lower)) return 'Zip';
  return header;
}

function scoreFromOcr(ocrScore) {
  if (ocrScore >= 85) return { confidenceLevel: 'high', needsReview: false };
  if (ocrScore >= 60) return { confidenceLevel: 'medium', needsReview: false };
  return { confidenceLevel: 'low', needsReview: true };
}

function defaultMeta(source, ocrScore) {
  if (typeof ocrScore === 'number') return scoreFromOcr(ocrScore);
  if (source === 'ocr' || source === 'pdf' || source === 'docx') {
    return { confidenceLevel: 'medium', needsReview: false };
  }
  return { confidenceLevel: 'high', needsReview: false };
}

function buildRow(cells, headerMap, remainder, meta) {
  const row = {};
  headerMap.forEach((label, index) => {
    // Prefer first non-empty value when mapped labels collide
    const next = cells[index] || '';
    if (!row[label] || (!String(row[label]).trim() && next)) {
      row[label] = next;
    }
  });
  if (remainder.length) {
    const notes = row['Description/Notes'] || '';
    row['Description/Notes'] = [notes, remainder.join(' ')].filter(Boolean).join(' | ');
  }
  row._meta = meta;
  return row;
}

/** Case/permit IDs pass the loose address check — reject them when salvaging. */
function looksLikeIdToken(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  if (/^(cv|case|inv|ref|id|permit|wo|wrk|ticket)[-#\s]?\w*\d+/i.test(value)) return true;
  if (/^[A-Z]{1,6}[-#]?\d{3,}$/i.test(value)) return true;
  if (/^\d{6,}$/.test(value)) return true; // long bare parcel digits without "parcel/lot"
  return false;
}

/**
 * Pull a street-like token from free text (cell or whole line).
 * Prefers house-number patterns; falls back to lot/parcel phrasing.
 * Stricter than hasUsableStreetAddress so "CV-1001" is not treated as a street.
 */
function extractStreetFromText(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value || looksLikeIdToken(value)) return '';

  const m = value.match(ADDRESS_IN_LINE_RE);
  if (m) {
    const street = String(m[1] || '').trim();
    if (street && !looksLikeIdToken(street) && hasUsableStreetAddress(street)) {
      return street;
    }
  }

  const lot = value.match(/\b((?:lot|parcel|unit|apt|suite)\s*#?\s*[\w-]+(?:\s+[\w-]+){0,4})/i);
  if (lot && hasUsableStreetAddress(lot[1])) return lot[1].trim();

  // Whole cell is already a clean street (e.g. "123 Main St")
  if (
    hasUsableStreetAddress(value) &&
    !looksLikeIdToken(value) &&
    /\d{1,6}\s+[A-Za-z#]/.test(value)
  ) {
    return value;
  }
  return '';
}

/** Ensure Street Address is filled from any cell / joined row text. */
function salvageStreetAddress(row) {
  if (!row || typeof row !== 'object') return row;
  if (hasUsableStreetAddress(row['Street Address'])) return row;

  const preferredKeys = ['Street Address', 'Location', 'Property', 'Site', 'Service'];
  for (const key of preferredKeys) {
    if (row[key] == null) continue;
    const found = extractStreetFromText(row[key]);
    if (found) {
      row['Street Address'] = found;
      return row;
    }
  }

  for (const [key, val] of Object.entries(row)) {
    if (key === '_meta' || key === 'Street Address') continue;
    const found = extractStreetFromText(val);
    if (found) {
      row['Street Address'] = found;
      return row;
    }
  }

  const joined = Object.entries(row)
    .filter(([k]) => k !== '_meta')
    .map(([, v]) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
  const found = extractStreetFromText(joined);
  if (found) row['Street Address'] = found;
  return row;
}

function countRowsWithStreet(rows) {
  return (rows || []).filter((r) => hasUsableStreetAddress(r && r['Street Address'])).length;
}

function extractFromTable(lines, source, ocrScore) {
  const headerInfo = findHeaderIndex(lines);
  if (!headerInfo) return null;

  const headerMap = headerInfo.headers.map(mapHeaderLabel);
  const rows = [];
  for (const line of lines.slice(headerInfo.index + 1)) {
    const cells = splitLine(line, headerInfo.delimiter);
    if (!cells.length) continue;
    const streetCell = cells.find((cell) => hasUsableStreetAddress(cell));
    const meta = typeof ocrScore === 'number'
      ? scoreFromOcr(ocrScore)
      : defaultMeta(source);
    if (!streetCell && !hasUsableStreetAddress(cells[0])) {
      // Still keep the row if any cell has an embedded address (PDF mis-split)
      const anyAddr = cells.some((cell) => extractStreetFromText(cell));
      if (!anyAddr && !cells.join(' ').trim()) continue;
      if (!anyAddr && cells.join(' ').trim() && !extractStreetFromText(cells.join(' '))) {
        // Keep non-empty rows so salvage / normalizer can classify; blank-only skipped above
      }
    }
    const remainder = cells.slice(headerMap.length);
    rows.push(salvageStreetAddress(buildRow(cells, headerMap, remainder, meta)));
  }

  if (!rows.length) return null;

  // Table shell with no recoverable streets → let address-lines try instead
  if (countRowsWithStreet(rows) === 0) return null;

  const headers = [...new Set(headerMap)];
  if (!headers.includes('Street Address')) headers.unshift('Street Address');

  return {
    parser: source,
    parseMode: 'table',
    headers,
    rows
  };
}

function extractFromAddressLines(lines, source, ocrScore) {
  const rows = [];
  for (const line of lines) {
    // Global scan: one PDF line can contain several "123 Main St … 456 Oak Ave …"
    const re = new RegExp(ADDRESS_IN_LINE_RE.source, 'gi');
    const matches = [];
    let m;
    while ((m = re.exec(line)) !== null) {
      const street = String(m[1] || '').trim();
      if (hasUsableStreetAddress(street)) {
        matches.push({ street, index: m.index, length: m[0].length });
      }
      // Avoid zero-length loops
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }

    if (!matches.length) {
      const lotStreet = extractStreetFromText(line);
      if (!lotStreet || !hasUsableStreetAddress(lotStreet)) continue;
      matches.push({ street: lotStreet, index: line.indexOf(lotStreet), length: lotStreet.length });
    }

    for (let i = 0; i < matches.length; i += 1) {
      const cur = matches[i];
      const next = matches[i + 1];
      const start = cur.index + cur.length;
      const end = next ? next.index : line.length;
      const remainder = line.slice(start, end).replace(/^[\s,;|.-]+/, '').trim();
      const meta = typeof ocrScore === 'number'
        ? scoreFromOcr(ocrScore)
        : { confidenceLevel: 'medium', needsReview: source === 'ocr' };

      rows.push({
        'Street Address': cur.street,
        'Violation/Issue Type': '',
        'Violation Date': '',
        'Description/Notes': remainder,
        Zip: '',
        _meta: meta
      });
    }
  }

  if (!rows.length) return null;
  return {
    parser: source,
    parseMode: 'address-lines',
    headers: ['Street Address', 'Violation/Issue Type', 'Violation Date', 'Description/Notes', 'Zip'],
    rows
  };
}

function extractRowsFromText(text, options = {}) {
  const source = options.parser || 'text';
  const lines = normalizeLines(text);
  if (!lines.length) {
    throw new Error('No readable text found in document');
  }

  const table = extractFromTable(lines, source, options.ocrConfidence);
  if (table && countRowsWithStreet(table.rows) > 0) return table;

  const addressLines = extractFromAddressLines(lines, source, options.ocrConfidence);
  if (addressLines) return addressLines;

  // Last resort: return salvaged table even if weak (lets normalizer report previews)
  if (table) return table;

  throw new Error('Could not identify a property list table or addresses in document text');
}

function extractRowsFromHtmlTables(html, source = 'docx') {
  const rows = [];
  const tableMatches = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const tableHtml of tableMatches) {
    const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (trMatches.length < 2) continue;
    const headerCells = (trMatches[0].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [])
      .map((cell) => cell.replace(/<[^>]+>/g, '').trim());
    const headerMap = headerCells.map(mapHeaderLabel);
    for (const tr of trMatches.slice(1)) {
      const cells = (tr.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [])
        .map((cell) => cell.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (!cells.some((cell) => hasUsableStreetAddress(cell))) continue;
      rows.push(buildRow(cells, headerMap, cells.slice(headerMap.length), defaultMeta(source)));
    }
  }

  if (!rows.length) return null;
  return {
    parser: source,
    parseMode: 'html-table',
    headers: [...new Set(rows.flatMap((row) => Object.keys(row).filter((k) => k !== '_meta')))],
    rows
  };
}

module.exports = {
  normalizeLines,
  detectLineDelimiter,
  scoreFromOcr,
  extractRowsFromText,
  extractRowsFromHtmlTables
};