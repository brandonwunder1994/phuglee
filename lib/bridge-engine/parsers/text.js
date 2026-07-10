const path = require('path');

function extension(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

function isTextFile(filename) {
  return extension(filename) === '.txt';
}

function detectDelimiter(line) {
  const candidates = [
    { char: '\t', count: (line.match(/\t/g) || []).length },
    { char: ',', count: (line.match(/,/g) || []).length },
    { char: '|', count: (line.match(/\|/g) || []).length },
    { char: ';', count: (line.match(/;/g) || []).length }
  ];
  candidates.sort((a, b) => b.count - a.count);
  return candidates[0].count > 0 ? candidates[0].char : ',';
}

/** Collapse CRLF / internal newlines inside a cell (multi-line city addresses). */
function normalizeCell(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Split one physical line into cells (no embedded newlines).
 * Kept for tests / call sites that already hold a single line.
 */
function splitLine(line, delimiter) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(normalizeCell(current));
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(normalizeCell(current));
  return out;
}

/**
 * RFC4180-style record split: newlines inside "quoted fields" stay in the cell.
 * City exports often put street + city/state/zip on separate lines inside quotes.
 */
function splitRecords(text, delimiter) {
  const records = [];
  let cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      cells.push(normalizeCell(current));
      current = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      cells.push(normalizeCell(current));
      current = '';
      if (cells.some((c) => String(c).trim())) {
        records.push(cells);
      }
      cells = [];
      continue;
    }

    current += ch;
  }

  if (current.length || cells.length) {
    cells.push(normalizeCell(current));
    if (cells.some((c) => String(c).trim())) {
      records.push(cells);
    }
  }

  return records;
}

function parseDelimitedText(text, parserLabel = 'text') {
  const cleaned = String(text || '').replace(/^\uFEFF/, '');
  if (!cleaned.trim()) {
    throw new Error('Delimited file is empty');
  }

  // Header is almost always a single physical line — use it for delimiter detect.
  const firstNl = cleaned.search(/\r?\n/);
  const headerProbe = (firstNl >= 0 ? cleaned.slice(0, firstNl) : cleaned).trim();
  const delimiter = detectDelimiter(headerProbe);

  const records = splitRecords(cleaned, delimiter);
  if (!records.length) {
    throw new Error('Delimited file is empty');
  }

  const headerCells = records[0].map((h) => String(h || '').trim());
  if (!headerCells.length || headerCells.every((cell) => !cell)) {
    throw new Error('Delimited file has no usable headers');
  }

  const rows = [];
  for (const cells of records.slice(1)) {
    // Skip fully empty trailing records
    if (!cells.some((c) => String(c || '').trim())) continue;
    const row = {};
    headerCells.forEach((header, index) => {
      if (!header) return;
      row[header] = cells[index] ?? '';
    });
    rows.push(row);
  }

  if (!rows.length) {
    throw new Error('Delimited file is empty');
  }

  return {
    parser: parserLabel,
    delimiter,
    headers: headerCells.filter(Boolean),
    rows
  };
}

function parseTextFile(buffer, filename) {
  if (!isTextFile(filename)) {
    throw new Error('Not a text file');
  }
  return parseDelimitedText(buffer.toString('utf8'), 'text');
}

module.exports = {
  isTextFile,
  detectDelimiter,
  splitLine,
  splitRecords,
  normalizeCell,
  parseDelimitedText,
  parseTextFile
};
