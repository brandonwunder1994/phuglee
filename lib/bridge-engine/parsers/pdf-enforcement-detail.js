/**
 * Reconstruct rows from municipal "Enforcement Cases Detail By Violation"
 * reports (e.g. Gainesville GA GV_Code_Enf_Violation_Detail.rpt) that arrive
 * as sideways image scans with black-box redactions.
 *
 * Typical columns after upright OCR:
 *   Record ID | Location | DESCRIPTION | Complainant | Status | Open Date | Last Status Date
 *
 * OCR often glues columns and eats redacted cells. We anchor on record IDs
 * (GENF26-####) and recover Location + Description + Status + dates so Filter
 * can build a real Excel sheet instead of title-banner junk rows.
 */

const HEADERS = [
  'Record ID',
  'Location',
  'Description',
  'Violation Type',
  'Complainant',
  'Status',
  'Open Date',
  'Last Status Date'
];

const STATUS_RE =
  /\b(Closed\s*[-–]?\s*(?:Violation\s+Correc\w*|Violation\s+Abat\w*|Duplicate)|Open(?:\s*[-–]?\s*Pending)?)\b/i;

const COMPLAINANT_RE =
  /\b(Code\s+Officer\s+Init\w*|Government\s+Official|Citizen\s+Complaint|Anonymous)\b/i;

const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g;

/**
 * Section headers that appear above groups of cases (Crystal Reports style).
 * Used as Violation Type when present.
 */
const SECTION_TYPE_RE =
  /^(TRASH|TALL\s+GRASS|HIGH\s+GRASS|WEEDS?|JUNK(?:\s+AND\s+DEBRIS)?|RUBBISH|LITTER|ILLEGAL\s+DUMPING|NUISANCE|PARKING|ZONING|GRAFFITI|INOPERABLE\s+VEHICLE|YARD\s+PARKING)$/i;

const STREET_SUFFIX =
  'CIRCLE|CIR|STREET|ST|AVENUE|AVE|ROAD|RD|DRIVE|DR|TRAIL|TRL|TR|LANE|LN|COURT|CT|WAY|BLVD|HIGHWAY|HWY|PLACE|PL|PARKWAY|PKWY|COVE|LOOP|TERRACE|TER';

const JUNK_DESC_RE =
  /\b(?:Gainesville\s+Code\s+Enforcement|Enforcement\s+Cases\s+Detail|Record\s+ID|Location|DESCRIPTION|Complainant|Open\s+Status|Quantit\w*|Citations|GV_Code_Enf|Page\s+\d+\s+of\s+\d+|TOTAL\s+(?:TRASH|TALL\s+GRASS|VIOLATIONS)|From\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+to)\b/gi;

