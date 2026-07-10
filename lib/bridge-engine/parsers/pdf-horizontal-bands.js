/**
 * Detect and resolve horizontally-split multi-page municipal exports.
 *
 * Wide sheets are often printed as:
 *   pages 1–N:  ADDRESS + violation/type + dates  (primary)
 *   pages N+1:  PARCEL ID / OWNER / NOTES…        (same rows, overflow columns)
 *
 * Naively stacking all pages under the first header puts parcel IDs into the
 * violation column. This module keeps only the primary band for row identity,
 * and zip-joins continuation columns when row counts match.
 */

const STREET_TOKEN_RE =
  /\b(RD|AVE?|ST|LN|DR|CT|WY|CIR|BLVD|PL|ROAD|STREET|DRIVE|LANE|COURT|WAY|PLACE|PKWY|HWY)\b/i;
const HOUSE_STREET_RE = /\b\d{1,6}\s+[A-Za-z#]/;
/** Franklin-style 090-002136, generic APN-ish tokens */
const PARCEL_ID_RE = /\b\d{2,3}-\d{4,8}[A-Z]?\b|\b\d{6,12}\b/;
const DATE_LEAD_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}\b/;

const ADDRESS_HEADER_RE =
  /\b(address|street|location|property|site|service)\b/i;
