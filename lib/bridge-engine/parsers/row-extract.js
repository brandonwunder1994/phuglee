const { hasUsableStreetAddress } = require('../../bridge-intake-schema');

const HEADER_HINT_RE = /\b(address|location|street|property|site|service|violation|issue|notice|date|description)\b/i;
const ADDRESS_IN_LINE_RE = /\b(\d{1,6}\s+[A-Za-z0-9#./'\-]+(?:\s+[A-Za-z0-9#./'\-]+){0,6})\b/;

function normalizeLines(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
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
    row[label] = cells[index] || '';
  });
  if (remainder.length) {
    const notes = row['Description/Notes'] || '';
    row['Description/Notes'] = [notes, remainder.join(' ')].filter(Boolean).join(' | ');
  }
  row._meta = meta;
  return row;
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
      if (!cells.join(' ').trim()) continue;
    }
    const remainder = cells.slice(headerMap.length);
    rows.push(buildRow(cells, headerMap, remainder, meta));
  }

  if (!rows.length) return null;
  return {
    parser: source,
    parseMode: 'table',
    headers: [...new Set(headerMap)],
    rows
  };
}

function extractFromAddressLines(lines, source, ocrScore) {
  const rows = [];
  for (const line of lines) {
    const match = line.match(ADDRESS_IN_LINE_RE);
    if (!match || !hasUsableStreetAddress(match[1])) continue;
    const street = match[1].trim();
    const remainder = line.replace(match[1], '').replace(/^[\s,;|-]+/, '').trim();
    const meta = typeof ocrScore === 'number'
      ? scoreFromOcr(ocrScore)
      : { confidenceLevel: 'medium', needsReview: source === 'ocr' };

    rows.push({
      'Street Address': street,
      'Violation/Issue Type': '',
      'Violation Date': '',
      'Description/Notes': remainder,
      Zip: '',
      _meta: meta
    });
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
  if (table) return table;

  const addressLines = extractFromAddressLines(lines, source, options.ocrConfidence);
  if (addressLines) return addressLines;

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