function normalizeSpace(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRecordId(prefix2, num) {
  const p = String(prefix2 || '').padStart(2, '0');
  const n = String(num || '').replace(/\D/g, '');
  if (!p || !n) return '';
  return `GENF${p}-${n}`;
}

function looksLikeEnforcementDetail(text) {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  const ids = raw.match(/\bGENF\s*[-–]?\s*\d{2}\s*[-–]?\s*\d{3,5}\b/gi) || [];
  if (ids.length >= 2) return true;
  return (
    /enforcement\s+cases\s+detail/i.test(raw) &&
    /record\s*id|location|description/i.test(raw)
  );
}

/**
 * Strip OCR noise tokens that are not useful field content.
 */
function cleanChunk(s) {
  return normalizeSpace(
    String(s || '')
      .replace(/[~_|\[\]{}<>@=§]+/g, ' ')
      .replace(/\b0\.?\s*C\.?\s*G\.?\s*A\.?\b/gi, ' ')
      .replace(/\b50-18(?:-\d+(?:\([a-z0-9]+\))*)*/gi, ' ')
      .replace(/\bTOTAL\s+(?:TRASH|TALL\s+GRASS|VIOLATIONS)\b[\s\d]*/gi, ' ')
      .replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, ' ')
      .replace(/\bGV_Code_Enf_Violation_Detail\.rpt\b/gi, ' ')
      .replace(/\bQuantitiy\b|\bQuantity\b|\bCitations\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Normalize truncated city tails from OCR of GAINESVILLE.
 */
function normalizeLocation(raw) {
  let loc = normalizeSpace(raw);
  if (!loc) return '';

  // Unit markers: keep #A1 style
  loc = loc
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*G(?:AINESVILLE|AINESVIL|AINES|AIN|A)?\b/i, ', GAINESVILLE')
    .replace(/,\s*G(?:AINESVILLE|AINESVIL|AINES|AIN|A)?\b/i, ', GAINESVILLE')
    .replace(/\s+G(?:AINESVILLE|AINESVIL|AINES|AIN)\b/i, ', GAINESVILLE');

  // Drop trailing single letter city crumbs: ", G" / ", C" / "GAINESVILLE G"
  loc = loc.replace(/,\s*[A-Z]$/i, '');
  loc = loc.replace(/\bGAINESVILLE\s+G\b/i, 'GAINESVILLE');

  // Collapse double city
  loc = loc
    .replace(/(?:,\s*)?GAINESVILLE(?:,\s*GAINESVILLE)+/gi, ', GAINESVILLE')
    .replace(/,\s*GAINESVILLE\s*,\s*GA\b/i, ', GAINESVILLE, GA')
    .replace(/,\s*GAINESVILLE\s*$/i, ', GAINESVILLE, GA')
    .replace(/\s+,/g, ',')
    .replace(/,,+/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  // "… SE, GAIN G" → clean
  loc = loc.replace(/,\s*GAIN(?:ES)?\s*G?$/i, ', GAINESVILLE, GA');
  loc = loc.replace(/,\s*GAINESV\s*$/i, ', GAINESVILLE, GA');
  loc = loc.replace(/\bGAINESVILLE\s+G\s*$/i, 'GAINESVILLE, GA');

  // Ensure state when city present
  if (/GAINESVILLE/i.test(loc) && !/,\s*GA\b/i.test(loc)) {
    loc = loc.replace(/GAINESVILLE\s*$/i, 'GAINESVILLE, GA');
  }

  return loc;
}

/**
 * Pull a street address from the start of a post-ID chunk.
 * Prefers ALL-CAPS location lines typical of this report family.
 */
function extractLocation(chunk) {
  const s = cleanChunk(chunk);
  if (!s) return { location: '', rest: '' };

  const re = new RegExp(
    String.raw`^(\d{1,6}\s+[A-Z0-9#.'\-\/\s]+?(?:${STREET_SUFFIX})\b(?:\s+(?:NE|NW|SE|SW|N|S|E|W))?` +
      String.raw`(?:,?\s*#?[A-Z0-9-]{1,6})?` +
      String.raw`(?:[,.]?\s*G(?:AINESVILLE|AINESVIL|AINES|AIN|A)?)?` +
      String.raw`(?:,?\s*G(?:A)?)?)`,
    'i'
  );
  const m = s.match(re);
  if (m) {
    const loc = normalizeLocation(m[1]);
    const rest = cleanChunk(s.slice(m[0].length));
    return { location: loc, rest };
  }

  // Fallback: house number + words until description-ish lowercase or known field
  const m2 = s.match(
    /^(\d{1,6}\s+[A-Z][A-Za-z0-9#.'\-\/\s]{2,60}?)(?=\s+(?:tall|trash|warning|online|government|code\s+officer|closed|open|\d{1,2}\/)|$)/i
  );
  if (m2 && /\d{1,6}\s+[A-Za-z]/.test(m2[1])) {
    return {
      location: normalizeLocation(m2[1]),
      rest: cleanChunk(s.slice(m2[0].length))
    };
  }

  return { location: '', rest: s };
}

function normalizeStatus(raw) {
  let s = normalizeSpace(raw);
  if (!s) return '';
  s = s.replace(/\s*[-–]\s*/g, ' - ');
  if (/closed/i.test(s) && /duplicate/i.test(s)) return 'Closed - Duplicate';
  if (/closed/i.test(s) && /abat/i.test(s)) return 'Closed - Violation Abated';
  // OCR often truncates "Corrected" → "Correc" / "Correcte"
  if (/closed/i.test(s) && /correc/i.test(s)) return 'Closed - Violation Corrected';
  if (/^open/i.test(s)) return 'Open';
  if (/^closed/i.test(s)) return 'Closed';
  return s;
}

function extractStatus(text) {
  const m = String(text || '').match(STATUS_RE);
  if (!m) {
    // Truncated OCR: "Closed - Violation Correc" without word boundary end
    const soft = String(text || '').match(
      /\bClosed\s*[-–]?\s*Violation\s+Correc\w*/i
    );
    if (soft) return normalizeStatus(soft[0]);
    const soft2 = String(text || '').match(/\bClosed\s*[-–]?\s*Duplicate\b/i);
    if (soft2) return normalizeStatus(soft2[0]);
    return '';
  }
  return normalizeStatus(m[1]);
}

function extractComplainant(text) {
  const m = String(text || '').match(COMPLAINANT_RE);
  if (!m) return '';
  const s = normalizeSpace(m[1]);
  if (/code\s+officer/i.test(s)) return 'Code Officer Initiated';
  if (/government/i.test(s)) return 'Government Official';
  if (/citizen/i.test(s)) return 'Citizen Complaint';
  if (/anonymous/i.test(s)) return 'Anonymous';
  return s;
}

/**
 * Dates on the case row only — ignore report header range "From 6/8/2026 to 7/8/2026".
 */
function extractDates(text) {
  const s = String(text || '');
  // Remove common header range so it is not picked as Open Date
  const cleaned = s.replace(
    /From\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+to\s+\d{1,2}\/\d{1,2}\/\d{2,4}/gi,
    ' '
  );
  const dates = [];
  const re = new RegExp(DATE_RE.source, 'g');
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    // Skip obvious OCR junk like 6/111.
    const parts = m[1].split('/');
    const month = Number(parts[0]);
    const day = Number(parts[1]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    dates.push(m[1]);
  }
  return {
    openDate: dates[0] || '',
    lastStatusDate: dates[1] || ''
  };
}

/**
 * Description is the free-text middle after location, minus known fields.
 */
function extractDescription(rest, sectionType) {
  let s = cleanChunk(rest);
  if (!s) return sectionType || '';

  s = s
    .replace(STATUS_RE, ' ')
    .replace(/\bClosed\s*[-–]?\s*Violation\s+Correc\w*/gi, ' ')
    .replace(/\bjosed\s*[-–]?\s*Violation\s+Correc\w*/gi, ' ')
    .replace(/\bViolation\s+Corrected\b/gi, ' ')
    .replace(COMPLAINANT_RE, ' ')
    .replace(DATE_RE, ' ')
    .replace(JUNK_DESC_RE, ' ')
    .replace(/\bTALL\s+GRASS\b/gi, ' ')
    .replace(/\b[01]\s+[01]\b/g, ' ')
    .replace(/\b\d+\s*$/g, ' ')
    .replace(/^[,.\-\s]+/, '')
    .replace(/^(?:and\s+)/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Re-attach common incomplete starts
  if (/^trash\s+on\s+property/i.test(s) && sectionType) {
    s = `${sectionType.charAt(0)}${sectionType.slice(1).toLowerCase()} and ${s}`;
  }

  // Prefer the more natural sentence portion when OCR duplicated address start
  // e.g. "3182 Heritage Glen, warning left on door for tall grass..."
  const lowerStart = s.match(/\b(\d{1,6}\s+[A-Z][a-z][\s\S]{8,})$/);
  if (lowerStart && lowerStart[1].length >= 12 && lowerStart[1].length < s.length) {
    s = normalizeSpace(lowerStart[1]);
  }

  // Cap runaway descriptions that absorbed the next redacted row / page header
  if (s.length > 220) {
    // Keep first clause-ish chunk
    const cut = s.slice(0, 220);
    const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf(';'), cut.lastIndexOf(','));
    s = lastStop > 40 ? cut.slice(0, lastStop) : cut;
    s = normalizeSpace(s);
  }

  // Drop leftover single-char crumbs and city fragments that bled from Location
  s = s
    .replace(/\b[A-Z]\b(?!\w)/g, ' ')
    .replace(/^(?:VILLE|GAINESVILLE|GA)\b[,.\s]*/i, '')
    .replace(/^(?:and\s+trash|tall\s+grass)\b/i, (m) => m) // keep real starts
    .replace(/\s+/g, ' ')
    .trim();

  // OCR often leaves only status crumbs or city tails in the description slot
  const junkOnly =
    !s ||
    s.length < 6 ||
    /^(closed|open|ville|ga|ga\s*,?|,\s*\(?\s*)$/i.test(s) ||
    /^(closed\s*[-–]?\s*violation)/i.test(s) ||
    !/[A-Za-z]{4,}/.test(s);

  if (junkOnly) {
    if (sectionType) return sectionType.charAt(0) + sectionType.slice(1).toLowerCase();
    return '';
  }

  // Title-case section labels used as short descriptions
  if (sectionType && new RegExp(`^${sectionType}$`, 'i').test(s)) {
    return sectionType
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Prefer short clean labels over long glued garbage
  if (/^tall\s+grass\b/i.test(s)) {
    const restOf = s.replace(/^tall\s+grass\b/i, '').trim();
    if (!restOf || restOf.length < 8) return 'Tall grass';
  }

  return s;
}

/**
 * Walk OCR text and emit AOA rows.
 * @returns {{ aoa: string[][], rowCount: number, redactedSkipped: number }|null}
 */
function extractEnforcementDetailAoa(text) {
  const raw = String(text || '');
  if (!looksLikeEnforcementDetail(raw)) return null;

  // Normalize weird OCR record-id spacing up front for split stability
  const normalized = raw
    .replace(/\bGENF\s*[-–]?\s*(\d{2})\s*[-–]?\s*(\d{3,5})\b/gi, (_, a, b) =>
      `GENF${a}-${b}`
    )
    .replace(/\r\n/g, '\n');

  // Track section type by scanning lines before each ID
  const lines = normalized.split('\n').map((l) => normalizeSpace(l));
  const sectionAtOffset = new Map();
  let currentSection = '';
  let offset = 0;
  for (const line of lines) {
    const bare = line.replace(/[^A-Za-z\s]/g, '').trim();
    if (SECTION_TYPE_RE.test(bare) || SECTION_TYPE_RE.test(line)) {
      currentSection = normalizeSpace(line).replace(/\s+/g, ' ').toUpperCase();
      if (/TALL\s*GRASS/i.test(currentSection)) currentSection = 'TALL GRASS';
      else if (/HIGH\s*GRASS/i.test(currentSection)) currentSection = 'HIGH GRASS';
      else if (/^TRASH$/i.test(currentSection)) currentSection = 'TRASH';
    }
    sectionAtOffset.set(offset, currentSection);
    offset += line.length + 1;
  }

  function sectionForIndex(idx) {
    let best = '';
    for (const [off, sec] of sectionAtOffset) {
      if (off <= idx) best = sec;
      else break;
    }
    if (!best) {
      const window = normalized.slice(Math.max(0, idx - 400), idx);
      if (/TALL\s+GRASS/i.test(window)) return 'TALL GRASS';
      if (/\bTRASH\b/i.test(window)) return 'TRASH';
    }
    return best;
  }

  const matches = [];
  const idRe = /\bGENF(\d{2})-(\d{3,5})\b/g;
  let m;
  while ((m = idRe.exec(normalized)) !== null) {
    matches.push({
      id: normalizeRecordId(m[1], m[2]),
      index: m.index,
      end: m.index + m[0].length
    });
  }

  if (matches.length < 2) return null;

  const rows = [];
  const seen = new Set();
  let redactedSkipped = 0;

  for (let i = 0; i < matches.length; i += 1) {
    const cur = matches[i];
    const nextStart =
      i + 1 < matches.length ? matches[i + 1].index : normalized.length;
    // Bound chunk so page-break banners between cases are less likely to bleed
    let chunk = normalized.slice(cur.end, nextStart);
    // If the next match is far (redacted gap / page header), cut at report banners
    const banner = chunk.search(
      /\b(?:Gainesville\s+Code\s+Enforcement|Enforcement\s+Cases\s+Detail\s+By\s+Violation|TOTAL\s+(?:TRASH|TALL\s+GRASS|VIOLATIONS))\b/i
    );
    if (banner > 40) chunk = chunk.slice(0, banner);

    const section = sectionForIndex(cur.index);
    const { location, rest } = extractLocation(chunk);
    if (!location || !/\d{1,6}\s+[A-Za-z]/.test(location)) {
      // Redaction often removes the location column entirely
      redactedSkipped += 1;
      continue;
    }

    const status = extractStatus(chunk);
    const complainant = extractComplainant(chunk);
    const { openDate, lastStatusDate } = extractDates(chunk);
    let description = extractDescription(rest, section);

    // If description is empty but section is Tall Grass / Trash, use that
    if (!description && section) {
      description = section
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Strip "Tall grass" bleed when section already captures type and desc is thin
    if (
      description &&
      section &&
      description.length < 24 &&
      new RegExp(`^${section}$`, 'i').test(description.replace(/\s+/g, ' '))
    ) {
      description = section
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Dedupe: same ID + normalized location (report reprints across sections)
    const key = `${cur.id}|${location.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
    if (seen.has(key)) {
      // Prefer the row with richer metadata when the same case appears in two sections
      const existingIdx = rows.findIndex(
        (r) =>
          r[0] === cur.id &&
          r[1].toUpperCase().replace(/[^A-Z0-9]/g, '') ===
            location.toUpperCase().replace(/[^A-Z0-9]/g, '')
      );
      if (existingIdx >= 0) {
        const existing = rows[existingIdx];
        const richer =
          (status && !existing[5] ? 1 : 0) +
          (complainant && !existing[4] ? 1 : 0) +
          (description.length > existing[2].length ? 1 : 0) +
          (openDate && !existing[6] ? 1 : 0);
        if (richer > 0) {
          rows[existingIdx] = [
            cur.id,
            location.length >= existing[1].length ? location : existing[1],
            description.length >= existing[2].length ? description : existing[2],
            section || existing[3],
            complainant || existing[4],
            status || existing[5],
            openDate || existing[6],
            lastStatusDate || existing[7]
          ];
        }
      }
      continue;
    }
    seen.add(key);

    rows.push([
      cur.id,
      location,
      description,
      section || '',
      complainant,
      status,
      openDate,
      lastStatusDate
    ]);
  }

  if (rows.length < 2) return null;

  return {
    aoa: [HEADERS, ...rows],
    rowCount: rows.length,
    redactedSkipped
  };
}

module.exports = {
  HEADERS,
  looksLikeEnforcementDetail,
  extractEnforcementDetailAoa,
  normalizeRecordId,
  normalizeLocation,
  extractLocation,
  extractStatus,
  extractComplainant
};
