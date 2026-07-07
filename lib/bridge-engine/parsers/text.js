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
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function parseTextFile(buffer, filename) {
  if (!isTextFile(filename)) {
    throw new Error('Not a text file');
  }

  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    throw new Error('Text file is empty');
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitLine(lines[0], delimiter);
  if (!headerCells.length || headerCells.every((cell) => !cell)) {
    throw new Error('Text file has no usable headers');
  }

  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const row = {};
    headerCells.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    rows.push(row);
  }

  return {
    parser: 'text',
    delimiter,
    headers: headerCells,
    rows
  };
}

module.exports = {
  isTextFile,
  detectDelimiter,
  parseTextFile
};