const CONTINUATION_HEADER_RE =
  /\b(parcel\s*id|parcel|apn|owner|sub\s*division|subdivision|file\s*#|ext\s*dt|deadline|citation|court\s*dt|closing\s*code|notes)\b/i;
const NOTES_HEADER_RE = /^notes\b/i;

function pageText(page) {
  if (page == null) return '';
  if (typeof page === 'string') return page;
  return String(page.text || '');
}

function normalizeLines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\f/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function splitCells(line) {
  // Prefer multi-space / tab columns; fall back to single-space only when
  // the line is short and looks like header labels.
  if (/\t/.test(line)) {
    return line.split(/\t+/).map((c) => c.trim()).filter(Boolean);
  }
  if (/\s{2,}/.test(line)) {
    return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  }
  // Header-ish single-spaced labels: "EXT DT DEADLINE … PARCEL ID"
  if (
    CONTINUATION_HEADER_RE.test(line) &&
    !HOUSE_STREET_RE.test(line) &&
    line.length < 120
  ) {
    // Keep multi-word labels known to this layout
    return line
      .replace(/\bPARCEL\s+ID\b/gi, 'PARCEL_ID')
      .replace(/\bSUB\s+DIVISION\b/gi, 'SUB_DIVISION')
      .replace(/\bFILE\s+#\b/gi, 'FILE_#')
      .replace(/\bEXT\s+DT\b/gi, 'EXT_DT')
      .replace(/\bCOURT\s+DT\b/gi, 'COURT_DT')
      .replace(/\bFILE\s+DT\b/gi, 'FILE_DT')
      .replace(/\bNOTIF\s+DT\b/gi, 'NOTIF_DT')
      .replace(/\bCLOSING\s+CODE\b/gi, 'CLOSING_CODE')
      .split(/\s+/)
      .map((c) => c.replace(/_/g, ' ').trim())
      .filter(Boolean);
  }
  return [line.trim()].filter(Boolean);
}

function looksLikeHeaderLine(line) {
  const s = String(line || '').trim();
  if (!s || s.length > 160) return false;
  if (HOUSE_STREET_RE.test(s) && STREET_TOKEN_RE.test(s)) return false;
  if (DATE_LEAD_RE.test(s) && PARCEL_ID_RE.test(s)) return false;
  return (
    ADDRESS_HEADER_RE.test(s) ||
    CONTINUATION_HEADER_RE.test(s) ||
    NOTES_HEADER_RE.test(s) ||
    /\b(desc|file dt|notif dt|violation|type|status)\b/i.test(s)
  );
}

function scoreStreetLines(lines) {
  let n = 0;
  for (const line of lines) {
    if (HOUSE_STREET_RE.test(line) && (STREET_TOKEN_RE.test(line) || /[A-Za-z]{3,}/.test(line))) {
      n += 1;
    }
  }
  return n;
}

function scoreParcelLines(lines) {
  let n = 0;
  for (const line of lines) {
    // Continuation rows often: "7/15/2026 090-002136 202304311"
    if (PARCEL_ID_RE.test(line) && !STREET_TOKEN_RE.test(line) && !HOUSE_STREET_RE.test(line)) {
      n += 1;
    } else if (DATE_LEAD_RE.test(line) && PARCEL_ID_RE.test(line) && !STREET_TOKEN_RE.test(line)) {
      n += 1;
    }
  }
  return n;
}

function scoreOwnerLines(lines) {
  // "NEW LIFE VILLAS CMM LLC Z" — names without house numbers / streets
  let n = 0;
  for (const line of lines) {
    if (HOUSE_STREET_RE.test(line) || STREET_TOKEN_RE.test(line) || DATE_LEAD_RE.test(line)) continue;
    if (PARCEL_ID_RE.test(line) && line.length < 40) continue;
    if (/^[A-Z0-9][A-Z0-9 ,.'&\-/]{3,}$/i.test(line) && line.length < 80) n += 1;
  }
  return n;
}

/**
 * @returns {'primary'|'continuation'|'notes'|'empty'|'unknown'}
 */
function classifyPageText(text) {
  const lines = normalizeLines(text);
  if (!lines.length) return { kind: 'empty', lines, header: '', role: null };

  const first = lines[0];
  const header = looksLikeHeaderLine(first) ? first : '';
  const dataLines = header ? lines.slice(1) : lines;
  const pool = dataLines.length ? dataLines : lines;
  const dataCount = Math.max(1, pool.length);

  if (NOTES_HEADER_RE.test(first) || NOTES_HEADER_RE.test(header)) {
    return { kind: 'notes', lines, header: header || first, role: 'notes' };
  }

  const streetHits = scoreStreetLines(pool);
  const parcelHits = scoreParcelLines(pool);
  const ownerHits = scoreOwnerLines(pool);
  const avgLen = lines.reduce((s, l) => s + l.length, 0) / Math.max(1, lines.length);
  const streetRatio = streetHits / dataCount;
  const parcelRatio = parcelHits / dataCount;

  // Explicit continuation headers (parcel / owner strips) win even if a stray street appears
  if (CONTINUATION_HEADER_RE.test(header) && !ADDRESS_HEADER_RE.test(header)) {
    let role = 'extra';
    if (/parcel|apn/i.test(header)) role = 'parcel';
    else if (/owner/i.test(header)) role = 'owner';
    else if (/note/i.test(header)) role = 'notes';
    else if (parcelHits >= ownerHits) role = 'parcel';
    else if (ownerHits > 0) role = 'owner';
    return { kind: 'continuation', lines, header, role };
  }

  // Parcel-heavy pages without streets (continuation of same list)
  if (parcelHits >= 2 && streetHits === 0 && parcelRatio >= 0.4) {
    return { kind: 'continuation', lines, header, role: 'parcel' };
  }

  // Owner-name pages (no house numbers)
  if (ownerHits >= 3 && streetHits <= 1 && parcelHits === 0) {
    return { kind: 'continuation', lines, header, role: 'owner' };
  }

  // Primary address list: header or majority street-like rows
  if (ADDRESS_HEADER_RE.test(header) || streetRatio >= 0.35 || (streetHits >= 3 && streetRatio >= 0.2)) {
    if (streetHits >= 1 && streetHits >= parcelHits) {
      return { kind: 'primary', lines, header, role: 'primary' };
    }
  }

  // Sparse street hits on a short page (e.g. last primary page with 1 row)
  if (streetHits >= 1 && dataCount <= 3 && parcelHits === 0 && avgLen < 100) {
    return { kind: 'primary', lines, header, role: 'primary' };
  }

  // Long prose / notes without structured streets
  if (streetHits <= 1 && parcelHits === 0 && (avgLen > 50 || dataCount >= 4)) {
    return { kind: 'notes', lines, header, role: 'notes' };
  }

  return { kind: 'unknown', lines, header, role: null };
}

function headerFingerprint(headerLineOrCells) {
  const cells = Array.isArray(headerLineOrCells)
    ? headerLineOrCells
    : splitCells(String(headerLineOrCells || ''));
  return cells
    .map((h) => String(h || '').toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('|');
}

/**
 * When a continuation strip only prints the non-empty overflow cells
 * (e.g. date + parcel + file #), realign to compact headers so parcel
 * IDs don't land under DEADLINE.
 */
function compactSparseContinuation(headers, rows) {
  if (!rows.length) return { headers, rows };

  // Detect dominant pattern: date, parcel-id, file#
  let dateParcelFile = 0;
  let parcelOnly = 0;
  for (const row of rows) {
    const cells = row.map((c) => String(c || '').trim()).filter(Boolean);
    if (cells.length === 3 && DATE_LEAD_RE.test(cells[0]) && PARCEL_ID_RE.test(cells[1])) {
      dateParcelFile += 1;
    } else if (cells.length === 2 && PARCEL_ID_RE.test(cells[0])) {
      parcelOnly += 1;
    } else if (cells.length >= 2 && cells.some((c) => PARCEL_ID_RE.test(c))) {
      // date + parcel (+ extras)
      const pi = cells.findIndex((c) => PARCEL_ID_RE.test(c));
      if (pi >= 0 && (pi === 0 || DATE_LEAD_RE.test(cells[0]))) dateParcelFile += 1;
    }
  }

  const n = rows.length;
  if (dateParcelFile >= Math.max(2, Math.floor(n * 0.5))) {
    const compactHeaders = ['Overflow Date', 'Parcel ID', 'File #'];
    const compactRows = rows.map((row) => {
      const cells = row.map((c) => String(c || '').trim()).filter(Boolean);
      const parcel = cells.find((c) => PARCEL_ID_RE.test(c)) || '';
      const date = cells.find((c) => DATE_LEAD_RE.test(c)) || '';
      const file = cells.find((c) => /^\d{6,}$/.test(c) && c !== parcel) || cells[cells.length - 1] || '';
      return [date, parcel, file === parcel ? '' : file];
    });
    return { headers: compactHeaders, rows: compactRows };
  }

  // If a wide header list exists but values cluster in first K columns, shrink headers
  // only when a PARCEL-ish header exists and parcel values sit in the wrong index.
  const parcelHeaderIdx = headers.findIndex((h) => /parcel|apn/i.test(String(h)));
  if (parcelHeaderIdx > 0) {
    let misaligned = 0;
    for (const row of rows) {
      const atParcel = PARCEL_ID_RE.test(String(row[parcelHeaderIdx] || ''));
      const elsewhere = row.some((c, i) => i !== parcelHeaderIdx && PARCEL_ID_RE.test(String(c || '')));
      if (!atParcel && elsewhere) misaligned += 1;
    }
    if (misaligned >= Math.max(2, Math.floor(n * 0.5))) {
      // Rebuild rows by scanning values
      const compactHeaders = ['Overflow Date', 'Parcel ID', 'File #'];
      const compactRows = rows.map((row) => {
        const cells = row.map((c) => String(c || '').trim()).filter(Boolean);
        const parcel = cells.find((c) => PARCEL_ID_RE.test(c)) || '';
        const date = cells.find((c) => DATE_LEAD_RE.test(c)) || '';
        const file = cells.find((c) => /^\d{6,}$/.test(c) && !PARCEL_ID_RE.test(c)) || '';
        return [date, parcel, file];
      });
      return { headers: compactHeaders, rows: compactRows };
    }
  }

  return { headers, rows };
}

/**
 * Parse a continuation (or primary) band into a matrix [headers, ...rows].
 * Does not require street addresses.
 */
function bandToMatrix(text, { forceHeader, continuation = false } = {}) {
  const lines = normalizeLines(text);
  if (!lines.length) return null;

  let headerLine = forceHeader || '';
  let start = 0;
  if (!headerLine && looksLikeHeaderLine(lines[0])) {
    headerLine = lines[0];
    start = 1;
  }
  if (!headerLine) {
    // Synthetic labels so zip still attaches columns
    headerLine = continuation ? 'Overflow Date Parcel ID File #' : 'Column A Column B Column C Column D';
  }

  let headers = splitCells(headerLine);
  if (headers.length < 2 && /\s/.test(headerLine)) {
    headers = headerLine.split(/\s+/).filter(Boolean);
  }
  if (!headers.length) headers = ['Value'];

  const rows = [];
  for (const line of lines.slice(start)) {
    if (looksLikeHeaderLine(line) && !HOUSE_STREET_RE.test(line) && !DATE_LEAD_RE.test(line)) {
      // Mid-band header repeat — skip
      continue;
    }
    let cells = splitCells(line);
    // Parcel lines often single-spaced: "7/15/2026 090-002136 202304311"
    if (cells.length === 1 && /\s/.test(line)) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && parts.length <= 8) cells = parts;
    }
    if (!cells.some((c) => String(c).trim())) continue;
    while (cells.length < headers.length) cells.push('');
    rows.push(cells.slice(0, Math.max(headers.length, cells.length)));
    // Widen headers if a row is longer
    if (cells.length > headers.length) {
      for (let i = headers.length; i < cells.length; i += 1) {
        headers.push(`Column ${i + 1}`);
      }
    }
  }

  if (!rows.length) return null;

  let finalHeaders = headers;
  let finalRows = rows;
  if (continuation || /parcel|apn|owner|deadline|ext\s*dt/i.test(headers.join(' '))) {
    const compacted = compactSparseContinuation(headers, rows);
    finalHeaders = compacted.headers;
    finalRows = compacted.rows;
  }

  // Pad all rows to header width
  const width = finalHeaders.length;
  const rect = finalRows.map((r) => {
    const next = r.slice(0, width);
    while (next.length < width) next.push('');
    return next;
  });
  return [finalHeaders, ...rect];
}

function rowCountClose(a, b, { abs = 2, ratio = 0.05 } = {}) {
  if (a <= 0 || b <= 0) return false;
  const diff = Math.abs(a - b);
  if (diff <= abs) return true;
  return diff / Math.max(a, b) <= ratio;
}

/**
 * Zip continuation matrices onto a primary matrix (AOA).
 * Primary headers/rows define identity; continuation columns are appended.
 */
function zipMatrices(primaryAoa, continuationAoas) {
  if (!primaryAoa || primaryAoa.length < 2) return primaryAoa;
  const headers = primaryAoa[0].slice();
  const data = primaryAoa.slice(1).map((r) => r.slice());
  const n = data.length;
  const used = new Set(headers.map((h) => h.toLowerCase()));

  for (const cont of continuationAoas || []) {
    if (!cont || cont.length < 2) continue;
    const contHeaders = cont[0].slice();
    const contRows = cont.slice(1);
    if (!rowCountClose(n, contRows.length)) continue;

    const rename = contHeaders.map((h) => {
      let label = String(h || 'Column').trim() || 'Column';
      let key = label.toLowerCase();
      if (used.has(key)) {
        let i = 2;
        while (used.has(`${key} (${i})`)) i += 1;
        label = `${label} (${i})`;
        key = label.toLowerCase();
      }
      used.add(key);
      return label;
    });
    headers.push(...rename);

    const take = Math.min(n, contRows.length);
    for (let i = 0; i < take; i += 1) {
      const extra = contRows[i].slice();
      while (extra.length < rename.length) extra.push('');
      data[i].push(...extra.slice(0, rename.length));
    }
    for (let i = take; i < n; i += 1) {
      data[i].push(...rename.map(() => ''));
    }
  }

  // Re-rectify
  const width = headers.length;
  return [
    headers,
    ...data.map((r) => {
      const next = r.slice(0, width);
      while (next.length < width) next.push('');
      return next;
    })
  ];
}

/**
 * Given per-page text blobs, return merged primary (+ zipped) text/AOA when
 * horizontal continuation is detected. Returns null if not applicable.
 *
 * @param {Array<string|{text?:string}>} pages
 * @returns {null | {
 *   applied: true,
 *   primaryText: string,
 *   aoa: string[][] | null,
 *   stats: object
 * }}
 */
function resolveHorizontalPageBands(pages) {
  if (!Array.isArray(pages) || pages.length < 2) return null;

  const classified = pages.map((p, index) => {
    const text = pageText(p);
    return { index, text, ...classifyPageText(text) };
  });

  const primaryPages = classified.filter((p) => p.kind === 'primary');
  const contPages = classified.filter((p) => p.kind === 'continuation');

  // Need a real split: some primary + some continuation
  if (!primaryPages.length || !contPages.length) return null;

  // Primary must be a meaningful list
  const primaryText = primaryPages.map((p) => p.text).join('\n');
  const primaryStreet = scoreStreetLines(normalizeLines(primaryText));
  if (primaryStreet < 2) return null;

  // Group continuation pages into bands by header fingerprint (or sequential runs)
  const contBands = [];
  let current = null;
  for (const p of contPages) {
    const fp = headerFingerprint(p.header || '') || p.role || 'extra';
    // Sequential pages without new header continue the previous band
    const isNewHeader = p.header && looksLikeHeaderLine(p.header);
    if (!current) {
      current = { fingerprint: fp, role: p.role, texts: [p.text], header: p.header };
      contBands.push(current);
    } else if (isNewHeader && headerFingerprint(p.header) !== headerFingerprint(current.header || '')) {
      current = { fingerprint: fp, role: p.role, texts: [p.text], header: p.header };
      contBands.push(current);
    } else {
      current.texts.push(p.text);
      if (!current.header && p.header) current.header = p.header;
    }
  }

  // Build primary matrix via band parser (preserves DESC etc.)
  let primaryMatrix = bandToMatrix(primaryText);
  // Keep only rows that look like property lines (drop mid-band notes bleed)
  if (primaryMatrix && primaryMatrix.length >= 2) {
    const hdr = primaryMatrix[0];
    const kept = primaryMatrix.slice(1).filter((row) => {
      const joined = row.join(' ');
      // Require a house number + street-ish token; reject prose/notes
      if (!HOUSE_STREET_RE.test(joined)) return false;
      if (!STREET_TOKEN_RE.test(joined) && !/\b[A-Z]{2,}(?:\s+[A-Z]{2,}){0,4}\b/.test(joined)) {
        return false;
      }
      // Reject pure date/parcel continuation lines that snuck in
      if (DATE_LEAD_RE.test(String(row[0] || '')) && PARCEL_ID_RE.test(joined) && !STREET_TOKEN_RE.test(joined)) {
        return false;
      }
      // Reject long narrative lines
      if (joined.length > 120 && !STREET_TOKEN_RE.test(joined)) return false;
      return true;
    });
    if (kept.length >= 2) {
      primaryMatrix = [hdr, ...kept];
    }
  }

  if (!primaryMatrix || primaryMatrix.length < 3) {
    // Still strip continuations from text even if matrix parse is weak
    return {
      applied: true,
      primaryText,
      aoa: null,
      stats: {
        primaryPages: primaryPages.length,
        continuationPages: contPages.length,
        primaryRows: primaryStreet,
        zippedBands: 0,
        mode: 'text-only'
      }
    };
  }

  const contMatrices = [];
  for (const band of contBands) {
    const bandText = band.texts.join('\n');
    const matrix = bandToMatrix(bandText, {
      forceHeader: band.header || undefined,
      continuation: true
    });
    if (matrix) contMatrices.push(matrix);
  }

  const zipped = zipMatrices(primaryMatrix, contMatrices);
  const zippedBands = contMatrices.filter((m) =>
    rowCountClose(primaryMatrix.length - 1, m.length - 1)
  ).length;

  // Rebuild primaryText from cleaned matrix so downstream extractors
  // don't re-import notes/prose that leaked into "primary" pages.
  const cleanPrimaryText = primaryMatrix
    .map((row) => row.filter(Boolean).join('  '))
    .join('\n');

  return {
    applied: true,
    primaryText: cleanPrimaryText || primaryText,
    aoa: zipped,
    stats: {
      primaryPages: primaryPages.length,
      continuationPages: contPages.length,
      primaryRows: primaryMatrix.length - 1,
      zippedBands,
      continuationBands: contBands.length,
      mode: zippedBands ? 'zip' : 'primary-only'
    }
  };
}

/**
 * For vector tables: only stack tables that share the same header fingerprint.
 * Different headers at the same width are treated as separate candidates
 * (horizontal overflow), not extra rows under the first header.
 *
 * @param {string[][][]} normalizedTables  each is AOA with header row
 * @returns {string[][][]} groups of tables safe to stack
 */
function groupTablesByHeaderFingerprint(normalizedTables) {
  const groups = new Map();
  for (const table of normalizedTables || []) {
    if (!table || !table[0]) continue;
    const fp = headerFingerprint(table[0]);
    const w = table[0].length;
    const key = `${w}::${fp}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(table);
  }
  return [...groups.values()];
}

/**
 * Prefer address-bearing table groups; optionally zip equal-row continuation groups.
 */
function mergeTableGroups(groups) {
  if (!groups.length) return null;

  const scored = groups.map((tables) => {
    const header = tables[0][0];
    const dataRows = [];
    const seen = new Set();
    for (const t of tables) {
      for (const row of t.slice(1)) {
        const key = row.join('\u0001');
        if (seen.has(key)) continue;
        seen.add(key);
        dataRows.push(row);
      }
    }
    const hasAddress = header.some((h) =>
      /address|street|property|location|site/i.test(String(h))
    );
    const hasViolation = header.some((h) =>
      /violation|type|desc|issue|action\s*form|form\s*name|complaint/i.test(String(h))
    );
    const score =
      dataRows.length * header.length +
      (hasAddress ? 80 : 0) +
      (hasViolation ? 40 : 0) +
      (header.some((h) => /date/i.test(String(h))) ? 10 : 0);
    return { header, dataRows, score, hasAddress };
  });

  scored.sort((a, b) => b.score - a.score);
  const primary = scored[0];
  if (!primary || !primary.dataRows.length) return null;

  let aoa = [primary.header, ...primary.dataRows];

  // Zip other groups with matching row counts (horizontal columns)
  const contAoas = scored.slice(1).map((g) => [g.header, ...g.dataRows]);
  aoa = zipMatrices(aoa, contAoas);
  return aoa;
}

module.exports = {
  pageText,
  classifyPageText,
  headerFingerprint,
  bandToMatrix,
  zipMatrices,
  rowCountClose,
  resolveHorizontalPageBands,
  groupTablesByHeaderFingerprint,
  mergeTableGroups,
  looksLikeHeaderLine,
  splitCells,
  scoreStreetLines,
  scoreParcelLines
};
